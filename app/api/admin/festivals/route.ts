import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'

// GET: festival_groups 一覧（festival_events を含む）
export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('festival_groups')
      .select('*, festival_events(id, name, slug, start_date, end_date, venue_name, image_url)')
      .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// POST: festival_group または festival_event の作成
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const admin = createAdminClient()

    if (body.type === 'group') {
      const { data, error } = await admin.from('festival_groups').insert({
        name: body.name,
        slug: body.slug || null,
        image_url: body.image_url || null,
      }).select('*, festival_events(id, name, slug, start_date, end_date, venue_name, image_url)').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (body.type === 'event') {
      const { data, error } = await admin.from('festival_events').insert({
        group_id: body.group_id || null,
        name: body.name,
        slug: body.slug || null,
        start_date: body.start_date,
        end_date: body.end_date || null,
        venue_name: body.venue_name || null,
        venue_address: body.venue_address || null,
        image_url: body.image_url || null,
      }).select('id, name, slug, start_date, end_date, venue_name, image_url').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'type must be group or event' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
