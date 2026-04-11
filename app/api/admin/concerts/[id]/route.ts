import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()
    const { data, error } = await admin.from('concerts').update({
      artist_id: body.artist_id,
      tour_id: body.tour_id || null,
      venue_name: body.venue_name,
      venue_address: body.venue_address || null,
      date: body.date,
      start_time: body.start_time || null,
      image_url: body.image_url || null,
      spotify_url: body.spotify_url || null,
      apple_music_url: body.apple_music_url || null,
    }).eq('id', id).select('*, artists(id, name), tours(id, name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const admin = createAdminClient()
    const { error } = await admin.from('concerts').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
