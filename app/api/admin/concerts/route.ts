import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('concerts')
      .select('*, artists(id, name), tours(id, name)')
      .order('date', { ascending: false })
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
    const admin = createAdminClient()
    const { data, error } = await admin.from('concerts').insert({
      artist_id: body.artist_id,
      tour_id: body.tour_id || null,
      venue_name: body.venue_name,
      venue_address: body.venue_address || null,
      date: body.date,
      start_time: body.start_time || null,
      image_url: body.image_url || null,
    }).select('*, artists(id, name), tours(id, name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
