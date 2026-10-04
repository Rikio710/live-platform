import { createPublicClient } from '@/lib/supabase/public'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Music } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import ArticlePromoCard from '@/components/features/article/ArticlePromoCard'
import { articlePath, displayTitle, getArtistArticle } from '@/lib/articles'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_RE = /^[0-9a-f]{8}$/i

function shortIdRange(shortId: string) {
  const lo = `${shortId}-0000-0000-0000-000000000000`
  const hi = `${(parseInt(shortId, 16) + 1).toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`
  return { lo, hi }
}

export const revalidate = 3600

/** 初回アクセス時に生成してキャッシュ（ISR） */
export function generateStaticParams() {
  return []
}

async function fetchSong(id: string) {
  const supabase = createPublicClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (supabase as any)
    .from('songs')
    .select('id, name, album_name, release_year, spotify_track_id, image_url, spotify_artist_name, artist_id, artists(id, name, slug)')
  if (UUID_RE.test(id)) return base.eq('id', id).single()
  if (SHORT_ID_RE.test(id)) {
    const { lo, hi } = shortIdRange(id)
    return base.gte('id', lo).lt('id', hi).single()
  }
  return { data: null }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { data: song } = await fetchSong(id)
  if (!song) return { title: '曲' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = song as any
  const artistName = s.spotify_artist_name ?? s.artists?.name ?? ''
  const title = `${s.name}${artistName ? ` / ${artistName}` : ''} セトリ演奏履歴 | LiveVault`
  const description = `${artistName}「${s.name}」が演奏されたライブ・コンサートの一覧。セットリスト記録をLiveVaultで確認。`
  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/songs/${s.id.slice(0, 8)}` },
    openGraph: {
      title,
      description,
      ...(s.image_url ? { images: [{ url: s.image_url }] } : {}),
    },
  }
}

export default async function SongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: song } = await fetchSong(id)
  if (!song) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = song as any
  const artistName = s.spotify_artist_name ?? s.artists?.name ?? ''
  const supabase = createPublicClient()

  // 演奏された公演一覧（song_idが紐付いているもの）
  const { data: performances } = await supabase
    .from('setlist_songs')
    .select('concert_id, is_encore, concerts(id, date, venue_name, artists(name), tours(name))')
    .eq('song_id', s.id)
    .eq('song_type', 'song')

  // concert_idで重複除去して日付降順
  const concertMap = new Map<string, any>() // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const p of (performances ?? []) as any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!p.concerts || concertMap.has(p.concert_id)) continue
    concertMap.set(p.concert_id, { ...p.concerts, is_encore: p.is_encore })
  }
  const concerts = [...concertMap.values()].sort((a, b) => b.date.localeCompare(a.date))
  const standardSongsArticle = await getArtistArticle(supabase, s.artist_id)

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center gap-5">
        {s.image_url ? (
          <img src={s.image_url} alt={s.name} className="w-24 h-24 rounded-2xl object-cover shrink-0" />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-[#282828] flex items-center justify-center shrink-0">
            <Music size={32} className="text-white/30" />
          </div>
        )}
        <div className="space-y-1 min-w-0">
          {artistName && (
            <Link href={s.artists?.slug ? `/artists/${s.artists.slug}` : `/artists/${(s.artist_id as string).slice(0, 8)}`}
              className="text-xs text-[#b3b3b3] hover:text-white transition-colors">
              {artistName}
            </Link>
          )}
          <h1 className="text-2xl font-black text-white leading-tight">{s.name}</h1>
          {s.album_name && (
            <p className="text-sm text-[#8888aa]">{s.album_name}{s.release_year ? ` · ${s.release_year}` : ''}</p>
          )}
          <p className="text-xs text-[#555577]">{concerts.length}公演で演奏</p>
        </div>
      </div>

      {/* Spotifyプレイヤー */}
      {s.spotify_track_id && (
        <iframe
          src={`https://open.spotify.com/embed/track/${s.spotify_track_id}?utm_source=generator`}
          width="100%"
          height="80"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="rounded-xl"
        />
      )}

      {/* 記事への導線（定番曲ランキング） */}
      {standardSongsArticle && (
        <ArticlePromoCard href={articlePath(standardSongsArticle)} title={displayTitle(standardSongsArticle)} label={`${artistName}のライブ定番曲をチェック`} />
      )}

      {/* 演奏履歴 */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-[#8888aa] uppercase tracking-widest">演奏された公演</p>
        {concerts.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-[#8888aa]">記録がありません</div>
        ) : (
          <div className="space-y-2">
            {concerts.map(c => (
              <Link
                key={c.id}
                href={`/concerts/${(c.id as string).slice(0, 8)}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  {c.artists?.name && <p className="text-xs text-[#b3b3b3]">{c.artists.name}</p>}
                  <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">
                    {c.tours?.name ?? c.venue_name}
                  </p>
                  <p className="text-xs text-[#8888aa]">
                    {c.date}{c.tours?.name ? ` — ${c.venue_name}` : ''}
                    {c.is_encore && <span className="ml-2 text-[#555577]">アンコール</span>}
                  </p>
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
