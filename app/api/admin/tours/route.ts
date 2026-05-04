import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tours')
      .select('*, artists(id, name)')
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
    const body = await req.json()
    const { concerts = [], ...tourData } = body
    const admin = createAdminClient()

    const { data: tour, error } = await admin.from('tours').insert({
      artist_id: tourData.artist_id,
      name: tourData.name,
      image_url: tourData.image_url || null,
    }).select('*, artists(id, name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (concerts.length > 0) {
      await admin.from('concerts').insert(
        concerts.map((c: { venue_name: string; date: string; start_time: string }) => ({
          artist_id: tourData.artist_id,
          tour_id: tour.id,
          venue_name: c.venue_name,
          date: c.date,
          start_time: c.start_time || null,
        }))
      )
    }

    return NextResponse.json(tour)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
