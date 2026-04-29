import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import ConcertTabs from '@/components/features/concert/ConcertTabs'
import AttendButton from '@/components/features/concert/AttendButton'
import ConcertShareButton from '@/components/features/concert/ConcertShareButton'
import { Calendar, MapPin } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import { redirect } from 'next/navigation'
import type { Tables } from '@/types/supabase'

type ConcertWithRelations = Tables<'concerts'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

type MetadataConcert = Pick<Tables<'concerts'>, 'venue_name' | 'date' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'name'> | null
  tours: Pick<Tables<'tours'>, 'name' | 'image_url'> | null
}

export const revalidate = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()
  const query = supabase
    .from('concerts')
    .select('venue_name, date, image_url, artists(name), tours(name, image_url)')
  const { data } = await (UUID_RE.test(slug) ? query.eq('id', slug) : query.eq('slug', slug)).single()
  if (!data) return { title: '公演' }
  const d = data as MetadataConcert & { slug?: string }
  const dateStr = new Date(d.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const dateShort = new Date(d.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const title = `${d.artists?.name} ${d.tours?.name ?? ''} ${d.venue_name} ${dateShort} セトリ`
  const description = `${d.artists?.name}「${d.tours?.name ?? 'ライブ'}」${dateStr} ${d.venue_name}のセットリスト・参戦記録・掲示板。ライブのセトリや感想を共有しよう。`
  const image = d.image_url ?? d.tours?.image_url ?? null
  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/concerts/${d.slug ?? slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/concerts/${d.slug ?? slug}`,
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

export default async function ConcertPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const { tab = 'board' } = await searchParams
  const supabase = await createClient()

  // UUID での旧URLは slug にリダイレクト
  if (UUID_RE.test(slug)) {
    const { data: r } = await supabase.from('concerts').select('slug').eq('id', slug).single()
    if (r?.slug) redirect(`/concerts/${r.slug}`)
  }

  const isUuid = UUID_RE.test(slug)
  const query = supabase
    .from('concerts')
    .select('*, artists(id, name, image_url), tours(id, name, image_url)')
  const { data: concert } = await (isUuid ? query.eq('id', slug) : query.eq('slug', slug)).single()

  if (!concert) notFound()

  const [{ count: attendCount }, { data: topSetlist }] = await Promise.all([
    supabase
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('concert_id', concert.id),
    supabase
      .from('setlist_submissions')
      .select('id, votes_count, setlist_songs(song_name, song_type, order_num, is_encore)')
      .eq('concert_id', concert.id)
      .order('votes_count', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const c = concert as ConcertWithRelations & { slug: string }
  const dateStr = new Date(c.date).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  const songs = (topSetlist?.setlist_songs ?? []) as Array<{ song_name: string; song_type: string; order_num: number; is_encore: boolean }>
  const sortedSongs = [...songs].sort((a, b) => a.order_num - b.order_num)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      ...(c.artists ? [{ '@type': 'ListItem', position: 2, name: c.artists.name, item: `${siteUrl}/artists/${(c.artists as any).slug ?? c.artists.id}` }] : []),
      ...(c.tours ? [{ '@type': 'ListItem', position: c.artists ? 3 : 2, name: c.tours.name, item: `${siteUrl}/tours/${(c.tours as any).slug ?? c.tours.id}` }] : []),
      { '@type': 'ListItem', position: (c.artists ? 1 : 0) + (c.tours ? 1 : 0) + 2, name: c.venue_name },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: `${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name}`,
    startDate: c.start_time ? `${c.date}T${c.start_time}+09:00` : c.date,
    location: {
      '@type': 'MusicVenue',
      name: c.venue_name,
      address: c.venue_address ?? undefined,
    },
    performer: c.artists ? {
      '@type': 'MusicGroup',
      name: c.artists.name,
    } : undefined,
    image: c.image_url || c.tours?.image_url || undefined,
    url: `${siteUrl}/concerts/${c.slug ?? slug}`,
    ...(sortedSongs.length > 0 ? {
      workPerformed: sortedSongs
        .filter(s => s.song_type === 'song')
        .map(s => ({ '@type': 'MusicComposition', name: s.song_name })),
    } : {}),
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">ホーム</Link>
        <span>/</span>
        {c.artists && (
          <>
            <Link href={`/artists/${(c.artists as any).slug ?? c.artists.id}`} className="hover:text-white transition-colors">{c.artists.name}</Link>
            <span>/</span>
          </>
        )}
        {c.tours && (
          <>
            <Link href={`/tours/${(c.tours as any).slug ?? c.tours.id}`} className="hover:text-white transition-colors">{c.tours.name}</Link>
            <span>/</span>
          </>
        )}
        <span className="text-white">{c.venue_name}</span>
      </nav>

      {/* アートワーク + 公演情報 */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="relative h-48 sm:h-64 bg-gradient-to-br from-violet-900/60 to-pink-900/40">
          {(c.image_url || c.tours?.image_url) && (
            <img src={c.image_url ?? c.tours?.image_url ?? undefined} alt={`${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name}`.trim()} className="w-full h-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 flex items-end p-5">
            <div className="space-y-1">
              {c.artists && (
                <Link href={`/artists/${(c.artists as any).slug ?? c.artists.id}`}
                  className="text-sm text-violet-300 font-bold hover:text-violet-200 transition-colors">
                  {c.artists.name}
                </Link>
              )}
              {c.tours && (
                <p className="text-lg font-black text-white leading-tight">{c.tours.name}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[#8888aa]">
              <Calendar size={14} className="shrink-0" />
              <span>{dateStr}</span>
              {c.start_time && <span className="text-white font-medium">{c.start_time.slice(0, 5)} 開演</span>}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#8888aa]">
              <MapPin size={14} className="shrink-0" />
              <span className="text-white font-medium">{c.venue_name}</span>
            </div>
            {c.venue_address && (
              <div className="flex items-center gap-2 text-xs text-[#8888aa]">
                <span className="w-4" />
                <span>{c.venue_address}</span>
              </div>
            )}
          </div>

          {/* 参戦登録 + シェア */}
          <div className="flex items-center gap-3 flex-wrap">
            <AttendButton concertId={c.id} />
            <span className="text-sm text-[#8888aa]">
              <span className="text-white font-bold">{attendCount ?? 0}</span> 人が参戦登録
            </span>
            <ConcertShareButton
              url={`${siteUrl}/concerts/${c.slug ?? slug}`}
              title={`${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name} ${new Date(c.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`}
            />
          </div>
        </div>
      </div>

      {/* タブコンテンツ */}
      <ConcertTabs
        concertId={c.id}
        activeTab={tab}
        tourId={c.tours?.id ?? null}
        concertTitle={`${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name} ${new Date(c.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`}
      />

      {/* SEO用セトリ静的テキスト（投票数最多） */}
      {sortedSongs.length > 0 && (() => {
        const mainSongs = sortedSongs.filter(s => s.song_type === 'song' && !s.is_encore)
        const encoreSongs = sortedSongs.filter(s => s.song_type === 'song' && s.is_encore)
        return (
          <section className="glass rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold text-white">
              セットリスト（{c.artists?.name}{c.tours ? ` ${c.tours.name}` : ''} {new Date(c.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} {c.venue_name}）
            </h2>
            {mainSongs.length > 0 && (
              <ol className="space-y-1.5">
                {mainSongs.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="text-[#8888aa] w-6 text-right shrink-0 font-mono">{i + 1}</span>
                    <span className="text-[#ccccdd]">{s.song_name}</span>
                  </li>
                ))}
              </ol>
            )}
            {encoreSongs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Encore</p>
                <ol className="space-y-1.5">
                  {encoreSongs.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="text-[#8888aa] w-6 text-right shrink-0 font-mono">E{i + 1}</span>
                      <span className="text-[#ccccdd]">{s.song_name}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p className="text-xs text-[#8888aa]">※ 最も投票数の多いセトリを表示。他のセトリ投稿・修正はセトリタブから。</p>
          </section>
        )
      })()}
    </div>
  )
}
