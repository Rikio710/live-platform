import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    if (body.type === 'group') {
      const { data, error } = await admin.from('festival_groups').update({
        name: body.name,
        slug: body.slug || null,
        image_url: body.image_url || null,
      }).eq('id', id).select('*, festival_events(id, name, slug, start_date, end_date, venue_name, image_url)').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (body.type === 'event') {
      const { data, error } = await admin.from('festival_events').update({
        group_id: body.group_id || null,
        name: body.name,
        slug: body.slug || null,
        start_date: body.start_date,
        end_date: body.end_date || null,
        venue_name: body.venue_name || null,
        venue_address: body.venue_address || null,
        image_url: body.image_url || null,
      }).eq('id', id).select('id, name, slug, start_date, end_date, venue_name, image_url').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'type must be group or event' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const admin = createAdminClient()

    if (body.type === 'event') {
      const { error } = await admin.from('festival_events').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await admin.from('festival_groups').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
