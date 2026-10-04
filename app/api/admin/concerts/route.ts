import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { searchParams } = new URL(req.url)
    const artistId = searchParams.get('artist_id')
    const tourId = searchParams.get('tour_id')

    const PAGE = 1000
    const all: any[] = []
    let page = 0
    while (true) {
      let query = admin
        .from('concerts')
        .select('*, artists(id, name), tours(id, name), setlist_submissions(count)')
        .order('date', { ascending: false })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (artistId) query = query.eq('artist_id', artistId)
      if (tourId) query = query.eq('tour_id', tourId)
      const { data, error } = await query
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      all.push(...data)
      if (data.length < PAGE) break
      page++
    }
    return NextResponse.json(all)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const admin = createAdminClient()
    const { data, error } = await admin.from('concerts').insert({
      artist_id: body.artist_id,
      tour_id: body.tour_id || null,
      festival_event_id: body.festival_event_id || null,
      stage_name: body.stage_name || null,
      venue_name: body.venue_name,
      venue_address: body.venue_address || null,
      date: body.date,
      start_time: body.start_time || null,
      image_url: body.image_url || null,
    }).select('*, artists(id, name), tours(id, name), festival_events(id, name, festival_groups(name))').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
