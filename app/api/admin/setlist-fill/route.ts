import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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

type ParsedEntry = {
  sort_key: number
  song_name: string
  song_type: 'song' | 'mc' | 'other'
  is_encore: boolean
  memo: null
}

function parseSetlistHtml(html: string, slToPos: Record<number, number>): ParsedEntry[] {
  const $ = cheerio.load(html)

  type RawEntry = {
    slN: number
    song_name: string
    song_type: 'song' | 'mc' | 'other'
    is_encore: boolean
    memo: null
  }

  const rawEntries: RawEntry[] = []

  $('td.rnd').each((_, el) => {
    const td = $(el)
    const tdClass = td.attr('class') ?? ''
    const slMatch = tdClass.match(/\bsl(\d+)\b/)
    if (!slMatch) return
    const slN = parseInt(slMatch[1], 10)
    const is_encore = !tdClass.includes('rnd2')
    const ttlEl = td.find('div.ttl')
    const linkedName = ttlEl.find('a').first().text().trim()
    const ttlClone = ttlEl.clone()
    ttlClone.find('p.memo, .cmt').remove()
    const plainName = ttlClone.text().trim()
    const rawName = linkedName || plainName
    if (!rawName) return
    if (/^\d+$/.test(rawName)) return
    if (/^EN\d*$/i.test(rawName)) return
    if (/^[\u2014\u2013\u2012\u2010\uFF0D-]/.test(rawName)) return
    let song_type: 'song' | 'mc' | 'other' = 'song'
    if (/^MC$/i.test(rawName)) song_type = 'mc'
    else if (rawName.startsWith('///')) song_type = 'other'
    rawEntries.push({ slN, song_name: rawName, song_type, is_encore, memo: null })
  })

  if (rawEntries.length === 0) return []

  const songEntries = rawEntries.filter(e => e.song_type === 'song')
  const entries = songEntries.map(e => ({
    sort_key: slToPos[e.slN] ?? e.slN,
    song_name: e.song_name,
    song_type: 'song' as const,
    is_encore: e.is_encore,
    memo: null,
  }))
  entries.sort((a, b) => a.sort_key - b.sort_key)
  return entries
}

async function fetchSetlist(eventId: number | string): Promise<ParsedEntry[]> {
  const url = `https://www.livefans.jp/events/${eventId}`
  const baseHeaders = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.5',
  }

  const mainRes = await fetch(url, {
    headers: baseHeaders,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null)

  if (!mainRes?.ok) return []

  const html = await mainRes.text()
  const cookies = mainRes.headers.get('set-cookie') ?? ''
  const $main = cheerio.load(html)

  let slToPos: Record<number, number> = {}
  const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
  if (ajaxMatch) {
    const params = ajaxMatch[1]
    const legendUrl = `https://www.livefans.jp/events/legend?${params}`
    const legendRes = await fetch(legendUrl, {
      headers: {
        ...baseHeaders,
        'Referer': url,
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    }).catch(() => null)
    if (legendRes?.ok) {
      const legendText = await legendRes.text()
      const modeMatch = legendText.match(/(?:rowNoRewrite|getSort)\(['"](\w+)['"]/)
      if (modeMatch) {
        slToPos = buildSlToPosition(modeMatch[1], $main('td.rnd').length)
      }
    }
  }

  let entries = parseSetlistHtml(html, slToPos)

  // Fallback for old-format pages
  if (entries.length === 0) {
    const $ = cheerio.load(html)
    const encorePos = html.indexOf('アンコール')
    let orderNum = 0
    $('a[href*="/songs/"]').each((_, el) => {
      const name = $(el).text().trim()
      if (!name || /^(歌詞|youtube|YouTube)$/i.test(name)) return
      const href = $(el).attr('href') ?? ''
      const hrefPos = html.indexOf(`"${href}"`)
      entries.push({
        sort_key: ++orderNum,
        song_name: name,
        song_type: 'song',
        is_encore: encorePos > 0 && hrefPos > encorePos,
        memo: null,
      })
    })
  }

  return entries
}

// GET - return concerts that need setlists
export async function GET() {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: concerts } = await admin
    .from('concerts')
    .select('id, date, venue_name, livefans_event_id, artists(name), tours(name), setlist_submissions(id)')
    .not('livefans_event_id', 'is', null)
    .order('date')

  const needing = (concerts ?? [])
    .filter(c => (c.setlist_submissions as { id: string }[]).length === 0)
    .map(c => ({
      id: c.id,
      date: c.date,
      venue_name: c.venue_name,
      livefans_event_id: c.livefans_event_id,
      artist_name: (c.artists as { name: string } | null)?.name ?? '',
      tour_name: (c.tours as { name: string } | null)?.name ?? '',
    }))

  return NextResponse.json({ concerts: needing })
}

// POST - process a single concert
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!(profile as { is_admin: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { concertId } = await req.json()
  const admin = createAdminClient()

  const { data: concert } = await admin
    .from('concerts')
    .select('livefans_event_id')
    .eq('id', concertId)
    .single()

  if (!concert?.livefans_event_id) {
    return NextResponse.json({ ok: false, reason: 'no_livefans_id', songs: 0 })
  }

  const entries = await fetchSetlist(concert.livefans_event_id)
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, reason: 'no_setlist', songs: 0 })
  }

  const { data: subData } = await admin
    .from('setlist_submissions')
    .upsert({ concert_id: concertId, user_id: user.id }, { onConflict: 'concert_id,user_id' })
    .select('id')
    .single()

  if (!subData) return NextResponse.json({ ok: false, reason: 'db_error', songs: 0 })

  await admin.from('setlist_songs').delete().eq('submission_id', subData.id)

  const inserts = entries.map((e, i) => ({
    submission_id: subData.id,
    concert_id: concertId,
    user_id: user.id,
    song_name: e.song_name,
    song_type: e.song_type,
    order_num: i + 1,
    is_encore: e.is_encore,
  }))

  await admin.from('setlist_songs').insert(inserts)

  return NextResponse.json({ ok: true, songs: entries.length })
}
