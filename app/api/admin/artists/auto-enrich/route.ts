import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

// ---- Spotify ----
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
  } catch { return null }
}

async function searchSpotify(name: string): Promise<{ image_url: string | null; popularity: number | null }> {
  try {
    const token = await getSpotifyToken()
    if (!token) return { image_url: null, popularity: null }
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&market=JP&limit=5`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return { image_url: null, popularity: null }
    const data = await res.json()
    const artists: { name: string; images: { url: string }[]; popularity: number }[] = data.artists?.items ?? []
    if (artists.length === 0) return { image_url: null, popularity: null }
    const match = artists.find(a => norm(a.name) === norm(name)) ?? artists[0]
    return {
      image_url: match.images?.[0]?.url ?? null,
      popularity: match.popularity ?? null,
    }
  } catch { return { image_url: null, popularity: null } }
}

// ---- Wikidata ----
function getStringClaim(entity: Record<string, unknown>, prop: string): string | null {
  const claims = (entity.claims as Record<string, { mainsnak: { snaktype: string; datavalue?: { value: unknown } } }[]> | undefined)?.[prop]
  if (!claims?.length) return null
  const snak = claims[0].mainsnak
  if (snak.snaktype !== 'value') return null
  const val = snak.datavalue?.value
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) return (val as { text?: string }).text ?? null
  return null
}

async function fetchWikipediaSummary(title: string): Promise<string | null> {
  const res = await fetch(
    `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { 'User-Agent': 'LiveVault/1.0 (livevault.jp)' }, signal: AbortSignal.timeout(6000) }
  ).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json()
  return json.extract ?? null
}

function buildDescription(extract: string | null, fallback: string): string {
  if (!extract) return fallback
  const sentences = extract.split('。').map((s: string) => s.trim()).filter(Boolean)
  let result = ''
  for (const s of sentences.slice(0, 4)) {
    const next = result + s + '。'
    if (next.length > 300) break
    result = next
  }
  return result || sentences[0] + '。'
}

async function enrichFromWikidata(name: string): Promise<{
  description: string | null
  website_url: string | null
  twitter_url: string | null
  instagram_url: string | null
  youtube_url: string | null
  tiktok_url: string | null
  image_url: string | null
} | null> {
  const searchRes = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=ja&type=item&format=json&limit=5`,
    { headers: { 'User-Agent': 'LiveVault/1.0 (livevault.jp)' }, signal: AbortSignal.timeout(8000) }
  ).catch(() => null)
  if (!searchRes?.ok) return null

  const hits: { id: string; label: string; description?: string }[] = (await searchRes.json()).search ?? []
  // 完全一致候補だけ対象
  const exactHit = hits.find(h => norm(h.label) === norm(name))
  if (!exactHit) return null

  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${exactHit.id}.json`, {
    headers: { 'User-Agent': 'LiveVault/1.0 (livevault.jp)' },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json()
  const entity = json.entities?.[exactHit.id]
  if (!entity) return null

  const twitterHandle = getStringClaim(entity, 'P2002')
  const instagramHandle = getStringClaim(entity, 'P2003')
  const youtubeId = getStringClaim(entity, 'P2397')
  const tiktokHandle = getStringClaim(entity, 'P7085')
  const websiteRaw = getStringClaim(entity, 'P856')
  const imageFilename = getStringClaim(entity, 'P18')
  const wikiImage = imageFilename
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageFilename)}?width=400`
    : null

  const jaWikiTitle = (entity.sitelinks as Record<string, { title: string }> | undefined)?.jawiki?.title ?? null
  const wikiTitle = jaWikiTitle ?? exactHit.label
  const extract = wikiTitle ? await fetchWikipediaSummary(wikiTitle) : null
  const wikidataDesc = (entity.descriptions as Record<string, { value: string }> | undefined)?.ja?.value
    ?? (entity.descriptions as Record<string, { value: string }> | undefined)?.en?.value
    ?? exactHit.description ?? ''
  const description = buildDescription(extract, wikidataDesc) || null

  return {
    description,
    website_url: websiteRaw ?? null,
    twitter_url: twitterHandle ? `https://x.com/${twitterHandle}` : null,
    instagram_url: instagramHandle ? `https://instagram.com/${instagramHandle}` : null,
    youtube_url: youtubeId ? `https://www.youtube.com/channel/${youtubeId}` : null,
    tiktok_url: tiktokHandle ? `https://www.tiktok.com/@${tiktokHandle}` : null,
    image_url: wikiImage,
  }
}

export async function POST() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // image_url が null のアーティストを1件取得
  const { data: artist } = await admin
    .from('artists')
    .select('id, name, image_url, description, website_url, twitter_url, instagram_url, youtube_url, tiktok_url')
    .is('image_url', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!artist) {
    return NextResponse.json({ done: true, message: '対象アーティストなし' })
  }

  // 残り件数
  const { count } = await admin.from('artists').select('id', { count: 'exact', head: true }).is('image_url', null)
  const remaining = (count ?? 1) - 1

  // Spotify + Wikidata を並列取得
  const [spotifyResult, wikidataResult] = await Promise.all([
    searchSpotify(artist.name),
    enrichFromWikidata(artist.name),
  ])

  const updates: Record<string, string | number | null> = {}
  let wikiMatched = false

  // 画像: Spotify優先、なければWikidata
  const newImage = spotifyResult.image_url ?? wikidataResult?.image_url ?? null
  if (newImage) updates.image_url = newImage

  // Spotify popularity（常に上書き）
  if (spotifyResult.popularity !== null) updates.spotify_popularity = spotifyResult.popularity

  // Wikidata情報（完全一致した場合のみ、既存データは上書きしない）
  if (wikidataResult) {
    wikiMatched = true
    if (!artist.description && wikidataResult.description) updates.description = wikidataResult.description
    if (!artist.website_url && wikidataResult.website_url) updates.website_url = wikidataResult.website_url
    if (!artist.twitter_url && wikidataResult.twitter_url) updates.twitter_url = wikidataResult.twitter_url
    if (!artist.instagram_url && wikidataResult.instagram_url) updates.instagram_url = wikidataResult.instagram_url
    if (!artist.youtube_url && wikidataResult.youtube_url) updates.youtube_url = wikidataResult.youtube_url
    if (!(artist as unknown as Record<string, unknown>).tiktok_url && wikidataResult.tiktok_url) updates.tiktok_url = wikidataResult.tiktok_url
  }

  // 画像もWikidataも取れなかった場合でも、ダミー値でスキップを記録しないよう
  // image_url に placeholder を入れて再処理対象から外す（空文字で区別）
  // → 取れなかったものは image_url = '' にしてスキップ済みとして管理
  if (!newImage && Object.keys(updates).length === 0) {
    updates.image_url = ''  // 空文字 = 取得試みたが見つからなかった
  }

  if (Object.keys(updates).length > 0) {
    await admin.from('artists').update(updates).eq('id', artist.id)
  }

  return NextResponse.json({
    done: false,
    artist_name: artist.name,
    applied_image: newImage ? (spotifyResult.image_url ? 'spotify' : 'wikidata') : 'none',
    wiki_matched: wikiMatched,
    applied_fields: Object.keys(updates),
    remaining,
  })
}
