import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ artists: [], tours: [] })

  const supabase = await createClient()
  const like = `%${q}%`

  const [{ data: artists }, { data: tours }] = await Promise.all([
    supabase
      .from('artists')
      .select('id, name, image_url')
      .ilike('name', like)
      .limit(5),
    supabase
      .from('tours')
      .select('id, name, artists(name)')
      .ilike('name', like)
      .limit(4),
  ])

  return NextResponse.json({ artists: artists ?? [], tours: tours ?? [] })
}
