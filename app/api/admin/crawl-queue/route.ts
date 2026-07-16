import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'

// GET: pending キュー一覧
export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('crawl_queue')
      .select('*, artists(id, name, image_url)')
      .eq('status', 'pending')
      .order('event_date', { ascending: true })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PATCH: approve（concert作成）or reject
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const { id, action, concert_data } = body
    const admin = createAdminClient()

    if (action === 'reject') {
      const { error } = await admin.from('crawl_queue').update({ status: 'rejected' }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'approve') {
      const { error: insertError } = await admin.from('concerts').insert({
        artist_id: concert_data.artist_id,
        tour_id: concert_data.tour_id || null,
        festival_event_id: concert_data.festival_event_id || null,
        stage_name: concert_data.stage_name || null,
        venue_name: concert_data.venue_name,
        venue_address: concert_data.venue_address || null,
        date: concert_data.date,
        start_time: concert_data.start_time || null,
      })
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
      await admin.from('crawl_queue').update({ status: 'approved' }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// DELETE: rejected / approved を一括削除
export async function DELETE() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    await admin.from('crawl_queue').delete().neq('status', 'pending')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
