import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import { redirect } from 'next/navigation'
import type { Tables } from '@/types/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TourWithArtist = Tables<'tours'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url' | 'slug'> | null
}

type TourConcert = Pick<Tables<'concerts'>, 'id' | 'slug' | 'venue_name' | 'venue_address' | 'date' | 'start_time' | 'image_url'>

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()
  const query = supabase.from('tours').select('name, image_url, artists(name)')
  const { data } = await (UUID_RE.test(slug) ? query.eq('id', slug) : query.eq('slug', slug)).single()
  if (!data) return { title: 'ツアー' }
  const metaTour = data as { name: string; image_url: string | null; artists: Pick<Tables<'artists'>, 'name'> | null }
  const artistName = metaTour.artists?.name ?? ''
  const title = `${artistName} ${data.name} セトリ・ライブレポ`
  const description = `${artistName}「${data.name}」の全公演セットリスト・参戦記録一覧。各会場のセトリ速報・ライブレポ・掲示板を確認できます。`
  const image = metaTour.image_url ?? null
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/tours/${slug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function TourPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  if (UUID_RE.test(slug)) {
    const { data: r } = await supabase.from('tours').select('slug').eq('id', slug).single()
    if (r?.slug) redirect(`/tours/${r.slug}`)
  }

  const isUuid = UUID_RE.test(slug)
  const { data: tourRaw } = await (isUuid
    ? supabase.from('tours').select('*, artists(id, name, image_url, slug)').eq('id', slug)
    : supabase.from('tours').select('*, artists(id, name, image_url, slug)').eq('slug', slug)
  ).single()

  if (!tourRaw) notFound()

  const tour = tourRaw as TourWithArtist

  const { data: concerts } = await supabase
    .from('concerts')
    .select('id, slug, venue_name, venue_address, date, start_time, image_url')
    .eq('tour_id', tour.id)
    .order('date', { ascending: true })
  const today = new Date().toISOString().split('T')[0]

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      ...(tour.artists ? [{ '@type': 'ListItem', position: 2, name: tour.artists.name, item: `${siteUrl}/artists/${tour.artists.id}` }] : []),
      { '@type': 'ListItem', position: tour.artists ? 3 : 2, name: tour.name },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: tour.name,
    performer: tour.artists ? { '@type': 'MusicGroup', name: tour.artists.name } : undefined,
    image: tour.image_url ?? undefined,
    url: `${siteUrl}/tours/${tour.slug ?? slug}`,
    ...(tour.start_date ? { startDate: tour.start_date } : {}),
    ...(tour.end_date ? { endDate: tour.end_date } : {}),
    subEvent: (concerts ?? []).map(c => ({
      '@type': 'MusicEvent',
      name: `${tour.artists?.name ?? ''} ${tour.name} ${c.venue_name}`,
      startDate: c.start_time ? `${c.date}T${c.start_time}+09:00` : c.date,
      location: {
        '@type': 'MusicVenue',
        name: c.venue_name,
        address: c.venue_address ?? undefined,
      },
      url: `${siteUrl}/concerts/${c.id}`,
    })),
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1">
        <Link href="/" className="hover:text-white transition-colors">ホーム</Link>
        <span>/</span>
        {tour.artists && (
          <>
            <Link href={`/artists/${tour.artists.slug ?? tour.artists.id}`} className="hover:text-white transition-colors">
              {tour.artists.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-white">{tour.name}</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        {tour.artists && (
          <Link href={`/artists/${tour.artists.slug ?? tour.artists.id}`}
            className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200 transition-colors">
            {tour.artists.image_url && (
              <img src={tour.artists.image_url} alt={tour.artists.name} className="w-5 h-5 rounded-full object-cover" />
            )}
            {tour.artists.name}
          </Link>
        )}
        <h1 className="text-2xl font-black text-white">{tour.name}</h1>
        {(tour.start_date || tour.end_date) && (
          <p className="text-sm text-[#8888aa] flex items-center gap-1.5">
            <Calendar size={13} className="shrink-0" />
            {tour.start_date && new Date(tour.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            {tour.start_date && tour.end_date && ' 〜 '}
            {tour.end_date && new Date(tour.end_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>

      {/* SEOテキスト */}
      <p className="text-xs text-[#8888aa] leading-relaxed">
        {tour.artists?.name}「{tour.name}」の全公演セットリスト（セトリ）・参戦記録。各会場のセトリ速報・ライブレポ・掲示板を公演ごとに確認できます。
      </p>

      {/* 公演一覧 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">公演一覧</h2>
          <span className="text-sm text-[#8888aa]">{(concerts ?? []).length}公演</span>
        </div>

        {(concerts ?? []).length === 0 ? (
          <p className="text-sm text-[#8888aa]">公演情報がありません</p>
        ) : (
          <div className="space-y-3">
            {(concerts ?? [] as TourConcert[]).map((c) => {
              const isPast = c.date < today
              return (
                <Link key={c.id} href={`/concerts/${c.slug ?? c.id}`}
                  className={`glass rounded-2xl p-5 flex items-center gap-4 hover:border-violet-500/40 transition-colors group ${isPast ? 'opacity-60' : ''}`}>
                  <div className="shrink-0 text-center w-14">
                    <p className="text-xs text-[#8888aa]">
                      {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short' })}
                    </p>
                    <p className="text-2xl font-black text-white">
                      {new Date(c.date).toLocaleDateString('ja-JP', { day: 'numeric' }).replace('日', '')}
                    </p>
                    <p className="text-xs text-[#8888aa]">
                      {new Date(c.date).toLocaleDateString('ja-JP', { weekday: 'short' })}
                    </p>
                  </div>
                  <div className="w-px h-12 bg-white/10 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate">
                      {c.venue_name}
                    </p>
                    {c.venue_address && (
                      <p className="text-xs text-[#8888aa] mt-0.5 truncate">{c.venue_address}</p>
                    )}
                    {c.start_time && (
                      <p className="text-xs text-[#8888aa] mt-0.5">開演 {c.start_time.slice(0, 5)}</p>
                    )}
                  </div>
                  {isPast && (
                    <span className="text-xs text-[#8888aa] shrink-0 border border-white/10 rounded-full px-2 py-0.5">終了</span>
                  )}
                  <span className="text-[#8888aa] group-hover:text-violet-300 transition-colors shrink-0">›</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
