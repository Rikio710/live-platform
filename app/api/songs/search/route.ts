import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const concertId = searchParams.get('concert_id')
  const q = searchParams.get('q')?.trim() ?? ''

  if (!concertId) return NextResponse.json({ songs: [] })

  const supabase = await createClient()

  // concert_id から artist_id を取得
  const { data: concert } = await supabase
    .from('concerts')
    .select('artist_id')
    .eq('id', concertId)
    .single()

  if (!concert) return NextResponse.json({ songs: [] })

  const query = supabase
    .from('songs')
    .select('id, name, album_name, spotify_track_id')
    .eq('artist_id', concert.artist_id)
    .order('name')
    .limit(20)

  if (q.length > 0) {
    query.ilike('name', `%${q}%`)
  }

  const { data: songs } = await query
  return NextResponse.json({ songs: songs ?? [] })
}
