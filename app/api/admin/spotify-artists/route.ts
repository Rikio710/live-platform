import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'

type SpotifyArtist = {
  id: string
  name: string
  popularity: number
  images: { url: string; width: number; height: number }[]
  external_urls: { spotify: string }
  genres: string[]
}

async function getSpotifyToken(): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Spotifyトークン取得失敗')
  return data.access_token
}

async function searchByName(token: string, name: string, limit = 10): Promise<SpotifyArtist[]> {
  try {
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&market=JP&limit=${limit}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.artists?.items ?? []
  } catch {
    return []
  }
}

// GET: DBの全アーティスト一覧（spotify_id の有無含む）
export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('artists')
      .select('id, name, image_url, spotify_id')
      .order('name')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// POST: { action: 'search', name } → Spotify候補を返す
//       { action: 'import', artists: [...] } → 新規アーティストを登録
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()

    if (body.action === 'search') {
      const { name } = body
      if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
      const token = await getSpotifyToken()
      const results = await searchByName(token, name, 8)
      return NextResponse.json({
        candidates: results.map(a => ({
          spotifyId: a.id,
          name: a.name,
          popularity: a.popularity,
          imageUrl: a.images[0]?.url ?? null,
          genres: a.genres,
        }))
      })
    }

    if (body.action === 'import') {
      const admin = createAdminClient()
      const { artists } = body as {
        artists: { name: string; imageUrl: string | null; spotifyId: string }[]
      }
      const rows = artists.map(a => ({
        name: a.name,
        image_url: a.imageUrl,
        spotify_id: a.spotifyId,
      }))
      const { data, error } = await admin.from('artists').insert(rows).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ inserted: data?.length ?? 0 })
    }

    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PUT: { artist_id, spotify_id, image_url } → 既存アーティストにSpotify紐付け
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin()
    const { artist_id, spotify_id, image_url } = await req.json()
    if (!artist_id) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })
    const admin = createAdminClient()
    const update: Record<string, string | null> = { spotify_id: spotify_id ?? null }
    if (image_url) update.image_url = image_url
    const { error } = await admin.from('artists').update(update).eq('id', artist_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

const JP_RE = /[\u3040-\u9FFF]/

async function lookupJapaneseName(name: string): Promise<string | null> {
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&media=music&entity=musicArtist&country=jp&lang=ja_jp&limit=3`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    for (const a of data.results ?? []) {
      if (JP_RE.test(a.artistName)) return a.artistName as string
    }
    return null
  } catch {
    return null
  }
}

// PATCH: 紐付け済みアーティストを使って新規アーティストを発見
export async function PATCH() {
  try {
    await requireAdmin()
    const admin = createAdminClient()
    const token = await getSpotifyToken()

    // 全アーティスト名を取得（重複チェック用）
    const { data: allArtists } = await admin.from('artists').select('name, spotify_id')
    const existingNames = new Set((allArtists ?? []).map(a => a.name.toLowerCase()))

    // 紐付け済みアーティストをシードに使用（最大15件）
    const linked = (allArtists ?? []).filter(a => a.spotify_id).slice(0, 15)
    const seeds = linked.length > 0
      ? linked.map(a => a.name)
      : ['YOASOBI', 'Ado', '米津玄師', 'King Gnu', 'Official髭男dism', 'Mrs. GREEN APPLE', 'Vaundy', '藤井 風', 'Creepy Nuts', 'ONE OK ROCK']

    const discovered = new Map<string, {
      spotifyId: string; name: string; popularity: number; imageUrl: string | null; genres: string[]
    }>()

    for (const name of seeds) {
      const results = await searchByName(token, name, 10)
      for (const a of results) {
        if (discovered.has(a.id)) continue
        if (existingNames.has(a.name.toLowerCase())) continue
        if (a.popularity === 0) continue
        discovered.set(a.id, {
          spotifyId: a.id,
          name: a.name,
          popularity: a.popularity,
          imageUrl: a.images[0]?.url ?? null,
          genres: a.genres,
        })
      }
      await new Promise(r => setTimeout(r, 150))
    }

    const candidates = [...discovered.values()]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 100)

    // 日本語名を含まないアーティストはiTunesで日本語名を取得
    await Promise.all(
      candidates.map(async (c) => {
        if (JP_RE.test(c.name)) return
        const jaName = await lookupJapaneseName(c.name)
        if (jaName) c.name = jaName
      })
    )

    return NextResponse.json(candidates)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
