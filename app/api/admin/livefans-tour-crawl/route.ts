import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'
const ARTIST_BATCH = 3
const MAX_NEW_TOURS = 2
const BACKFILL_PAGES = 2
const MAX_SETLISTS_PER_TOUR = 5  // 1ツアーあたりセトリ取得の上限
const BUDGET_MS = 40_000  // 40s で途中結果を返す（Vercel 60s 制限に余裕を持たせる）

type Budget = { exceeded: () => boolean }
function makeBudget(ms = BUDGET_MS): Budget {
  const deadline = Date.now() + ms
  return { exceeded: () => Date.now() >= deadline }
}

const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
}

const SORT_MAPS: Record<string, Record<string, string>> = {
  beck:      { '1':'2','2':'1' },
  hammett:   { '1':'4','4':'1','2':'3','3':'2','6':'5','5':'6' },
  blackmore: { '1':'3','3':'1','2':'5','5':'2','6':'4','4':'6' },
  white:     { '1':'6','6':'1','3':'5','5':'3','2':'4','4':'2' },
  may:       { '1':'3','3':'1','2':'6','6':'2','4':'5','5':'4' },
  johnson:   { '1':'4','4':'1','2':'8','8':'2','3':'10','10':'3' },
  harrison:  { '1':'9','9':'1','3':'5','5':'3','6':'8','8':'6' },
  young:     { '4':'2','2':'4','6':'8','8':'6','1':'10','10':'1' },
  rhoads:    { '2':'9','9':'2','3':'4','4':'3','6':'1','1':'6' },
  luke:      { '1':'6','6':'1','3':'7','7':'3','4':'5','5':'4' },
}

function buildSlToPosition(mode: string, total: number): Record<number, number> {
  const sort = SORT_MAPS[mode] ?? {}
  const slToPos: Record<number, number> = {}
  for (let b = 1; b <= total + 10; b++) {
    const slN = sort[String(b)] ? parseInt(sort[String(b)]) : b
    slToPos[slN] = b
  }
  return slToPos
}

