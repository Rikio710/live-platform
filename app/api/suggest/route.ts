import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ artists: [], tours: [], songs: [] })

  const supabase = await createClient()
  const like = `%${q}%`

  // アーティスト一覧ページ用: アーティストのみ・件数多め
  if (req.nextUrl.searchParams.get('type') === 'artists') {
    const { data: artists } = await supabase
      .from('artists')
      .select('id, name, image_url, image_crop_x, image_crop_y')
      .ilike('name', like)
      .order('name')
      .limit(50)
    return NextResponse.json({ artists: artists ?? [], tours: [], songs: [] })
  }

  const [{ data: artists }, { data: tours }, { data: songs }] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, image_url, image_crop_x, image_crop_y')
      .ilike('name', like)
      .limit(4),
    supabase
      .from('tours')
      .select('id, name, artists(name)')
      .ilike('name', like)
      .limit(3),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('songs')
      .select('id, name, image_url, spotify_artist_name, artists(name)')
      .ilike('name', like)
      .limit(4),
  ])

  return NextResponse.json({ artists: artists ?? [], tours: tours ?? [], songs: songs ?? [] })
}
