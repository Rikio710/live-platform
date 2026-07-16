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

// PATCH: 1件リネーム or 複数→1件マージ
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const admin = createAdminClient()

    // マージモード: aliases[] → canonical
    if (body.aliases && body.canonical) {
      const { aliases, canonical, canonical_address } = body as {
        aliases: string[]; canonical: string; canonical_address?: string
      }
      if (!canonical?.trim()) return NextResponse.json({ error: '正規名は必須です' }, { status: 400 })
      const patch: Record<string, string | null> = { venue_name: canonical.trim() }
      if (canonical_address !== undefined) patch.venue_address = canonical_address?.trim() || null
      for (const alias of aliases) {
        const { error } = await admin.from('concerts').update(patch).eq('venue_name', alias)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true, merged: aliases.length })
    }

    // 1件リネームモード
    const { old_name, new_name, new_address } = body
    if (!old_name || !new_name?.trim()) {
      return NextResponse.json({ error: '会場名は必須です' }, { status: 400 })
    }
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