async function scrapeSetlist(
  eventId: number,
): Promise<{ songs: { song_name: string; is_encore: boolean; order_num: number }[] }> {
  const url = `${BASE}/events/${eventId}`
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { songs: [] }
    const html = await res.text()
    const cookies = res.headers.get('set-cookie') ?? ''
    const $ = cheerio.load(html)

    let slToPos: Record<number, number> = {}
    const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
    if (ajaxMatch) {
      const legendRes = await fetch(`${BASE}/events/legend?${ajaxMatch[1]}`, {
        headers: { ...HEADERS, 'Referer': url, 'X-Requested-With': 'XMLHttpRequest', ...(cookies ? { 'Cookie': cookies } : {}) },
      }).catch(() => null)
      if (legendRes?.ok) {
        const modeM = (await legendRes.text()).match(/(?:rowNoRewrite|getSort)\(['"](\w+)['"]/)
        if (modeM) slToPos = buildSlToPosition(modeM[1], $('td.rnd').length)
      }
    }

    const rawEntries: { slN: number; song_name: string; is_encore: boolean }[] = []
    $('td.rnd').each((_, el) => {
      const td = $(el)
      const cls = td.attr('class') ?? ''
      const slM = cls.match(/\bsl(\d+)\b/)
      if (!slM) return
      const slN = parseInt(slM[1])
      const is_encore = !cls.includes('rnd2')
      const ttlEl = td.find('div.ttl')
      const ttlClone = ttlEl.clone()
      ttlClone.find('p.memo, .cmt').remove()
      const name = ttlEl.find('a').first().text().trim() || ttlClone.text().trim()
      if (!name || /^\d+$/.test(name) || /^EN\d*$/i.test(name) || /^[\u2014\u2013\u2012\u2010\uFF0D-]/.test(name)) return
      rawEntries.push({ slN, song_name: name, is_encore })
    })

    const songs = rawEntries
      .map(e => ({ ...e, sort_key: slToPos[e.slN] ?? e.slN }))
      .sort((a, b) => a.sort_key - b.sort_key)
      .map((e, i) => ({ song_name: e.song_name, is_encore: e.is_encore, order_num: i + 1 }))

    return { songs }
  } catch {
    return { songs: [] }
  }
}

type PageStat = { page: number; found: number; newCount: number; error: boolean }
type ScrapeResult = { eventIds: number[]; lastPage: number; pageStats: PageStat[] }

/**
 * アーティストの公演ページからイベントIDを収集
 * year: 'before'=過去, 'after'=今後, undefined=全て
 * earlyExit=true: 既知イベントだけのページで停止（新着チェック用）
 */
async function scrapeEventIds(
  livefansId: number,
  knownEventIds: Set<number>,
  opts: { startPage?: number; sort?: string; maxPages?: number; earlyExit?: boolean; year?: 'before' | 'after'; budget?: Budget },
): Promise<ScrapeResult> {
  const { startPage = 1, sort = 'e2', maxPages = 3, earlyExit = false, year, budget } = opts
  const result: number[] = []
  const seen = new Set<number>()
  let lastPage = startPage - 1
  const pageStats: PageStat[] = []

  for (let page = startPage; page < startPage + maxPages; page++) {
    if (budget?.exceeded()) { pageStats.push({ page, found: 0, newCount: 0, error: true }); break }
    try {
      const params = year
        ? `setlist=0&online=&year=${year}&sort=${sort}`
        : `sort=${sort}`
      const url = page === 1
        ? `${BASE}/search/artist/${livefansId}?${params}`
        : `${BASE}/search/artist/${livefansId}/page:${page}?${params}`
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) })
      if (!res.ok) { pageStats.push({ page, found: 0, newCount: 0, error: true }); break }

      const $ = cheerio.load(await res.text())
      let foundAny = false
      let pageNew = 0

      $('a[href*="/events/"]').each((_, el) => {
        const m = ($(el).attr('href') ?? '').match(/\/events\/(\d+)/)
        if (!m) return
        const id = parseInt(m[1])
        if (seen.has(id)) return
        seen.add(id)
        foundAny = true
        if (!knownEventIds.has(id)) {
          result.push(id)
          pageNew++
        }
      })

      pageStats.push({ page, found: seen.size, newCount: pageNew, error: false })
      if (!foundAny) break // ページが存在しない（終端に到達）
      lastPage = page
      if (earlyExit && pageNew === 0) break // 全て既知 → 以降も不要
      await new Promise(r => setTimeout(r, 250))
    } catch {
      pageStats.push({ page, found: 0, newCount: 0, error: true })
      break
    }
  }

  return { eventIds: result, lastPage, pageStats }
}

