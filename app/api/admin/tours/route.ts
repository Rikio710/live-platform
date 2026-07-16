import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'

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
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.5',
  }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { songs: [] }
    const html = await res.text()
    const cookies = res.headers.get('set-cookie') ?? ''
    const $ = cheerio.load(html)

    let slToPos: Record<number, number> = {}
    const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
    if (ajaxMatch) {
      const legendRes = await fetch(`${BASE}/events/legend?${ajaxMatch[1]}`, {
        headers: { ...headers, 'Referer': url, 'X-Requested-With': 'XMLHttpRequest', ...(cookies ? { 'Cookie': cookies } : {}) },
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

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from('tours')
      .select('*, tour_artists(artists(id, name)), concerts(id, setlist_submissions(count))')
      .order('start_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await req.json()
    const { concerts = [], import_setlists = false, ...tourData } = body
    const admin = createAdminClient()

    const { data: tour, error } = await admin.from('tours').insert({
      artist_id: tourData.artist_id,
      name: tourData.name,
      image_url: tourData.image_url || null,
      livefans_group_id: tourData.livefans_group_id || null,
    }).select('*, artists(id, name)').single()
    if (error) {
      if (error.code === '23505' && error.message.includes('livefans_group_id')) {
        const { data: existing } = await admin
          .from('tours')
          .select('id, name')
          .eq('livefans_group_id', tourData.livefans_group_id)
          .single()
        const existingInfo = existing ? `「${existing.name}」` : '別のツアー'
        return NextResponse.json(
          { error: `このLiveFans URLはすでに${existingInfo}に登録されています` },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // tour_artists に全出演アーティストを登録
    const allArtistIds: string[] = [tourData.artist_id, ...(body.additional_artist_ids ?? [])]
    await (admin as any).from('tour_artists').insert(
      allArtistIds.map((artistId: string, i: number) => ({ tour_id: tour.id, artist_id: artistId, order_num: i }))
    )

    let setlists_added = 0

    if (concerts.length > 0) {
      const MAX_SETLISTS = 10

      const insertRows = concerts.map((c: { venue_name: string; date: string; start_time: string; event_url?: string; additional_artists?: string[] }) => {
        const eventIdMatch = (c.event_url ?? '').match(/\/events\/(\d+)/)
        return {
          artist_id: tourData.artist_id,
          tour_id: tour.id,
          venue_name: c.venue_name,
          date: c.date,
          start_time: c.start_time || null,
          livefans_event_id: eventIdMatch ? parseInt(eventIdMatch[1]) : null,
          _additional_artists: c.additional_artists ?? [],
        }
      })

      // livefans_event_id が既存の公演は tour_id を更新、新規のみ insert
      const eventIds: number[] = insertRows.map((r: { livefans_event_id: number | null }) => r.livefans_event_id).filter((id: number | null): id is number => id !== null)
      let existingEventIds = new Set<number>()
      if (eventIds.length > 0) {
        const { data: existingConcerts } = await admin
          .from('concerts')
          .select('livefans_event_id')
          .in('livefans_event_id', eventIds)
        existingEventIds = new Set((existingConcerts ?? []).map(c => c.livefans_event_id).filter((id): id is number => id !== null))
        if (existingEventIds.size > 0) {
          await admin.from('concerts')
            .update({ tour_id: tour.id })
            .in('livefans_event_id', [...existingEventIds])
            .is('tour_id', null)
        }
      }
      const rowsToInsert = insertRows.filter((r: { livefans_event_id: number | null }) => !r.livefans_event_id || !existingEventIds.has(r.livefans_event_id))
      if (rowsToInsert.length > 0) {
        await admin.from('concerts').insert(rowsToInsert.map(({ _additional_artists: _a, ...r }: { _additional_artists: string[]; [k: string]: unknown }) => r))
      }

      // concert_artists への登録
      const allAdditionalNames = [...new Set(insertRows.flatMap((r: { _additional_artists: string[] }) => r._additional_artists))]
      if (allAdditionalNames.length > 0) {
        const { data: foundArtists } = await admin.from('artists').select('id, name').in('name', allAdditionalNames as string[])
        const nameToId: Record<string, string> = Object.fromEntries((foundArtists ?? []).map((a: { id: string; name: string }) => [a.name, a.id]))

        // 対象公演のIDを livefans_event_id で取得
        const allEventIds: number[] = insertRows.map((r: { livefans_event_id: number | null }) => r.livefans_event_id).filter((id: number | null): id is number => id !== null)
        const { data: targetConcertsForArtists } = allEventIds.length > 0
          ? await admin.from('concerts').select('id, livefans_event_id').in('livefans_event_id', allEventIds)
          : { data: [] }
        const eventIdToConcertId: Record<number, string> = Object.fromEntries((targetConcertsForArtists ?? []).map((c: { id: string; livefans_event_id: number | null }) => [c.livefans_event_id, c.id]))

        const concertArtistRows: { concert_id: string; artist_id: string; order_num: number }[] = []
        for (const row of insertRows as { livefans_event_id: number | null; _additional_artists: string[] }[]) {
          if (!row._additional_artists.length || !row.livefans_event_id) continue
          const concertId = eventIdToConcertId[row.livefans_event_id]
          if (!concertId) continue
          row._additional_artists.forEach((name, i) => {
            const artistId = nameToId[name]
            if (artistId && artistId !== tourData.artist_id) {
              concertArtistRows.push({ concert_id: concertId, artist_id: artistId, order_num: i + 1 })
            }
          })
        }
        if (concertArtistRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any).from('concert_artists').upsert(concertArtistRows, { onConflict: 'concert_id,artist_id', ignoreDuplicates: true })
        }
      }

    if (import_setlists && user) {
      const today = new Date().toISOString().split('T')[0]

      // tour_id ではなく livefans_event_id で検索（insert 失敗の場合でも既存公演をヒット）
      const pastEventIds: number[] = []
      for (const c of concerts as { date?: string; event_url?: string }[]) {
        if (!c.date || c.date >= today) continue
        const m = (c.event_url ?? '').match(/\/events\/(\d+)/)
        if (m) pastEventIds.push(parseInt(m[1]))
        if (pastEventIds.length >= MAX_SETLISTS) break
      }

      if (pastEventIds.length > 0) {
        const { data: targetConcerts } = await admin
          .from('concerts')
          .select('id, livefans_event_id')
          .eq('artist_id', tourData.artist_id)
          .in('livefans_event_id', pastEventIds)

        for (const concert of targetConcerts ?? []) {
          await new Promise(r => setTimeout(r, 300))
          const { songs } = await scrapeSetlist(concert.livefans_event_id!)
          if (songs.length === 0) continue

          // フィードバック準拠: insert ではなく upsert（concert_id,user_id 重複対応）
          const { data: sub } = await admin
            .from('setlist_submissions')
            .upsert({ concert_id: concert.id, user_id: user.id }, { onConflict: 'concert_id,user_id' })
            .select('id')
            .single()

          if (sub) {
            await admin.from('setlist_songs').insert(
              songs.map(s => ({
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
          }
        }
      }
    }
  }

    return NextResponse.json({ ...tour, setlists_added })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
