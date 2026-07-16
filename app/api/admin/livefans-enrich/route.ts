import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'
const BATCH = 8

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

type EventDetail = {
  venue_name: string | null
  start_time: string | null
  songs: { song_name: string; is_encore: boolean; order_num: number }[]
}

async function scrapeEventPage(eventId: number): Promise<EventDetail> {
  const empty: EventDetail = { venue_name: null, start_time: null, songs: [] }
  const url = `${BASE}/events/${eventId}`
  try {
    const mainRes = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
    if (!mainRes.ok) return empty

    const html = await mainRes.text()
    const cookies = mainRes.headers.get('set-cookie') ?? ''
    const $ = cheerio.load(html)

    let venue_name: string | null = null
    let start_time: string | null = null

    $('dt, th').each((_, el) => {
      const label = $(el).text().trim()
      const val = $(el).next('dd, td').text().trim()
      if (!val) return
      if (/日時|開催日|公演日/.test(label) && !start_time) {
        const tm = val.match(/(?:START|開演)[^\d]*(\d{1,2}):(\d{2})/i)
        if (tm) start_time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
      }
      if (/会場|場所/.test(label) && !venue_name) {
        venue_name = val.replace(/\s*[（(][^)）]*[)）].*$/, '').trim()
      }
    })

    if (!venue_name) {
      $('table tr').each((_, row) => {
        const cells = $(row).find('td, th')
        if (cells.length < 2) return
        const label = cells.first().text().trim()
        const val = cells.eq(1).text().trim()
        if (/日時|開催日|公演日/.test(label) && !start_time) {
          const tm = val.match(/(?:START|開演)[^\d]*(\d{1,2}):(\d{2})/i)
          if (tm) start_time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
        }
        if (/会場|場所/.test(label) && !venue_name) {
          venue_name = val.replace(/\s*[（(][^)）]*[)）].*$/, '').trim()
        }
      })
    }

    // セトリ取得
    let slToPos: Record<number, number> = {}
    const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
    if (ajaxMatch) {
      const legendRes = await fetch(`${BASE}/events/legend?${ajaxMatch[1]}`, {
        headers: { ...HEADERS, 'Referer': url, 'X-Requested-With': 'XMLHttpRequest', ...(cookies ? { 'Cookie': cookies } : {}) },
      }).catch(() => null)
      if (legendRes?.ok) {
        const legendText = await legendRes.text()
        const modeM = legendText.match(/(?:rowNoRewrite|getSort)\(['"](\w+)['"]/)
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

    return { venue_name, start_time, songs }
  } catch {
    return empty
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { artist_id, mode = 'venue' } = body
    // mode: 'venue' = 会場・時刻補完、'setlist' = セトリ補完（過去公演のみ）

    const admin = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    let query = admin
      .from('concerts')
      .select('id, livefans_event_id, venue_name, start_time, date, artists(name), tours(name)')
      .not('livefans_event_id', 'is', null)
      .order('date', { ascending: false })
      .limit(50)

    if (artist_id) query = query.eq('artist_id', artist_id)
    // セトリ補完は過去の公演のみ対象
    if (mode === 'setlist') query = query.lt('date', today)

    const { data: allConcerts, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!allConcerts?.length) return NextResponse.json({ updated: 0, setlists_added: 0, message: '補完対象なし' })

    // セトリ補完モードの場合のみ既存セトリを確認
    const allIds = allConcerts.map(c => c.id)
    let hasSetlist = new Set<string>()
    if (mode === 'setlist') {
      const { data: existingSubs } = await admin
        .from('setlist_submissions')
        .select('concert_id')
        .in('concert_id', allIds)
      hasSetlist = new Set((existingSubs ?? []).map(s => s.concert_id))
    }

    // モード別フィルタ
    const concerts = allConcerts
      .filter(c =>
        mode === 'venue'
          ? c.venue_name === '未定' || !c.start_time
          : !hasSetlist.has(c.id)
      )
      .slice(0, BATCH)

    if (!concerts.length) return NextResponse.json({ updated: 0, setlists_added: 0, message: '補完対象なし' })

    let updated = 0
    let setlists_added = 0
    const log: string[] = []

    for (const concert of concerts) {
      if (!concert.livefans_event_id) continue

      const artistName = (concert.artists as any)?.name ?? '不明'
      const tourName = (concert.tours as any)?.name ?? ''
      const label = `${artistName}「${tourName}」${concert.date}`

      const detail = await scrapeEventPage(concert.livefans_event_id)
      await new Promise(r => setTimeout(r, 300))

      const changes: string[] = []

      if (mode === 'venue') {
        // 会場・時刻のみ更新
        const patch: Record<string, string | null> = {}
        if (detail.venue_name && concert.venue_name === '未定') {
          patch.venue_name = detail.venue_name
          changes.push(`会場→${detail.venue_name}`)
        }
        if (detail.start_time && !concert.start_time) {
          patch.start_time = detail.start_time
          changes.push(`時刻→${detail.start_time}`)
        }
        if (Object.keys(patch).length > 0) {
          await admin.from('concerts').update(patch).eq('id', concert.id)
          updated++
        }
      } else {
        // セトリのみ登録
        if (detail.songs.length > 0) {
          const { data: sub } = await admin
            .from('setlist_submissions')
            .insert({ concert_id: concert.id, user_id: user.id })
            .select('id')
            .single()

          if (sub) {
            await admin.from('setlist_songs').insert(
              detail.songs.map(s => ({
                concert_id: concert.id,
                submission_id: sub.id,
                user_id: user.id,
                song_name: s.song_name,
                song_type: 'song',
                is_encore: s.is_encore,
                order_num: s.order_num,
              }))
            )
            setlists_added++
            changes.push(`セトリ${detail.songs.length}曲`)
          }
        } else {
          changes.push('セトリなし(LiveFans未登録)')
        }
      }

      log.push(`${label} @ ${concert.venue_name}: ${changes.length ? changes.join(', ') : 'スキップ'}`)
    }

    const modeLabel = mode === 'venue' ? '会場/時刻' : 'セトリ'
    return NextResponse.json({
      updated,
      setlists_added,
      checked: concerts.length,
      log,
      message: mode === 'venue'
        ? `${concerts.length}件チェック。${modeLabel} ${updated}件更新。`
        : `${concerts.length}件チェック。${modeLabel} ${setlists_added}件追加。`,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// GET: Vercel Cron から呼ばれる（セトリ補完）
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  // adminユーザーIDを取得
  const { data: adminProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .limit(1)
    .single()
  if (!adminProfile) return NextResponse.json({ error: 'No admin user found' }, { status: 500 })
  const userId = adminProfile.id

  const { data: allConcerts } = await admin
    .from('concerts')
    .select('id, livefans_event_id, venue_name, start_time, date, artists(name), tours(name)')
    .not('livefans_event_id', 'is', null)
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(50)

  if (!allConcerts?.length) return NextResponse.json({ setlists_added: 0, message: '補完対象なし' })

  const allIds = allConcerts.map(c => c.id)
  const { data: existingSubs } = await admin
    .from('setlist_submissions')
    .select('concert_id')
    .in('concert_id', allIds)
  const hasSetlist = new Set((existingSubs ?? []).map(s => s.concert_id))

  const concerts = allConcerts.filter(c => !hasSetlist.has(c.id)).slice(0, BATCH)
  if (!concerts.length) return NextResponse.json({ setlists_added: 0, message: '補完対象なし' })

  let setlists_added = 0
  const log: string[] = []

  for (const concert of concerts) {
    if (!concert.livefans_event_id) continue
    const artistName = (concert.artists as any)?.name ?? '不明'
    const detail = await scrapeEventPage(concert.livefans_event_id)
    await new Promise(r => setTimeout(r, 300))

    if (detail.songs.length > 0) {
      const { data: sub } = await admin
        .from('setlist_submissions')
        .insert({ concert_id: concert.id, user_id: userId })
        .select('id')
        .single()
      if (sub) {
        await admin.from('setlist_songs').insert(
          detail.songs.map(s => ({
            submission_id: sub.id,
            concert_id: concert.id,
            user_id: userId,
            song_name: s.song_name,
            song_type: 'song',
            is_encore: s.is_encore,
            order_num: s.order_num,
          }))
        )
        setlists_added++
        log.push(`${artistName} ${concert.date}: ${detail.songs.length}曲`)
      }
    }
  }

  return NextResponse.json({ setlists_added, checked: concerts.length, log, message: `${concerts.length}件チェック、セトリ${setlists_added}件追加` })
}
