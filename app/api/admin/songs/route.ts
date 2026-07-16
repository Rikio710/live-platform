import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get('artist_id')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const admin = createAdminClient()

  // 曲ごとのsetlist_songs出現数を集計
  const { data: songs } = await admin
    .from('songs')
    .select('id, name, album_name, release_year, spotify_track_id, spotify_preview_url')
    .eq('artist_id', artistId)
    .order('name')

  if (!songs) return NextResponse.json({ songs: [] })

  // 出現回数をカウント
  const { data: counts } = await admin
    .from('setlist_songs')
    .select('song_id')
    .in('song_id', songs.map(s => s.id))
    .eq('song_type', 'song')

  const countMap = new Map<string, number>()
  for (const row of counts ?? []) {
    if (row.song_id) countMap.set(row.song_id, (countMap.get(row.song_id) ?? 0) + 1)
  }

  const result = songs.map(s => ({ ...s, play_count: countMap.get(s.id) ?? 0 }))
    .sort((a, b) => b.play_count - a.play_count || a.name.localeCompare(b.name))

  return NextResponse.json({ songs: result })
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
  const body = await req.json()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('songs')
    .insert({ artist_id: body.artist_id, name: body.name })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
