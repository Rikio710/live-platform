import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

async function getSpotifyToken(): Promise<string | null> {
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    return data.access_token ?? null
  } catch { return null }
}

async function fetchPopularity(token: string, name: string): Promise<{ popularity: number | null; rateLimited: boolean }> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=5`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    )
    if (res.status === 429) return { popularity: null, rateLimited: true }
    if (!res.ok) return { popularity: null, rateLimited: false }
    const data = await res.json()
    const artists: { name: string; popularity: number }[] = data.artists?.items ?? []
    if (artists.length === 0) return { popularity: null, rateLimited: false }
    const match = artists.find(a => norm(a.name) === norm(name)) ?? artists[0]
    return { popularity: match.popularity ?? null, rateLimited: false }
  } catch { return { popularity: null, rateLimited: false } }
}

const BATCH = 10

export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // spotify_popularity が null のアーティストを BATCH 件取得
  const { data: artists } = await (admin as any)
    .from('artists')
    .select('id, name')
    .is('spotify_popularity', null)
    .order('name')
    .limit(BATCH)

  if (!artists || artists.length === 0) {
    return NextResponse.json({ done: true, message: '対象アーティストなし' })
  }

  const { count } = await (admin as any)
    .from('artists')
    .select('id', { count: 'exact', head: true })
    .is('spotify_popularity', null)
  const remaining = (count ?? artists.length) - artists.length

  // トークンを1回だけ取得して使い回す
  const token = await getSpotifyToken()
  if (!token) {
    return NextResponse.json({ error: 'Spotifyトークン取得失敗' }, { status: 500 })
  }

  const log: { name: string; popularity: number | null; skipped: boolean }[] = []
  let rateLimited = false

  for (const artist of artists) {
    const result = await fetchPopularity(token, artist.name)
    if (result.rateLimited) {
      rateLimited = true
      break
    }
    await (admin as any)
      .from('artists')
      .update({ spotify_popularity: result.popularity ?? -1 })
      .eq('id', artist.id)
    log.push({ name: artist.name, popularity: result.popularity, skipped: result.popularity === null })
  }

  return NextResponse.json({ done: false, log, remaining, rateLimited })
}
