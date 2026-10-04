import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await (admin as any)
      .from('festival_groups')
      .select('*')
      .order('detected_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('festival_groups')
      .update({ crawl_status: 'pending', livefans_pending_event_ids: null })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
