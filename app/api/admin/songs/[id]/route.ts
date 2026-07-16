import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('songs')
    .update({
      name: body.name,
      album_name: body.album_name || null,
      release_year: body.release_year ? parseInt(body.release_year) : null,
      spotify_track_id: body.spotify_track_id || null,
      spotify_preview_url: body.spotify_preview_url || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('songs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
