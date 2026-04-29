import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('concerts')
      .select('venue_name, venue_address')
      .order('venue_name', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Group by venue_name, pick address, count concerts
    const map = new Map<string, { venue_name: string; venue_address: string | null; count: number }>()
    for (const row of data ?? []) {
      if (map.has(row.venue_name)) {
        map.get(row.venue_name)!.count++
      } else {
        map.set(row.venue_name, { venue_name: row.venue_name, venue_address: row.venue_address, count: 1 })
      }
    }
    return NextResponse.json(Array.from(map.values()))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PATCH: update all concerts matching old_name with new_name and new_address
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const { old_name, new_name, new_address } = await req.json()
    if (!old_name || !new_name?.trim()) {
      return NextResponse.json({ error: '会場名は必須です' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { error } = await admin
      .from('concerts')
      .update({ venue_name: new_name.trim(), venue_address: new_address?.trim() || null })
      .eq('venue_name', old_name)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
