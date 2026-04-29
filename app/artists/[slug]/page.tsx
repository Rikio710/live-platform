import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Mic2, Route, Globe } from 'lucide-react'
import FollowButton from '@/components/features/artist/FollowButton'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import { redirect } from 'next/navigation'
import type { Tables } from '@/types/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ArtistTour = Pick<Tables<'tours'>, 'id' | 'name' | 'start_date' | 'end_date' | 'image_url' | 'slug'>

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()
  const query = supabase.from('artists').select('name, description, image_url')
  const { data } = await (UUID_RE.test(slug) ? query.eq('id', slug) : query.eq('slug', slug)).single()
  if (!data) return { title: 'アーティスト' }
  const title = `${data.name} セトリ・ライブ情報 2026`
  const description = `${data.name}のセットリスト・ライブ・コンサート情報を公演ごとに記録。参戦レポート・掲示板・参戦履歴管理も。${data.description ? data.description.slice(0, 40) : ''}`
  const image = data.image_url ?? null
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/artists/${slug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: data.name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  if (UUID_RE.test(slug)) {
    const { data: r } = await supabase.from('artists').select('slug').eq('id', slug).single()
    if (r?.slug) redirect(`/artists/${r.slug}`)
  }

  const isUuid = UUID_RE.test(slug)
  const { data: artist } = await (isUuid
    ? supabase.from('artists').select('*').eq('id', slug)
    : supabase.from('artists').select('*').eq('slug', slug)
  ).single()
  if (!artist) notFound()

  const { data: tours } = await supabase
    .from('tours').select('id, name, start_date, end_date, image_url, slug')
    .eq('artist_id', artist.id).order('start_date', { ascending: false })

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: artist.name },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: artist.name,
    description: artist.description ?? undefined,
    image: artist.image_url ?? undefined,
    url: `${siteUrl}/artists/${artist.slug ?? slug}`,
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        {artist.image_url ? (
          <img src={artist.image_url} alt={artist.name} className="w-20 h-20 rounded-2xl object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-800 to-pink-800 flex items-center justify-center">
            <Mic2 size={32} className="text-white/70" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black text-white">{artist.name}</h1>
          {artist.description && (
            <p className="text-sm text-[#8888aa] mt-1 leading-relaxed">{artist.description}</p>
          )}
          {(artist.website_url || artist.twitter_url || artist.instagram_url || artist.youtube_url) && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {artist.website_url && (
                <a href={artist.website_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  <Globe size={12} /> 公式サイト
                </a>
              )}
              {artist.twitter_url && (
                <a href={artist.twitter_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  X
                </a>
              )}
              {artist.instagram_url && (
                <a href={artist.instagram_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  Instagram
                </a>
              )}
              {artist.youtube_url && (
                <a href={artist.youtube_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                  YouTube
                </a>
              )}
            </div>
          )}
          <div className="mt-3">
            <FollowButton artistId={artist.id} />
          </div>
        </div>
      </div>

      {/* SEOテキスト */}
      <p className="text-xs text-[#8888aa] leading-relaxed">
        {artist.name}のライブ・コンサートのセットリスト（セトリ）・参戦記録・掲示板。ツアーごとに公演情報・セトリ速報を確認できます。
      </p>

      {/* ツアー一覧 */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white">ツアー・ライブ情報</h2>
        {(tours ?? []).length === 0 ? (
          <p className="text-sm text-[#8888aa]">ツアー情報がありません</p>
        ) : (
          <div className="space-y-3">
            {(tours ?? [] as ArtistTour[]).map((t) => (
              <Link key={t.id} href={`/tours/${t.slug ?? t.id}`}
                className="glass rounded-2xl p-5 flex items-center gap-4 hover:border-violet-500/40 transition-colors group">
                {t.image_url ? (
                  <img src={t.image_url} alt={t.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-800/60 to-pink-800/60 shrink-0 flex items-center justify-center">
                    <Route size={22} className="text-white/60" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate">{t.name}</p>
                  {(t.start_date || t.end_date) && (
                    <p className="text-xs text-[#8888aa] mt-0.5">
                      {t.start_date && new Date(t.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {t.start_date && t.end_date && ' 〜 '}
                      {t.end_date && new Date(t.end_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
                <span className="text-[#8888aa] group-hover:text-violet-300 transition-colors">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
