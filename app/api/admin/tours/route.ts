import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
}

export async function GET() {
  try {
    await requireAuth()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tours')
      .select('*, artists(id, name)')
      .order('start_date', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const admin = createAdminClient()
    const { data, error } = await admin.from('tours').insert({
      artist_id: body.artist_id,
      name: body.name,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      image_url: body.image_url || null,
    }).select('*, artists(id, name)').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
