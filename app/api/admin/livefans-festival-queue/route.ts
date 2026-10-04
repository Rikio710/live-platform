import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'
const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.5',
}

type ArtistSlot = {
  artist_name: string
  date: string
  start_time: string | null
  stage_name: string | null
}

function parseDate(text: string): string | null {
  const slashM = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  const jaM = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  const hypM = text.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (slashM) return `${slashM[1]}-${slashM[2].padStart(2, '0')}-${slashM[3].padStart(2, '0')}`
  if (jaM) return `${jaM[1]}-${jaM[2].padStart(2, '0')}-${jaM[3].padStart(2, '0')}`
  if (hypM) return hypM[0]
  return null
}

// Phase 1: /groups/{id} からイベントIDリストを取得
async function scrapeGroupEditions(groupId: number): Promise<{
  seriesName: string | null
  eventIds: number[]
  fetchError: string | null
}> {
  try {
    const res = await fetch(`${BASE}/groups/${groupId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return { seriesName: null, eventIds: [], fetchError: `HTTP ${res.status}` }
    const html = await res.text()
    const $ = cheerio.load(html)

    const seriesName = $('h3.liveName').first().text().trim() || null

    const seen = new Set<number>()
    const eventIds: number[] = []

    $('table tr').each((_, row) => {
      const rowEl = $(row)
      const link = rowEl.find('a[href*="/events/"]').first()
      if (!link.length) return
      const m = (link.attr('href') ?? '').match(/\/events\/(\d+)/)
      if (!m) return
      const eventId = parseInt(m[1])
      if (seen.has(eventId)) return
      // 日付があることを確認（イベント行かどうかの判定）
      const date = parseDate(rowEl.text())
      if (!date) return
      seen.add(eventId)
      eventIds.push(eventId)
    })

    // tableで取れなかった場合フォールバック
    if (eventIds.length === 0) {
      $('a[href*="/events/"]').each((_, el) => {
        const href = $(el).attr('href') ?? ''
        const m = href.match(/\/events\/(\d+)/)
        if (!m) return
        const eventId = parseInt(m[1])
        if (seen.has(eventId)) return
        const parentText = $(el).closest('li, tr, div').text()
        const date = parseDate(parentText || $(el).text())
        if (!date) return
        seen.add(eventId)
        eventIds.push(eventId)
      })
    }

    return { seriesName, eventIds, fetchError: null }
  } catch (e) {
    return { seriesName: null, eventIds: [], fetchError: String(e) }
  }
}

// Phase 2: /events/{id} から1件分のデータを取得
async function scrapeYearEdition(eventId: number): Promise<{
  name: string | null
  venueName: string | null
  eventDate: string | null
  slots: ArtistSlot[]
  artistLivefansIds: Map<string, number>
  failReason: string
}> {
  const empty = { name: null, venueName: null, eventDate: null, slots: [], artistLivefansIds: new Map<string, number>(), failReason: '' }
  try {
    const res = await fetch(`${BASE}/events/${eventId}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) return { ...empty, failReason: `HTTP ${res.status}` }
    const html = await res.text()
    const $ = cheerio.load(html)

    // JSON-LD からイベント情報を事前取得（フォールバック用）
    let jsonldName: string | null = null
    let jsonldStartDate: string | null = null
    let jsonldPerformers: string[] = []
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text())
        if (!jsonldName && json.name) jsonldName = json.name
        if (!jsonldStartDate && json.startDate) jsonldStartDate = parseDate(json.startDate)
        if (jsonldPerformers.length === 0 && Array.isArray(json.performer)) {
          jsonldPerformers = (json.performer as { name?: string }[]).map(p => p.name ?? '').filter(Boolean)
        }
      } catch { /* skip */ }
    })

    const name =
      $('div.head h1').first().text().trim() ||
      jsonldName ||
      $('h3.liveName').first().text().trim() ||
      $('h1').first().text().trim() ||
      null

    const venueRaw = $('a.icoPlace').first().text().trim()
    const venueName = venueRaw
      ? venueRaw.replace(/^[@＠]\s*/, '').replace(/\s*[（(][^)）]*[)）]\s*$/, '').trim() || null
      : null

    // イベント日付（フォールバックスロット用）
    const eventDateRaw = ($('input[name="data[event][date]"]').val() as string ?? '').trim()
    const eventDate = parseDate(eventDateRaw) ?? jsonldStartDate ?? parseDate($('body').text())

    // ステージマップ
    const stageMap = new Map<string, string>()
    $('input[name^="data[event][stage_id_"]').each((_, el) => {
      const nameAttr = $(el).attr('name') ?? ''
      const m = nameAttr.match(/\[stage_id_(\d+)\]/)
      if (!m) return
      const n = m[1]
      const stageId = $(el).val() as string
      const stageName = ($(`input[name="data[event][stage_name_${n}]"]`).val() as string) ?? ''
      if (stageId && stageName) stageMap.set(stageId, stageName)
    })

    // アーティストスロット（hidden input形式）
    const slots: ArtistSlot[] = []
    $('input[name^="data[artist_name_"]').each((_, el) => {
      const nameAttr = $(el).attr('name') ?? ''
      const m = nameAttr.match(/\[artist_name_(\d+)\]/)
      if (!m) return
      const n = m[1]
      const artist_name = (($(el).val() as string) ?? '').trim()
      if (!artist_name) return
      const rawDate = ($(`input[name="data[artist_date_${n}]"]`).val() as string ?? '').trim()
      const rawTime = ($(`input[name="data[artist_time_${n}]"]`).val() as string ?? '').trim()
      const stgId = ($(`input[name="data[artist_stg_id_${n}]"]`).val() as string ?? '').trim()
      const date = parseDate(rawDate)
      if (!date) return
      const timeM = rawTime.match(/(\d{1,2}):(\d{2})/)
      const start_time = timeM ? `${timeM[1].padStart(2, '0')}:${timeM[2]}:00` : null
      const stage_name = stgId ? (stageMap.get(stgId) ?? null) : null
      slots.push({ artist_name, date, start_time, stage_name })
    })

    // p.mainArtist リンクから livefans_id 取得
    const artistLivefansIds = new Map<string, number>()
    $('p.mainArtist a[href*="/artists/"]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const m = href.match(/\/artists\/(\d+)/)
      const artistName = $(el).text().trim()
      if (m && artistName) artistLivefansIds.set(artistName, parseInt(m[1]))
    })

    // 古いページ: select#vote_options からスロットを復元
    // option テキスト形式: "アーティスト名 YYYY/MM/DD (曜) HH:MM 出演 @ ステージ名"
    if (slots.length === 0) {
      $('select#vote_options option').each((_, el) => {
        const text = $(el).text().trim()
        if (!text || text.includes('選択してください')) return
        const m = text.match(/^(.+?)\s+(\d{4}\/\d{1,2}\/\d{1,2})\s*(?:\([^)]*\))?\s+(\d{1,2}:\d{2})\s+出演\s+@\s+(.+)$/)
        if (!m) return
        const artist_name = m[1].trim()
        const date = parseDate(m[2])
        if (!date || !artist_name) return
        const timeM = m[3].match(/(\d{1,2}):(\d{2})/)
        const start_time = timeM ? `${timeM[1].padStart(2, '0')}:${timeM[2]}:00` : null
        const stage_name = m[4].trim() || null
        slots.push({ artist_name, date, start_time, stage_name })
      })
    }

    // 最古形式フォールバック: h3日付セクション + /events/ アーティストリンク構造
    // 例: <h3>2000-08-12</h3> <a href="/events/17519">AIR</a> <a href="/artists/2492">プロフィール</a>
    if (slots.length === 0) {
      $('h3').each((_, h3El) => {
        const sectionDate = parseDate($(h3El).text().trim())
        if (!sectionDate) return
        let sib = $(h3El).next()
        while (sib.length && !sib.is('h3')) {
          if (sib.is('a')) {
            const href = sib.attr('href') ?? ''
            const text = sib.text().trim()
            if (/\/events\/\d+/.test(href) && text && text !== 'セットリスト' && text !== 'プロフィール') {
              // 直後の /artists/ リンクから livefans_id を取得
              const profileHref = sib.nextAll('a[href*="/artists/"]').first().attr('href') ?? ''
              const idM = profileHref.match(/\/artists\/(\d+)/)
              if (idM) artistLivefansIds.set(text, parseInt(idM[1]))
              if (!slots.some(s => s.artist_name === text && s.date === sectionDate)) {
                slots.push({ artist_name: text, date: sectionDate, start_time: null, stage_name: null })
              }
            }
          }
          sib = sib.next()
        }
      })
    }

    // 第4フォールバック: JSON-LD performer配列（日付はstartDateのみ）
    if (slots.length === 0 && jsonldPerformers.length > 0 && eventDate) {
      for (const artistName of jsonldPerformers) {
        slots.push({ artist_name: artistName, date: eventDate, start_time: null, stage_name: null })
      }
      // 日付は startDate のみで per-artist 情報なし
    }

    return { name, venueName, eventDate, slots, artistLivefansIds, failReason: '' }
  } catch (e) {
    return { ...empty, failReason: String(e) }
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json().catch(() => ({}))
    const groupId: string | null = body.group_id ?? null

    const admin = createAdminClient()
    const log: string[] = []
    let total_events = 0
    let total_concerts = 0

    // 対象グループを1件取得
    let groupQuery = (admin as any)
      .from('festival_groups')
      .select('id, livefans_group_id, name, livefans_pending_event_ids')
      .not('livefans_group_id', 'is', null)

    if (groupId) {
      groupQuery = groupQuery.eq('id', groupId)
    } else {
      groupQuery = groupQuery.eq('crawl_status', 'pending').limit(1)
    }

    const { data: groups } = await groupQuery
    const group = groups?.[0]

    if (!group) {
      log.push('対象グループが見つかりませんでした')
      return NextResponse.json({ total_events, total_concerts, log, message: '対象グループなし', phase: 0 })
    }

    const pendingIds: number[] = group.livefans_pending_event_ids ?? []

    // ── Phase 1: グループページからイベントIDリストを取得してDBに保存 ──
    if (pendingIds.length === 0) {
      log.push(`[Phase 1] group:${group.livefans_group_id} (${group.name ?? '名前未取得'}) のイベントリスト取得中...`)

      const { seriesName, eventIds, fetchError } = await scrapeGroupEditions(group.livefans_group_id)

      if (fetchError) {
        log.push(`  → 取得失敗 (${fetchError}) → pending維持`)
        return NextResponse.json({ total_events, total_concerts, log, message: 'グループページ取得失敗', phase: 1 })
      }

      if (seriesName && !group.name) {
        await (admin as any).from('festival_groups').update({ name: seriesName }).eq('id', group.id)
      }

      if (eventIds.length === 0) {
        await (admin as any).from('festival_groups').update({ crawl_status: 'done' }).eq('id', group.id)
        log.push(`  → イベントなし → done`)
        return NextResponse.json({ total_events, total_concerts, log, message: 'イベントなし', phase: 1 })
      }

      // 既処理を除外
      const { data: processedRows } = await (admin as any)
        .from('festival_events')
        .select('livefans_event_id')
        .eq('group_id', group.id)
        .not('livefans_event_id', 'is', null)
      const processedSet = new Set<number>((processedRows ?? []).map((r: { livefans_event_id: number }) => r.livefans_event_id))
      const newIds = eventIds.filter(id => !processedSet.has(id))

      log.push(`  → ${eventIds.length}件検出、${newIds.length}件が未処理`)

      if (newIds.length === 0) {
        await (admin as any).from('festival_groups').update({ crawl_status: 'done', livefans_pending_event_ids: null }).eq('id', group.id)
        log.push(`  → 全て処理済み → done`)
      } else {
        await (admin as any).from('festival_groups').update({ livefans_pending_event_ids: newIds }).eq('id', group.id)
        log.push(`  → ${newIds.length}件をキューに保存。次回クロールでイベント処理を開始します。`)
      }

      return NextResponse.json({ total_events, total_concerts, log, message: `Phase 1完了 (${newIds.length}件キュー済み)`, phase: 1, queued: newIds.length })
    }

    // ── Phase 2: キューの先頭イベントを1件処理 ──
    const eventId = pendingIds[0]
    const remaining = pendingIds.slice(1)

    log.push(`[Phase 2] group:${group.livefans_group_id} (${group.name ?? '名前未取得'}) event:${eventId} 処理中... (残り${remaining.length}件)`)

    const { name, venueName, eventDate, slots, artistLivefansIds, failReason } = await scrapeYearEdition(eventId)

    // 処理結果に関わらずキューから削除（無限ループ防止）
    const updatePayload: Record<string, unknown> = {
      livefans_pending_event_ids: remaining.length > 0 ? remaining : null,
    }
    if (remaining.length === 0) updatePayload.crawl_status = 'done'

    if (!name) {
      log.push(`  event:${eventId} → タイトル取得失敗${failReason ? ` (${failReason})` : ''} → スキップ`)
      await (admin as any).from('festival_groups').update(updatePayload).eq('id', group.id)
      return NextResponse.json({ total_events, total_concerts, log, message: 'タイトル取得失敗', phase: 2, remaining: remaining.length })
    }

    // スロットが空 → フォールバック（eventDateがない場合はスキップ）
    let effectiveSlots = slots
    if (slots.length === 0 && artistLivefansIds.size > 0) {
      if (!eventDate) {
        log.push(`  ${name} → スロットなし・日付不明 → スキップ`)
        await (admin as any).from('festival_groups').update(updatePayload).eq('id', group.id)
        return NextResponse.json({ total_events, total_concerts, log, message: '日付不明スキップ', phase: 2, remaining: remaining.length })
      }
      effectiveSlots = [...artistLivefansIds.keys()].map(artist_name => ({
        artist_name, date: eventDate, start_time: null, stage_name: null,
      }))
      log.push(`  ${name} → スロットなし、mainArtistから${effectiveSlots.length}件フォールバック`)
    }

    if (effectiveSlots.length === 0) {
      log.push(`  ${name} → アーティスト情報なし → スキップ`)
      await (admin as any).from('festival_groups').update(updatePayload).eq('id', group.id)
      return NextResponse.json({ total_events, total_concerts, log, message: 'アーティスト情報なし', phase: 2, remaining: remaining.length })
    }

    const dates = [...new Set(effectiveSlots.map(s => s.date))].sort()

    // festival_events 取得 or 作成（livefans_event_id ベースでマッチング）
    const { data: existingFE } = await (admin as any)
      .from('festival_events')
      .select('id, name, venue_name, start_date, end_date, livefans_event_id')
      .eq('group_id', group.id)
      .eq('livefans_event_id', eventId)
      .maybeSingle()

    let festEventId: string
    if (existingFE) {
      festEventId = existingFE.id
      const updates: Record<string, unknown> = {}
      if (!existingFE.venue_name && venueName) updates.venue_name = venueName
      // start_date/end_date が間違っていれば修正
      if (existingFE.start_date !== dates[0]) updates.start_date = dates[0]
      const correctEnd = dates.length > 1 ? dates[dates.length - 1] : null
      if (existingFE.end_date !== correctEnd) updates.end_date = correctEnd
      if (Object.keys(updates).length > 0) await admin.from('festival_events').update(updates).eq('id', existingFE.id)
      log.push(`  ${name} → 既存 festival_events を使用`)
    } else {
      const { data: newFE, error: feErr } = await admin
        .from('festival_events')
        .insert({
          group_id: group.id, name,
          start_date: dates[0],
          end_date: dates.length > 1 ? dates[dates.length - 1] : null,
          venue_name: venueName ?? null,
          livefans_event_id: eventId,
        })
        .select('id').single()

      if (!newFE || feErr) {
        log.push(`  ${name} → festival_events 作成失敗: ${feErr?.message ?? 'unknown'}`)
        await (admin as any).from('festival_groups').update(updatePayload).eq('id', group.id)
        return NextResponse.json({ total_events, total_concerts, log, message: 'festival_events作成失敗', phase: 2, remaining: remaining.length })
      }
      festEventId = newFE.id
      total_events++
      log.push(`  ${name} → 新規作成 (${effectiveSlots.length}スロット)`)
    }

    // アーティストマッチング・作成（バッチ処理）
    const uniqueNames = [...new Set(effectiveSlots.map(s => s.artist_name))]
    const { data: dbArtists } = await admin.from('artists').select('id, name').in('name', uniqueNames)
    const nameToId = new Map<string, string>()
    for (const a of dbArtists ?? []) nameToId.set(a.name, a.id)

    const missingNames = uniqueNames.filter(n => !nameToId.has(n))
    let artists_created = 0
    if (missingNames.length > 0) {
      const toInsert = missingNames.map(artistName => ({ name: artistName }))
      const { data: newArtists } = await admin.from('artists').insert(toInsert).select('id, name')
      for (const a of newArtists ?? []) { nameToId.set(a.name, a.id); artists_created++ }

      // livefans_id がわかる新規アーティストを artist_livefans_ids に登録
      const lfInsertRows = (newArtists ?? [])
        .filter(a => artistLivefansIds.has(a.name))
        .map(a => ({ artist_id: a.id, livefans_id: artistLivefansIds.get(a.name)!, crawl_page: 0 }))
      if (lfInsertRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('artist_livefans_ids').upsert(lfInsertRows, { onConflict: 'livefans_id', ignoreDuplicates: true })
      }
    }

    // 公演作成（バッチ処理）
    // 既存公演を一括取得
    const artistIds = [...nameToId.values()]
    const { data: existingConcerts } = await admin.from('concerts')
      .select('artist_id, date')
      .eq('festival_event_id', festEventId)
      .in('artist_id', artistIds.length > 0 ? artistIds : ['__none__'])
    const existingSet = new Set<string>(
      (existingConcerts ?? []).map((c: { artist_id: string; date: string }) => `${c.artist_id}|${c.date}`)
    )

    const concertRows = effectiveSlots
      .map(slot => {
        const artistId = nameToId.get(slot.artist_name)
        if (!artistId) return null
        if (existingSet.has(`${artistId}|${slot.date}`)) return null
        return { artist_id: artistId, festival_event_id: festEventId, venue_name: venueName ?? name, date: slot.date, start_time: slot.start_time, stage_name: slot.stage_name, event_type: 'festival' as const }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    let concerts_added = 0
    if (concertRows.length > 0) {
      const { data: newConcerts } = await admin.from('concerts').insert(concertRows).select('id, artist_id')
      concerts_added = newConcerts?.length ?? 0
      total_concerts += concerts_added
      if (newConcerts && newConcerts.length > 0) {
        const caRows = newConcerts.map((c: { id: string; artist_id: string }) => ({ concert_id: c.id, artist_id: c.artist_id, order_num: 0 }))
        await (admin as any).from('concert_artists').upsert(caRows, { onConflict: 'concert_id,artist_id', ignoreDuplicates: true })
      }
    }

    log.push(`  ${name}: ${uniqueNames.length}アーティスト → 新規${artists_created}件 → ${concerts_added}公演追加`)
    if (remaining.length === 0) log.push(`  → 全イベント処理完了 → done`)
    else log.push(`  → 残り${remaining.length}件`)

    await (admin as any).from('festival_groups').update(updatePayload).eq('id', group.id)

    return NextResponse.json({
      total_events, total_concerts, log,
      message: `Phase 2完了: ${name} (残り${remaining.length}件)`,
      phase: 2, remaining: remaining.length,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
