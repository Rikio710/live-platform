import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'

type ArtistSlot = {
  artist_name: string
  date: string        // YYYY-MM-DD
  start_time: string | null
  stage_name: string | null
}

async function scrapeFestivalPage(eventId: number): Promise<ArtistSlot[]> {
  const url = `${BASE}/events/${eventId}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.5',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []

    const html = await res.text()
    const $ = cheerio.load(html)

    // ステージID → ステージ名 マップ
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

    // アーティストスロット
    const slots: ArtistSlot[] = []
    $('input[name^="data[artist_name_"]').each((_, el) => {
      const nameAttr = $(el).attr('name') ?? ''
      const m = nameAttr.match(/\[artist_name_(\d+)\]/)
      if (!m) return
      const n = m[1]

      const artist_name = ($(el).val() as string ?? '').trim()
      if (!artist_name) return

      const rawDate = ($(`input[name="data[artist_date_${n}]"]`).val() as string ?? '').trim()
      const rawTime = ($(`input[name="data[artist_time_${n}]"]`).val() as string ?? '').trim()
      const stgId = ($(`input[name="data[artist_stg_id_${n}]"]`).val() as string ?? '').trim()

      // date: YYYY/MM/DD → YYYY-MM-DD
      const dateM = rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
      if (!dateM) return
      const date = `${dateM[1]}-${dateM[2].padStart(2, '0')}-${dateM[3].padStart(2, '0')}`

      // time: HH:MM → HH:MM:00
      const timeM = rawTime.match(/(\d{1,2}):(\d{2})/)
      const start_time = timeM ? `${timeM[1].padStart(2, '0')}:${timeM[2]}:00` : null

      const stage_name = stgId ? (stageMap.get(stgId) ?? null) : null

      slots.push({ artist_name, date, start_time, stage_name })
    })

    return slots
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { festival_event_id, livefans_event_id } = body

    if (!festival_event_id) return NextResponse.json({ error: 'festival_event_id is required' }, { status: 400 })
    if (!livefans_event_id) return NextResponse.json({ error: 'livefans_event_id is required' }, { status: 400 })

    const admin = createAdminClient()

    // festival_event を取得（会場名のため）
    const { data: festivalEvent } = await admin
      .from('festival_events')
      .select('id, name, venue_name')
      .eq('id', festival_event_id)
      .single()
    if (!festivalEvent) return NextResponse.json({ error: 'festival_event が見つかりません' }, { status: 404 })

    // LiveFans フェスページをスクレイプ
    const slots = await scrapeFestivalPage(Number(livefans_event_id))
    if (slots.length === 0) {
      return NextResponse.json({ error: 'アーティストスロットが見つかりませんでした。URLを確認してください。' }, { status: 422 })
    }

    // ユニークなアーティスト名を収集してDB検索
    const uniqueNames = [...new Set(slots.map(s => s.artist_name))]
    const { data: dbArtists } = await admin
      .from('artists')
      .select('id, name')
      .in('name', uniqueNames)

    const nameToId = new Map<string, string>()
    for (const a of dbArtists ?? []) nameToId.set(a.name, a.id)

    const matched = slots.filter(s => nameToId.has(s.artist_name))
    const unmatched = [...new Set(slots.filter(s => !nameToId.has(s.artist_name)).map(s => s.artist_name))]

    let concerts_added = 0
    const errors: string[] = []

    for (const slot of matched) {
      const artist_id = nameToId.get(slot.artist_name)!

      // 同一アーティスト×同一日×同一フェスイベントの重複チェック
      const { data: existing } = await admin
        .from('concerts')
        .select('id')
        .eq('artist_id', artist_id)
        .eq('festival_event_id', festival_event_id)
        .eq('date', slot.date)
        .maybeSingle()

      if (existing) continue

      const { data: concert, error } = await admin
        .from('concerts')
        .insert({
          artist_id,
          festival_event_id,
          venue_name: festivalEvent.venue_name ?? festivalEvent.name,
          date: slot.date,
          start_time: slot.start_time,
          stage_name: slot.stage_name,
          event_type: 'festival',
        })
        .select('id')
        .single()

      if (error || !concert) {
        errors.push(`${slot.artist_name}: ${error?.message ?? 'insert error'}`)
        continue
      }

      // concert_artists にも登録
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('concert_artists').upsert(
        { concert_id: concert.id, artist_id, order_num: 0 },
        { onConflict: 'concert_id,artist_id', ignoreDuplicates: true }
      )

      concerts_added++
    }

    return NextResponse.json({
      concerts_added,
      total_slots: slots.length,
      matched_artists: matched.length,
      unmatched_artists: unmatched,
      errors,
      message: `${slots.length}スロット中 ${matched.length}件マッチ → ${concerts_added}件の公演を追加しました。`,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
