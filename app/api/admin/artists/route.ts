import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin.from('artists').select('*').order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const admin = createAdminClient()
    const { data, error } = await admin.from('artists').insert({
      name: body.name,
      image_url: body.image_url || null,
      description: body.description || null,
      website_url: body.website_url || null,
      twitter_url: body.twitter_url || null,
      instagram_url: body.instagram_url || null,
      youtube_url: body.youtube_url || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
