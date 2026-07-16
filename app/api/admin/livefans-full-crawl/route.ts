import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'

const FETCH_HEADERS = {
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

// アーティストの検索ページからイベントIDだけを収集
async function scrapeArtistEventIds(livefansId: number): Promise<number[]> {
  const ids = new Set<number>()

  const urlGroups = [
    [
      `${BASE}/search/artist/${livefansId}?year=before`,
      `${BASE}/search/artist/${livefansId}/page:2?&year=before&sort=e1`,
      `${BASE}/search/artist/${livefansId}/page:3?&year=before&sort=e1`,
    ],
    [`${BASE}/search/artist/${livefansId}?year=after`],
  ]

  for (const urls of urlGroups) {
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12000) })
        if (!res.ok) break

        const html = await res.text()
        const $ = cheerio.load(html)
        let foundOnPage = false

        $('a[href*="/events/"]').each((_, el) => {
          const href = $(el).attr('href') ?? ''
          const m = href.match(/\/events\/(\d+)/)
          if (!m) return
          ids.add(parseInt(m[1]))
          foundOnPage = true
        })

        if (!foundOnPage) break
        await new Promise(r => setTimeout(r, 300))
      } catch {
        break
      }
    }
  }

  return [...ids]
}

type EventDetail = {
  event_date: string | null
  venue_name: string | null
  start_time: string | null
  livefans_group_id: number | null
  group_name: string | null
  songs: { song_name: string; is_encore: boolean; order_num: number }[]
}