// イベントページからグループIDとグループ名、出演者数を取得
async function scrapeEventGroupId(
  eventId: number,
): Promise<{ groupId: number | null; groupName: string | null; performerCount: number }> {
  try {
    const res = await fetch(`${BASE}/events/${eventId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { groupId: null, groupName: null, performerCount: 1 }
    const html = await res.text()
    const $ = cheerio.load(html)
    let groupId: number | null = null
    let groupName: string | null = null
    $('a[href]').each((_, el) => {
      if (groupId) return
      const m = ($(el).attr('href') ?? '').match(/\/groups\/(\d+)/)
      if (m) {
        groupId = parseInt(m[1])
        const txt = $(el).text().trim()
        if (txt) groupName = txt
      }
    })

    // [出演] セクション内のアーティストリンクを数えて出演者数を把握
    let performerCount = 1
    const outEnIdx = html.indexOf('[出演]')
    if (outEnIdx !== -1) {
      const section = html.slice(outEnIdx, outEnIdx + 3000)
      const uniqueIds = new Set([...section.matchAll(/\/artists\/(\d+)/g)].map(m => m[1]))
      if (uniqueIds.size > 0) performerCount = uniqueIds.size
    }

    return { groupId, groupName, performerCount }
  } catch {
    return { groupId: null, groupName: null, performerCount: 1 }
  }
}

type GroupEvent = { eventId: number; date: string; venueName: string; startTime: string | null }

// グループページからツアー名と全公演リストを取得
// テーブル構造: td1=日付(イベントリンク) / td2=開演時刻 / td3=会場名
async function scrapeGroupPage(
  groupId: number,
): Promise<{ tourName: string | null; events: GroupEvent[] }> {
  try {
    const res = await fetch(`${BASE}/groups/${groupId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { tourName: null, events: [] }
    const html = await res.text()
    const $ = cheerio.load(html)

    const h1 = $('h1').first().text().trim()
    const titleRaw = $('title').text()
    const titleClean = titleRaw
      .replace(/\s*[-–|｜]\s*ライブ.*$/i, '')
      .replace(/\s*[-–|｜]\s*LiveFans.*$/i, '')
      .trim()
    const tourName = h1 || titleClean || null

    const events: GroupEvent[] = []
    const seen = new Set<number>()

    $('table tr').each((_, row) => {
      const rowEl = $(row)
      const link = rowEl.find('a[href*="/events/"]').first()
      if (!link.length) return

      const m = (link.attr('href') ?? '').match(/\/events\/(\d+)/)
      if (!m) return
      const eventId = parseInt(m[1])
      if (seen.has(eventId)) return

      const rowText = rowEl.text()
      const dateM = rowText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
      if (!dateM) return
      const date = `${dateM[1]}-${dateM[2]}-${dateM[3]}`

      let startTime: string | null = null
      let venueName = ''

      rowEl.find('td').each((_, cell) => {
        const text = $(cell).text().trim()
        if (!text) return
        if ($(cell).find('a[href*="/events/"]').length) return // 日付セルをスキップ
        if (/^\d{1,2}:\d{2}$/.test(text)) {
          // 開演時刻（例: 18:00）
          startTime = `${text}:00`
          return
        }
        if (!venueName && text.length >= 2 && !/^\d+$/.test(text)) {
          venueName = text.replace(/\s*[（(][^)）]{1,15}[)）]\s*$/, '').trim()
        }
      })

      seen.add(eventId)
      events.push({ eventId, date, venueName, startTime })
    })

    return { tourName, events }
  } catch {
    return { tourName: null, events: [] }
  }
}

// LiveFans のグループ名に付くアーティスト名プレフィックスを除去
// 例: "Hey! Say! JUMP -Hey! Say! JUMP DOME TOUR 2025" → "Hey! Say! JUMP DOME TOUR 2025"
function stripArtistPrefix(tourName: string, artistName: string): string {
  const escaped = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return tourName.replace(new RegExp(`^${escaped}\\s*[-ーー−–—]\\s*`, 'i'), '').trim()
}

// ツアー名を正規化してマッチングキーを生成
function normalizeTourKey(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

type TourResult = { id: string | null; name: string; artist_name: string; concerts_added: number; setlists_added: number; is_new: boolean }

async function processNewEvents(
  admin: ReturnType<typeof createAdminClient>,
  artist: { id: string; livefans_id: number; name: string },
  newEventIds: number[],
  knownEventIds: Set<number>,
  tourByGroupId: Map<number, string>,
  tourByNormalizedName: Map<string, string>,
  userId: string | null,
  log: string[],
  budget: Budget,
): Promise<{ tours_added: number; concerts_added: number; setlists_added: number; tour_results: TourResult[] }> {
  const processedGroupIds = new Set<number>(tourByGroupId.keys())
  const processedEventIds = new Set<number>(knownEventIds)
  let tours_added = 0
  let concerts_added = 0
  let setlists_added = 0
  const tour_results: TourResult[] = []
  let newToursThisArtist = 0
  const today = new Date().toISOString().split('T')[0]

  for (const eventId of newEventIds) {
    if (processedEventIds.has(eventId)) continue
    if (newToursThisArtist >= MAX_NEW_TOURS) break
    if (budget.exceeded()) { log.push(`  時間制限により残りイベントをスキップ`); break }

    const { groupId, groupName, performerCount } = await scrapeEventGroupId(eventId)
    processedEventIds.add(eventId)
    await new Promise(r => setTimeout(r, 250))
    if (budget.exceeded()) { log.push(`  時間制限により残りイベントをスキップ`); break }

    // 対バン・フェス（出演者2名以上）はスキップ
    if (performerCount > 1) {
      log.push(`  event:${eventId} → performers=${performerCount} → スキップ（対バン/フェス）`)
      continue
    }

    if (!groupId) {
      log.push(`  event:${eventId} → groupId なし → スキップ（単発公演）`)
      continue
    }
    if (processedGroupIds.has(groupId)) continue
    processedGroupIds.add(groupId)

    if (budget.exceeded()) { log.push(`  時間制限によりグループ取得をスキップ`); break }

    const { tourName, events: groupEvents } = await scrapeGroupPage(groupId)
    await new Promise(r => setTimeout(r, 250))
    if (budget.exceeded()) { log.push(`  時間制限により公演処理をスキップ`); break }

    if (!groupEvents.length) {
      log.push(`  group:${groupId} → 公演リスト取得失敗 → スキップ`)
      continue
    }

    let tourId: string | null = tourByGroupId.get(groupId) ?? null
    const rawTourName = tourName || groupName
    if (!rawTourName) {
      log.push(`  group:${groupId} → ツアー名なし → スキップ`)
      continue
    }
    // カンマ区切りで複数アーティストが列挙されている場合はフェス/音楽番組出演 → スキップ
    if (rawTourName.split(',').length > 3) {
      log.push(`  group:${groupId}「${rawTourName}」→ カンマ区切り多数 → スキップ`)
      continue
    }

    // アーティスト名プレフィックスを除去して正規ツアー名にする
    const finalTourName = stripArtistPrefix(rawTourName, artist.name)

    let isNewTour = false
    if (!tourId) {
      // 正規化名で既存ツアーと照合（手動登録済みツアーとの重複防止）
      const normalizedKey = normalizeTourKey(finalTourName)
      const existingTourId = tourByNormalizedName.get(normalizedKey)

      if (existingTourId) {
        // 既存ツアーに livefans_group_id を後付けして紐付け
        tourId = existingTourId
        tourByGroupId.set(groupId, tourId)
        tourByNormalizedName.set(normalizedKey, tourId)
        await admin.from('tours').update({ livefans_group_id: groupId }).eq('id', tourId)
        log.push(`  group:${groupId}「${finalTourName}」→ 既存ツアーに紐付け (${groupEvents.length}公演)`)
      } else {
        const { data: newTour } = await admin
          .from('tours')
          .insert({ artist_id: artist.id, name: finalTourName, livefans_group_id: groupId })
          .select('id')
          .single()

        if (!newTour) { log.push(`  group:${groupId}「${finalTourName}」→ ツアー作成失敗`); continue }
        tourId = newTour.id
        log.push(`  group:${groupId}「${finalTourName}」→ 新規ツアー作成 (${groupEvents.length}公演)`)
        tourByGroupId.set(groupId, tourId)
        tourByNormalizedName.set(normalizedKey, tourId)
        tours_added++
        newToursThisArtist++
        isNewTour = true
        await (admin as any).from('tour_artists').insert({ tour_id: newTour.id, artist_id: artist.id, order_num: 0 })
      }
    }

    let tourConcerts = 0
    let tourSetlists = 0
    let setlistFetches = 0

    // 過去の公演を新しい順に並べてセトリ取得の優先度を上げる
    const sortedEvents = [...groupEvents].sort((a, b) => b.date.localeCompare(a.date))

    for (const ev of sortedEvents) {
      processedEventIds.add(ev.eventId)
      if (knownEventIds.has(ev.eventId)) {
        // 既存公演で tour_id が未設定の場合はこのツアーにひも付ける
        await admin
          .from('concerts')
          .update({ tour_id: tourId })
          .eq('livefans_event_id', ev.eventId)
          .is('tour_id', null)
        continue
      }

      // livefans_event_id なしで同日付の既存公演を確認（CSV手動インポート分との重複防止）
      const { data: existingByDate } = await admin
        .from('concerts')
        .select('id')
        .eq('artist_id', artist.id)
        .eq('date', ev.date)
        .is('livefans_event_id', null)
        .limit(1)
        .maybeSingle()

      if (existingByDate) {
        await admin
          .from('concerts')
          .update({
            livefans_event_id: ev.eventId,
            tour_id: tourId,
            ...(ev.startTime ? { start_time: ev.startTime } : {}),
          })
          .eq('id', existingByDate.id)
        knownEventIds.add(ev.eventId)
        log.push(`    ${ev.date} ${ev.venueName || '?'} → 既存公演に紐付け`)
        continue
      }

      const { data: newConcert, error: cErr } = await admin.from('concerts').insert({
        artist_id: artist.id,
        tour_id: tourId,
        venue_name: ev.venueName || '未定',
        date: ev.date,
        start_time: ev.startTime,
        livefans_event_id: ev.eventId,
      }).select('id').single()

      if (cErr || !newConcert) {
        log.push(`    ${ev.date} ${ev.venueName || '?'} → 登録失敗: ${cErr?.message ?? 'unknown'}`)
      }
      if (!cErr && newConcert) {
        concerts_added++
        tourConcerts++
        knownEventIds.add(ev.eventId)
        log.push(`    ${ev.date} ${ev.venueName || '?'} → 新規登録`)

        // 過去の公演 & userId あり & 上限内 & 時間内 → セトリ取得
        if (userId && ev.date < today && setlistFetches < MAX_SETLISTS_PER_TOUR && !budget.exceeded()) {
          setlistFetches++
          await new Promise(r => setTimeout(r, 250))
          const { songs } = await scrapeSetlist(ev.eventId)
          if (songs.length > 0) {
            const { data: sub } = await admin
              .from('setlist_submissions')
              .insert({ concert_id: newConcert.id, user_id: userId })
              .select('id').single()
            if (sub) {
              await admin.from('setlist_songs').insert(
                songs.map(s => ({
                  concert_id: newConcert.id,
                  submission_id: sub.id,
                  user_id: userId,
                  song_name: s.song_name,
                  song_type: 'song',
                  is_encore: s.is_encore,
                  order_num: s.order_num,
                }))
              )
              tourSetlists++
              setlists_added++
            }
          }
        }
      }
    }

    if (tourConcerts > 0 || isNewTour) {
      tour_results.push({ id: tourId, name: finalTourName ?? `group:${groupId}`, artist_name: artist.name, concerts_added: tourConcerts, setlists_added: tourSetlists, is_new: isNewTour })
    }
  }

  return { tours_added, concerts_added, setlists_added, tour_results }
}

async function runTourCrawl(
  artistIds?: string[],
  batch = ARTIST_BATCH,
  userId: string | null = null,
  mode: 'past' | 'future' | 'both' = 'both',
): Promise<NextResponse> {
  const admin = createAdminClient()

  // livefans_last_crawled_at の古い順（未クロール優先）でアーティストを選択
  let query = admin
    .from('artists')
    .select('id, name, livefans_id, livefans_crawl_page')
    .not('livefans_id', 'is', null)
    .order('livefans_last_crawled_at', { ascending: true, nullsFirst: true })
  if (artistIds?.length) query = query.in('id', artistIds)
  const { data: artists, error } = await query.limit(batch)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!artists?.length) return NextResponse.json({ message: '対象アーティストなし', tours_added: 0, concerts_added: 0 })

  let total_tours = 0
  let total_concerts = 0
  let total_setlists = 0
  const log: string[] = []
  const all_tour_results: TourResult[] = []
  const budget = makeBudget()

  for (const artist of artists) {
    if (budget.exceeded()) { log.push('時間制限により残りアーティストをスキップ'); break }
    if (!artist.livefans_id) continue

    // 既存公演の livefans_event_id を全取得
    const { data: existingConcerts } = await admin
      .from('concerts')
      .select('livefans_event_id')
      .eq('artist_id', artist.id)
      .not('livefans_event_id', 'is', null)

    const knownEventIds = new Set<number>(
      (existingConcerts ?? [])
        .map(c => c.livefans_event_id)
        .filter((v): v is number => v !== null),
    )

    // 既存ツアーを全件取得（group_id なし含む）
    const { data: existingTours } = await admin
      .from('tours')
      .select('id, name, livefans_group_id')
      .eq('artist_id', artist.id)

    // livefans_group_id → tour_id マップ
    const tourByGroupId = new Map<number, string>(
      (existingTours ?? [])
        .filter((t): t is typeof t & { livefans_group_id: number } => t.livefans_group_id != null)
        .map(t => [t.livefans_group_id, t.id]),
    )

    // 正規化ツアー名 → tour_id マップ（アーティスト名プレフィックス除去済み）
    const tourByNormalizedName = new Map<string, string>(
      (existingTours ?? []).map(t => [normalizeTourKey(stripArtistPrefix(t.name, artist.name)), t.id]),
    )

    let allNewIds: number[] = []
    let newCursorPage = artist.livefans_crawl_page ?? 0
    let backfillStart = newCursorPage + 1

    log.push(`${artist.name} (livefans:${artist.livefans_id})`)

    // 今後の公演モード（year=after, sort=e2 近い順, ページ1-2, 既知で即停止）
    if (mode === 'future' || mode === 'both') {
      const { eventIds: futureIds, pageStats } = await scrapeEventIds(
        artist.livefans_id, knownEventIds,
        { startPage: 1, sort: 'e2', maxPages: 2, earlyExit: true, year: 'after', budget },
      )
      for (const s of pageStats) {
        log.push(`  [今後] p${s.page}: ${s.error ? 'フェッチ失敗' : `${s.found}件取得 / ${s.newCount}件新規`}`)
      }
      allNewIds.push(...futureIds)
      await new Promise(r => setTimeout(r, 250))
    }

    // 過去の公演モード（year=before, sort=e1 新しい順, カーソルから進める）
    if (mode === 'past' || mode === 'both') {
      const { eventIds: pastIds, lastPage, pageStats } = await scrapeEventIds(
        artist.livefans_id, knownEventIds,
        { startPage: backfillStart, sort: 'e1', maxPages: BACKFILL_PAGES, earlyExit: false, year: 'before', budget },
      )
      for (const s of pageStats) {
        log.push(`  [過去] p${s.page}: ${s.error ? 'フェッチ失敗' : `${s.found}件取得 / ${s.newCount}件新規`}`)
      }
      allNewIds.push(...pastIds)
      newCursorPage = lastPage
      await new Promise(r => setTimeout(r, 250))
    }

    // 重複除去
    allNewIds = [...new Set(allNewIds)]

    if (allNewIds.length === 0) log.push(`  新規イベントなし`)

    const { tours_added, concerts_added, setlists_added, tour_results } = await processNewEvents(
      admin, { id: artist.id, livefans_id: artist.livefans_id!, name: artist.name }, allNewIds, knownEventIds, tourByGroupId, tourByNormalizedName, userId, log, budget,
    )

    total_tours += tours_added
    total_concerts += concerts_added
    total_setlists += setlists_added
    all_tour_results.push(...tour_results)

    // カーソルと最終クロール日時を更新
    const updatePayload: Record<string, unknown> = {
      livefans_last_crawled_at: new Date().toISOString(),
    }
    if ((mode === 'past' || mode === 'both') && newCursorPage >= backfillStart) {
      updatePayload.livefans_crawl_page = newCursorPage
    }
    await admin.from('artists').update(updatePayload).eq('id', artist.id)

    const modeLabel = mode === 'future' ? '今後' : mode === 'past' ? `過去[p${backfillStart}→${newCursorPage}]` : `両方[p${backfillStart}→${newCursorPage}]`
    log.push(`  [${modeLabel}] 完了 → ツアー+${tours_added} 公演+${concerts_added} セトリ+${setlists_added}`)

    await new Promise(r => setTimeout(r, 250))
  }

  return NextResponse.json({
    tours_added: total_tours,
    concerts_added: total_concerts,
    setlists_added: total_setlists,
    crawled: artists.length,
    log,
    new_tours: all_tour_results.filter(t => t.is_new),
    message: `${artists.length}アーティストをクロール。ツアー ${total_tours}件、公演 ${total_concerts}件、セトリ ${total_setlists}件を追加。`,
  })
}

// Vercel Cron からの自動実行（両方のモード）
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runTourCrawl(undefined, ARTIST_BATCH, null, 'both')
}

// 管理画面からの手動実行（1アーティストのみ・セトリあり）
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const body = await req.json().catch(() => ({}))
    const mode: 'past' | 'future' | 'both' = body.mode ?? 'both'
    return runTourCrawl(body.artist_ids, 1, user?.id ?? null, mode)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
