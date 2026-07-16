import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

async function getSpotifyToken(): Promise<string | null> {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(6000),
    })
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const { id } = await params
  const { artist_name } = await req.json()
  const admin = createAdminClient()

  const { data: song } = await admin.from('songs').select('name').eq('id', id).single()
  if (!song) return NextResponse.json({ error: 'song not found' }, { status: 404 })

  const token = await getSpotifyToken()
  if (!token) return NextResponse.json({ error: 'Spotify auth failed' }, { status: 502 })

  const q = artist_name ? `track:${song.name} artist:${artist_name}` : song.name
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&market=JP&limit=5`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
  )
  if (!res.ok) return NextResponse.json({ error: 'Spotify search failed' }, { status: 502 })

  const data = await res.json()
  const tracks: any[] = data.tracks?.items ?? []
  if (tracks.length === 0) return NextResponse.json({ candidates: [] })

  const candidates = tracks.map(t => ({
    spotify_track_id: t.id,
    name: t.name,
    artist: t.artists.map((a: any) => a.name).join(', '),
    album_name: t.album?.name ?? null,
    release_year: t.album?.release_date ? parseInt(t.album.release_date.slice(0, 4)) : null,
    spotify_preview_url: t.preview_url ?? null,
    image_url: t.album?.images?.[0]?.url ?? null,
  }))

  return NextResponse.json({ candidates })
}

// 選んだ候補を確定適用
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }
  const { id } = await params
  const body = await req.json()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('songs')
    .update({
      spotify_track_id: body.spotify_track_id,
      spotify_preview_url: body.spotify_preview_url || null,
      album_name: body.album_name || null,
      release_year: body.release_year || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