// イベントページから日付・会場・ツアーリンク・セトリを取得
async function scrapeEventPage(eventId: number): Promise<EventDetail> {
  const empty: EventDetail = { event_date: null, venue_name: null, start_time: null, livefans_group_id: null, group_name: null, songs: [] }
  const url = `${BASE}/events/${eventId}`
  try {
    const mainRes = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(12000) })
    if (!mainRes.ok) return empty

    const html = await mainRes.text()
    const cookies = mainRes.headers.get('set-cookie') ?? ''
    const $ = cheerio.load(html)

    // 日付・会場・開演時刻を取得
    // 方法1: dl > dt/dd 構造
    let event_date: string | null = null
    let venue_name: string | null = null
    let start_time: string | null = null

    $('dt, th').each((_, el) => {
      const label = $(el).text().trim()
      const val = $(el).next('dd, td').text().trim()
      if (!val) return
      if (/日時|開催日|公演日/.test(label) && !event_date) {
        const dm = val.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/)
        if (dm) event_date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`
        const tm = val.match(/(?:START|開演)[^\d]*(\d{1,2}):(\d{2})/i)
        if (tm) start_time = `${tm[1].padStart(2,'0')}:${tm[2]}:00`
      }
      if (/会場|場所/.test(label) && !venue_name) {
        venue_name = val.replace(/\s*[（(][^)）]*[)）].*$/, '').trim()
      }
    })

    // 方法2: テーブル行
    if (!event_date) {
      $('table tr').each((_, row) => {
        const cells = $(row).find('td, th')
        if (cells.length < 2) return
        const label = cells.first().text().trim()
        const val = cells.eq(1).text().trim()
        if (/日時|開催日|公演日/.test(label) && !event_date) {
          const dm = val.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/)
          if (dm) event_date = `${dm[1]}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}`
          const tm = val.match(/(?:START|開演)[^\d]*(\d{1,2}):(\d{2})/i)
          if (tm) start_time = `${tm[1].padStart(2,'0')}:${tm[2]}:00`
        }
        if (/会場|場所/.test(label) && !venue_name) {
          venue_name = val.replace(/\s*[（(][^)）]*[)）].*$/, '').trim()
        }
      })
    }

    // 方法3: ページ内の最初の YYYY/MM/DD
    if (!event_date) {
      const bodyText = $('body').text()
      const dm = bodyText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
      if (dm) event_date = `${dm[1]}-${dm[2]}-${dm[3]}`
    }

    // ツアーリンク（/groups/{id}）を探す
    let livefans_group_id: number | null = null
    let group_name: string | null = null
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const m = href.match(/\/groups\/(\d+)/)
      if (m && !livefans_group_id) {
        livefans_group_id = parseInt(m[1])
        const txt = $(el).text().trim()
        if (txt) group_name = txt
      }
    })

    // セトリ取得
    let slToPos: Record<number, number> = {}
    const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
    if (ajaxMatch) {
      const legendUrl = `${BASE}/events/legend?${ajaxMatch[1]}`
      const legendRes = await fetch(legendUrl, {
        headers: {
          ...FETCH_HEADERS,
          'Referer': url,
          'X-Requested-With': 'XMLHttpRequest',
          ...(cookies ? { 'Cookie': cookies } : {}),
        },
      }).catch(() => null)

      if (legendRes?.ok) {
        const legendText = await legendRes.text()
        const modeM = legendText.match(/(?:rowNoRewrite|getSort)\(['"](\w+)['"]/)
        if (modeM) {
          slToPos = buildSlToPosition(modeM[1], $('td.rnd').length)
        }
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
      if (!name) return
      if (/^\d+$/.test(name)) return
      if (/^EN\d*$/i.test(name)) return
      if (/^[\u2014\u2013\u2012\u2010\uFF0D-]/.test(name)) return
      rawEntries.push({ slN, song_name: name, is_encore })
    })

    const songs = rawEntries
      .map(e => ({ ...e, sort_key: slToPos[e.slN] ?? e.slN }))
      .sort((a, b) => a.sort_key - b.sort_key)
      .map((e, i) => ({ song_name: e.song_name, is_encore: e.is_encore, order_num: i + 1 }))

    return { event_date, venue_name, start_time, livefans_group_id, group_name, songs }
  } catch {
    return empty
  }
}

// ツアーページからツアー名を取得
async function scrapeTourName(groupId: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/groups/${groupId}`, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()
    const $ = cheerio.load(html)
    return $('h1').first().text().trim() || $('title').text().replace(/\s*[-–]\s*LiveFans.*$/i, '').trim() || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { artist_id, max_events = 10 } = body
    if (!artist_id) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: artist } = await admin
      .from('artists')
      .select('id, name, livefans_id')
      .eq('id', artist_id)
      .single()
    if (!artist?.livefans_id) return NextResponse.json({ error: 'livefans_id が未設定です' }, { status: 400 })

    // アーティスト検索ページからイベントIDを収集
    const allEventIds = await scrapeArtistEventIds(artist.livefans_id)
    if (!allEventIds.length) {
      return NextResponse.json({ concerts_added: 0, setlists_added: 0, tours_added: 0, total_found: 0, message: '公演が見つかりませんでした' })
    }

    // 既に取込済みの livefans_event_id を除外
    const { data: existingConcerts } = await admin
      .from('concerts')
      .select('livefans_event_id')
      .in('livefans_event_id', allEventIds)

    const knownIds = new Set<number>((existingConcerts ?? []).map(c => c.livefans_event_id).filter((v): v is number => v !== null))
    const newEventIds = allEventIds.filter(id => !knownIds.has(id)).slice(0, max_events)

    if (!newEventIds.length) {
      return NextResponse.json({ concerts_added: 0, setlists_added: 0, tours_added: 0, total_found: allEventIds.length, message: `${allEventIds.length}件確認済み。新規公演はありません。` })
    }

    // ツアーキャッシュ: livefans_group_id → DB の tour_id
    const tourCache = new Map<number, string>()

    let concerts_added = 0
    let setlists_added = 0
    let tours_added = 0

    for (const eventId of newEventIds) {
      // イベントページから日付・会場・ツアー・セトリを取得
      const detail = await scrapeEventPage(eventId)

      if (!detail.event_date) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }

      // ツアーの解決
      let tour_id: string | null = null
      if (detail.livefans_group_id) {
        const gid = detail.livefans_group_id
        if (tourCache.has(gid)) {
          tour_id = tourCache.get(gid)!
        } else {
          const { data: existingTour } = await admin
            .from('tours')
            .select('id')
            .eq('livefans_group_id', gid)
            .maybeSingle()

          if (existingTour) {
            tour_id = existingTour.id
            tourCache.set(gid, tour_id)
          } else {
            const tourName = detail.group_name || await scrapeTourName(gid)
            if (tourName) {
              const { data: newTour } = await admin
                .from('tours')
                .insert({ artist_id: artist.id, name: tourName, livefans_group_id: gid })
                .select('id')
                .single()
              if (newTour) {
                tour_id = newTour.id
                tourCache.set(gid, newTour.id)
                tours_added++
                await (admin as any).from('tour_artists').insert({ tour_id: newTour.id, artist_id: artist.id, order_num: 0 })
              }
            }
          }
        }
      }

      // 公演を挿入
      const { data: newConcert, error: concertError } = await admin
        .from('concerts')
        .insert({
          artist_id: artist.id,
          tour_id,
          venue_name: detail.venue_name || '未定',
          date: detail.event_date,
          start_time: detail.start_time,
          livefans_event_id: eventId,
        })
        .select('id')
        .single()

      if (concertError || !newConcert) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      concerts_added++

      // セトリを挿入（曲がある場合のみ）
      if (detail.songs.length > 0) {
        const { data: sub } = await admin
          .from('setlist_submissions')
          .insert({ concert_id: newConcert.id, user_id: user.id })
          .select('id')
          .single()

        if (sub) {
          await admin.from('setlist_songs').insert(
            detail.songs.map(s => ({
              concert_id: newConcert.id,
              submission_id: sub.id,
              user_id: user.id,
              song_name: s.song_name,
              song_type: 'song',
              is_encore: s.is_encore,
              order_num: s.order_num,
            }))
          )
          setlists_added++
        }
      }

      await new Promise(r => setTimeout(r, 500))
    }

    return NextResponse.json({
      concerts_added,
      setlists_added,
      tours_added,
      total_found: allEventIds.length,
      message: `${allEventIds.length}件発見 → ${newEventIds.length}件処理。公演 ${concerts_added}件、ツアー ${tours_added}件、セトリ ${setlists_added}件を追加。`,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
