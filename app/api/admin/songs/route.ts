import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const artistId = searchParams.get('artist_id')
  const all = searchParams.get('all') === 'true'
  const unlinked = searchParams.get('unlinked') === 'true'

  if (!artistId && !all && !unlinked) return NextResponse.json({ error: 'artist_id or all/unlinked required' }, { status: 400 })

  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('songs')
    .select('id, name, album_name, release_year, spotify_track_id, spotify_preview_url, image_url, spotify_artist_name, artist_id, artists(id, name)')
    .order('name')

  if (artistId) query = query.eq('artist_id', artistId)
  if (unlinked) query = query.is('spotify_track_id', null)

  const { data: songs } = await query
  if (!songs) return NextResponse.json({ songs: [] })

  // 出現回数をカウント
  const { data: counts } = await admin
    .from('setlist_songs')
    .select('song_id')
    .in('song_id', songs.map((s: { id: string }) => s.id))
    .eq('song_type', 'song')

  const countMap = new Map<string, number>()
  for (const row of (counts ?? []) as { song_id: string | null }[]) {
    if (row.song_id) countMap.set(row.song_id, (countMap.get(row.song_id) ?? 0) + 1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (songs as any[]).map(s => ({ ...s, play_count: countMap.get(s.id) ?? 0 }))
    .sort((a: { play_count: number; name: string }, b: { play_count: number; name: string }) =>
      b.play_count - a.play_count || a.name.localeCompare(b.name))

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
