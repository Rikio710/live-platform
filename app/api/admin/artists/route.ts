import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const all = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await admin.from('artists').select('*').order('name').range(from, from + pageSize - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }
    return NextResponse.json(all)
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
      tiktok_url: body.tiktok_url || null,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // livefans_id が指定された場合は artist_livefans_ids に登録
    if (data && body.livefans_id) {
      const lfId = parseInt(body.livefans_id)
      if (!isNaN(lfId)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('artist_livefans_ids').upsert({ artist_id: data.id, livefans_id: lfId, crawl_page: 0 }, { onConflict: 'livefans_id' })
      }
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
