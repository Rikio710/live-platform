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
import { permanentRedirect } from 'next/navigation'
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
const SHORT_ID_RE = /^[0-9a-f]{8}$/i

function shortIdRange(shortId: string) {
  const lo = `${shortId}-0000-0000-0000-000000000000`
  const hi = `${(parseInt(shortId, 16) + 1).toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`
  return { lo, hi }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()
  const query = supabase
    .from('concerts')
    .select('id, venue_name, date, image_url, artists(name), tours(name, image_url)')
  let metaQuery = UUID_RE.test(slug) ? query.eq('id', slug) : SHORT_ID_RE.test(slug) ? (() => { const { lo, hi } = shortIdRange(slug); return query.gte('id', lo).lt('id', hi) })() : query.eq('slug', slug)
  const { data } = await metaQuery.single()
  if (!data) return { title: '公演' }
  const d = data as MetadataConcert & { id: string; slug?: string }
  const shortId = d.id.slice(0, 8)
  const dateStr = new Date(d.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
  const dateShort = new Date(d.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const title = `${d.artists?.name} ${d.tours?.name ?? ''} ${d.venue_name} ${dateShort} セトリ・セットリスト`
  const description = `${d.artists?.name}「${d.tours?.name ?? 'ライブ'}」${dateStr} ${d.venue_name}のセットリスト全曲を確認。参戦者のリアルな感想・掲示板・参戦登録も。`
  const image = d.image_url ?? d.tours?.image_url ?? null
  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/concerts/${shortId}`,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/concerts/${shortId}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
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
  const { tab = 'setlist' } = await searchParams
  const supabase = await createClient()

  // UUID での旧URLは短縮URLにリダイレクト
  if (UUID_RE.test(slug)) {
    permanentRedirect(`/concerts/${slug.slice(0, 8)}`)
  }

  const query = supabase
    .from('concerts')
    .select('*, artists(id, name, image_url), tours(id, name, image_url)')
  const pageQuery = SHORT_ID_RE.test(slug) ? (() => { const { lo, hi } = shortIdRange(slug); return query.gte('id', lo).lt('id', hi) })() : query.eq('slug', slug)
  const { data: concert } = await pageQuery.single()

  if (!concert) notFound()

  const [{ count: attendCount }, { data: topSetlist }, { data: tourConcerts }, { data: concertArtists }] = await Promise.all([
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
    concert.tour_id
      ? supabase
          .from('concerts')
          .select('id, venue_name, date, setlist_submissions(id)')
          .eq('tour_id', concert.tour_id)
          .neq('id', concert.id)
          .order('date', { ascending: true })
          .limit(20)
      : { data: [] },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('concert_artists')
      .select('artists(id, name, image_url)')
      .eq('concert_id', concert.id)
      .order('order_num'),
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
      ...(c.artists ? [{ '@type': 'ListItem', position: 2, name: c.artists.name, item: `${siteUrl}/artists/${c.artists.id.slice(0, 8)}` }] : []),
      ...(c.tours ? [{ '@type': 'ListItem', position: c.artists ? 3 : 2, name: c.tours.name, item: `${siteUrl}/tours/${c.tours.id.slice(0, 8)}` }] : []),
      { '@type': 'ListItem', position: (c.artists ? 1 : 0) + (c.tours ? 1 : 0) + 2, name: c.venue_name },
    ],
  }

  const concertDescription = `${c.artists?.name}の${c.venue_name}（${dateStr}）のセットリスト・ライブ参戦記録です。セトリ投稿・感想の共有・掲示板での交流ができます。`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: `${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name}`,
    description: concertDescription,
    startDate: c.start_time ? `${c.date}T${c.start_time}+09:00` : c.date,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'ja',
    location: {
      '@type': 'MusicVenue',
      name: c.venue_name,
      address: c.venue_address ? {
        '@type': 'PostalAddress',
        streetAddress: c.venue_address,
        addressCountry: 'JP',
      } : undefined,
    },
    performer: c.artists ? {
      '@type': 'MusicGroup',
      name: c.artists.name,
      image: c.artists.image_url ?? undefined,
    } : undefined,
    image: c.image_url || c.tours?.image_url || c.artists?.image_url || undefined,
    url: `${siteUrl}/concerts/${c.id.slice(0, 8)}`,
    ...(sortedSongs.length > 0 ? {
      workPerformed: sortedSongs
        .filter(s => s.song_type === 'song')
        .map(s => ({ '@type': 'MusicComposition', name: s.song_name })),
    } : {}),
  }

  const songTracks = sortedSongs.filter(s => s.song_type === 'song')
  const playlistLd = songTracks.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'MusicPlaylist',
    name: `${c.artists?.name ?? ''}${c.tours ? ` ${c.tours.name}` : ''} ${new Date(c.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })} ${c.venue_name} セットリスト`,
    numTracks: songTracks.length,
    track: songTracks.map((s, i) => ({
      '@type': 'MusicRecording',
      name: s.song_name,
      position: i + 1,
    })),
  } : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {playlistLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(playlistLd) }} />}
      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">ホーム</Link>
        <span>/</span>
        {c.artists && (
          <>
            <Link href={`/artists/${c.artists.id.slice(0, 8)}`} className="hover:text-white transition-colors">{c.artists.name}</Link>
            <span>/</span>
          </>
        )}
        {c.tours && (
          <>
            <Link href={`/tours/${c.tours.id.slice(0, 8)}`} className="hover:text-white transition-colors">{c.tours.name}</Link>
            <span>/</span>
          </>
        )}
        <span className="text-white">{c.venue_name}</span>
      </nav>

      {/* アートワーク + 公演情報 */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="relative h-48 sm:h-64 bg-gradient-to-br from-[#282828]/60 to-[#282828]/40">
          {(c.image_url || c.tours?.image_url || c.artists?.image_url) && (
            <img src={c.image_url ?? c.tours?.image_url ?? c.artists?.image_url ?? undefined} alt={`${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name}`.trim()} className="w-full h-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 flex items-end p-5">
            <div className="space-y-1">
              {c.artists && (
                <Link href={`/artists/${c.artists.id.slice(0, 8)}`}
                  className="text-sm text-[#b3b3b3] font-bold hover:text-white transition-colors">
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

          {/* 出演アーティスト（対バン） */}
          {(concertArtists ?? []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...(c.artists ? [c.artists] : []), ...(concertArtists as any[]).map((ca: any) => ca.artists).filter(Boolean)].map((a: any) => (
                <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
                  className="flex items-center gap-1.5 border border-white/10 hover:border-white/20 text-[#b3b3b3] hover:text-white text-xs px-3 py-1.5 rounded-full transition-colors">
                  {a.image_url && <img src={a.image_url} alt={a.name} className="w-4 h-4 rounded-full object-cover" />}
                  {a.name}
                </Link>
              ))}
            </div>
          )}

          {/* 参戦登録 + シェア */}
          <div className="flex items-center gap-3 flex-wrap">
            <AttendButton concertId={c.id} />
            {(attendCount ?? 0) > 0 ? (
              <span className="text-sm text-[#8888aa]">
                <span className="text-white font-bold">{attendCount}</span> 人が参戦登録
              </span>
            ) : (
              <span className="text-sm text-[#8888aa]">最初の参戦登録をしよう</span>
            )}
            <ConcertShareButton
              url={`${siteUrl}/concerts/${c.id.slice(0, 8)}`}
              title={`${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name} ${new Date(c.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`}
            />
          </div>
        </div>
      </div>

      {/* SEO説明文 */}
      <p className="text-sm text-[#8888aa] leading-relaxed">
        {concertDescription}
      </p>

      {/* タブコンテンツ */}
      <ConcertTabs
        concertId={c.id}
        activeTab={tab}
        tourId={c.tours?.id ?? null}
        concertTitle={`${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name} ${new Date(c.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`}
        artistName={c.artists?.name ?? undefined}
        concertDate={c.date}
        venueName={c.venue_name}
        initialSongCount={sortedSongs.filter(s => s.song_type === 'song').length || undefined}
      />

      {/* 同ツアーの他の公演 */}
      {c.tours && (tourConcerts ?? []).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">このツアーの他の公演</h2>
            <Link href={`/tours/${c.tours.id.slice(0, 8)}`}
              className="text-xs text-[#8888aa] hover:text-white transition-colors">
              ツアー全公演を見る →
            </Link>
          </div>
          <div className="space-y-2">
            {(tourConcerts as any[]).map(t => {
              const hasSetlist = (t.setlist_submissions ?? []).length > 0
              const isCurrent = t.id === c.id
              return (
                <Link key={t.id} href={`/concerts/${t.id.slice(0, 8)}`}
                  className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
                  <span className="text-xs text-[#8888aa] shrink-0 w-20 font-mono">{t.date}</span>
                  <span className="flex-1 text-sm text-white group-hover:text-[#b3b3b3] transition-colors truncate">{t.venue_name}</span>
                  {hasSetlist && (
                    <span className="text-xs text-violet-400 border border-violet-500/30 bg-violet-500/10 rounded-full px-2 py-0.5 shrink-0">セトリあり</span>
                  )}
                  <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* SEO用セトリ静的テキスト（投票数最多） */}
      {sortedSongs.length > 0 && (() => {
        const mainSongs = sortedSongs.filter(s => s.song_type === 'song' && !s.is_encore)
        const encoreSongs = sortedSongs.filter(s => s.song_type === 'song' && s.is_encore)
        return (
          <section className="sr-only" aria-hidden="true">
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
                <p className="text-[10px] font-bold text-[#b3b3b3] uppercase tracking-widest">Encore</p>
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
