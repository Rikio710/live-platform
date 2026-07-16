import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()
    const { data, error } = await admin.from('artists').update({
      name: body.name,
      image_url: body.image_url || null,
      description: body.description || null,
      website_url: body.website_url || null,
      twitter_url: body.twitter_url || null,
      instagram_url: body.instagram_url || null,
      youtube_url: body.youtube_url || null,
      tiktok_url: body.tiktok_url || null,
      image_crop_x: body.image_crop_x ?? 50,
      image_crop_y: body.image_crop_y ?? 50,
      image_crop_scale: body.image_crop_scale ?? 1,
      livefans_id: body.livefans_id ? parseInt(body.livefans_id) : null,
    }).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const admin = createAdminClient()
    const { error } = await admin.from('artists').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
