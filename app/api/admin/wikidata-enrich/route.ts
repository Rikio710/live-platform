import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'

// ---- Wikidata helpers ----

function getStringClaim(entity: any, prop: string): string | null {
  const claims = entity.claims?.[prop]
  if (!claims?.length) return null
  const snak = claims[0].mainsnak
  if (snak.snaktype !== 'value') return null
  const val = snak.datavalue?.value
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) return val.text ?? null
  return null
}

function getImageClaim(entity: any): string | null {
  const filename = getStringClaim(entity, 'P18')
  if (!filename) return null
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=400`
}

async function fetchWikidataEntity(qid: string) {
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
    headers: { 'User-Agent': 'LiveVault/1.0 (livevault.jp)' },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json()
  return json.entities?.[qid] ?? null
}

async function fetchWikipediaSummary(title: string): Promise<string | null> {
  const res = await fetch(
    `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    {
      headers: { 'User-Agent': 'LiveVault/1.0 (livevault.jp)' },
      signal: AbortSignal.timeout(6000),
    }
  ).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json()
  return json.extract ?? null
}

function buildDescription(extract: string | null, fallback: string): string {
  if (!extract) return fallback
  // 最大3文・300文字
  const sentences = extract.split('。').map(s => s.trim()).filter(Boolean)
  let result = ''
  for (const s of sentences.slice(0, 4)) {
    const next = result + s + '。'
    if (next.length > 300) break
    result = next
  }
  return result || sentences[0] + '。'
}

// ---- Spotify helpers ----

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

async function searchSpotifyImage(name: string): Promise<string | null> {
  try {
    const token = await getSpotifyToken()
    if (!token) return null
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&market=JP&limit=5`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const artists: any[] = data.artists?.items ?? []
    if (artists.length === 0) return null
    // 人気度が高い順に並んでいる。名前が似ているものを優先
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_\.]/g, '')
    const nameNorm = norm(name)
    const match = artists.find(a => norm(a.name) === nameNorm) ?? artists[0]
    return match.images?.[0]?.url ?? null
  } catch {
    return null
  }
}

// ---- Main handler ----

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Wikidata検索とSpotify画像検索を並列実行
  const [searchRes, spotifyImageUrl] = await Promise.all([
    fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=ja&type=item&format=json&limit=5`,
      { headers: { 'User-Agent': 'LiveVault/1.0 (livevault.jp)' }, signal: AbortSignal.timeout(8000) }
    ).catch(() => null),
    searchSpotifyImage(name),
  ])

  if (!searchRes?.ok) {
    return NextResponse.json({ error: 'Wikidata検索に失敗しました' }, { status: 502 })
  }

  const hits: any[] = (await searchRes.json()).search ?? []
  if (hits.length === 0) {
    return NextResponse.json({ candidates: [], spotify_image_url: spotifyImageUrl })
  }

  // 上位3件のエンティティを並列取得
  const top = hits.slice(0, 3)
  const entities = await Promise.all(top.map(h => fetchWikidataEntity(h.id)))

  const candidates = await Promise.all(
    top.map(async (hit, i) => {
      const entity = entities[i]
      if (!entity) return null

      const label = entity.labels?.ja?.value ?? entity.labels?.en?.value ?? hit.label
      const wikidataDesc = entity.descriptions?.ja?.value ?? entity.descriptions?.en?.value ?? hit.description ?? ''

      const twitterHandle = getStringClaim(entity, 'P2002')
      const instagramHandle = getStringClaim(entity, 'P2003')
      const youtubeId = getStringClaim(entity, 'P2397')
      const tiktokHandle = getStringClaim(entity, 'P7085')
      const websiteRaw = getStringClaim(entity, 'P856')
      const wikidataImageUrl = getImageClaim(entity)

      const jaWikiTitle = entity.sitelinks?.jawiki?.title ?? null
      const wikiTitle = jaWikiTitle ?? label
      const wikipediaExtract = wikiTitle ? await fetchWikipediaSummary(wikiTitle) : null

      return {
        wikidataId: hit.id,
        label,
        wikidataDescription: wikidataDesc,
        description: buildDescription(wikipediaExtract, wikidataDesc),
        website_url: websiteRaw ?? null,
        twitter_url: twitterHandle ? `https://x.com/${twitterHandle}` : null,
        instagram_url: instagramHandle ? `https://instagram.com/${instagramHandle}` : null,
        youtube_url: youtubeId ? `https://www.youtube.com/channel/${youtubeId}` : null,
        tiktok_url: tiktokHandle ? `https://www.tiktok.com/@${tiktokHandle}` : null,
        image_url: wikidataImageUrl,
      }
    })
  )

  return NextResponse.json({
    candidates: candidates.filter(Boolean),
    spotify_image_url: spotifyImageUrl,
  })
}
