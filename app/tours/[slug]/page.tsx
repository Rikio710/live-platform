import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import { permanentRedirect } from 'next/navigation'
import type { Tables } from '@/types/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_RE = /^[0-9a-f]{8}$/i

function shortIdRange(shortId: string) {
  const lo = `${shortId}-0000-0000-0000-000000000000`
  const hi = `${(parseInt(shortId, 16) + 1).toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`
  return { lo, hi }
}

type TourWithArtists = Tables<'tours'> & {
  tour_artists: { artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url' | 'slug'> | null }[]
}

type TourConcert = Pick<Tables<'concerts'>, 'id' | 'slug' | 'venue_name' | 'venue_address' | 'date' | 'start_time' | 'image_url'> & {
  setlist_submissions: { id: string }[]
}

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = (supabase as any).from('tours').select('id, name, image_url, start_date, end_date, tour_artists(artists(name))')
  let metaQuery = UUID_RE.test(slug) ? query.eq('id', slug) : SHORT_ID_RE.test(slug) ? (() => { const { lo, hi } = shortIdRange(slug); return query.gte('id', lo).lt('id', hi) })() : query.eq('slug', slug)
  const { data } = await metaQuery.single()
  if (!data) return { title: 'ツアー' }
  const metaTour = data as { id: string; name: string; image_url: string | null; start_date: string | null; end_date: string | null; tour_artists: { artists: { name: string } | null }[] }
  const artistName = metaTour.tour_artists?.map(ta => ta.artists?.name).filter(Boolean).join(' / ') ?? ''

  const { count: concertCount } = await supabase
    .from('concerts')
    .select('id', { count: 'exact', head: true })
    .eq('tour_id', metaTour.id)

  const year = metaTour.start_date ? new Date(metaTour.start_date).getFullYear() : null
  const countText = concertCount ? `全${concertCount}公演` : ''
  const yearText = year ? `【${year}年】` : ''
  const title = `${artistName} ${data.name} セトリ・セットリスト一覧 ${countText}${yearText}`.trim()
  const description = `${artistName}「${data.name}」${countText}のセットリスト（セトリ）を会場別に速報公開。参戦者の感想・掲示板・セトリ投稿受付中。ライブ体験をLiveVaultで記録・共有しよう。`
  const image = metaTour.image_url ?? null
  const canonicalSlug = SHORT_ID_RE.test(slug) ? slug : metaTour.id.slice(0, 8)
  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/tours/${canonicalSlug}`,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/tours/${canonicalSlug}`,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

type SongStat = { name: string; count: number; isEncore: boolean; pct: number }
type AnalysisData = {
  songs: SongStat[]
  totalWithData: number
  totalConcerts: number
  uniqueSongs: number
  avgSongs: number
}

export default async function TourPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug: rawSlug } = await params
  const { tab = 'concerts' } = await searchParams
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  if (UUID_RE.test(slug)) {
    permanentRedirect(`/tours/${slug.slice(0, 8)}`)
  }

  const { data: tourRaw } = await (() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (supabase as any).from('tours').select('*, tour_artists(artists(id, name, image_url, slug))')
    if (SHORT_ID_RE.test(slug)) {
      const { lo, hi } = shortIdRange(slug)
      return q.gte('id', lo).lt('id', hi)
    }
    return q.eq('slug', slug)
  })().single()

  if (!tourRaw) notFound()

  const tour = tourRaw as TourWithArtists
  const tourArtistList = (tour.tour_artists ?? []).map(ta => ta.artists).filter(Boolean) as Pick<Tables<'artists'>, 'id' | 'name' | 'image_url' | 'slug'>[]
  const firstArtist = tourArtistList[0] ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: concertsRaw } = await (supabase as any)
    .from('concerts')
    .select('id, slug, venue_name, venue_address, date, start_time, image_url, setlist_submissions(id), concert_artists(artists(id, name, image_url))')
    .eq('tour_id', tour.id)
    .order('date', { ascending: true })
  const concerts = concertsRaw as (TourConcert & { concert_artists: { artists: { id: string; name: string; image_url: string | null } | null }[] })[] | null
  const today = new Date().toISOString().split('T')[0]

  // セトリ分析データ（tabがanalysisのときのみ取得）
  let analysisData: AnalysisData | null = null
  const concertList = concerts ?? []
  if (tab === 'analysis' && concertList.length > 0) {
    const concertIds = concertList.map(c => c.id)
    const { data: submissions } = await supabase
      .from('setlist_submissions')
      .select('id, concert_id, votes_count, setlist_songs(song_id, song_name, song_type, is_encore)')
      .in('concert_id', concertIds)
      .order('votes_count', { ascending: false })

    // concert_idごとに最多投票のsubmissionだけ使う
    const topPerConcert = new Map<string, { setlist_songs: { song_id: string | null; song_name: string; song_type: string; is_encore: boolean | null }[] }>()
    for (const sub of submissions ?? []) {
      if (!topPerConcert.has(sub.concert_id)) topPerConcert.set(sub.concert_id, sub)
    }

    const totalWithData = topPerConcert.size
    // song_id があればそれで、なければ正規化した曲名でキー
    const songMap = new Map<string, { count: number; isEncore: boolean; name: string }>()
    let totalSongCount = 0

    for (const sub of topPerConcert.values()) {
      const tracks = (sub.setlist_songs ?? []).filter(s => s.song_type === 'song')
      totalSongCount += tracks.length
      for (const song of tracks) {
        const key = song.song_id ?? song.song_name.trim().toLowerCase()
        const existing = songMap.get(key)
        if (existing) {
          existing.count++
        } else {
          songMap.set(key, { count: 1, isEncore: song.is_encore ?? false, name: song.song_name.trim() })
        }
      }
    }

    const songs: SongStat[] = [...songMap.values()]
      .map(({ count, isEncore, name }) => ({
        name, count, isEncore, pct: totalWithData > 0 ? Math.round(count / totalWithData * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

    analysisData = {
      songs,
      totalWithData,
      totalConcerts: concertIds.length,
      uniqueSongs: songs.length,
      avgSongs: totalWithData > 0 ? Math.round(totalSongCount / totalWithData * 10) / 10 : 0,
    }
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      ...(firstArtist ? [{ '@type': 'ListItem', position: 2, name: firstArtist.name, item: `${siteUrl}/artists/${firstArtist.id.slice(0, 8)}` }] : []),
      { '@type': 'ListItem', position: firstArtist ? 3 : 2, name: tour.name },
    ],
  }

  const firstConcert = (concerts ?? [])[0]
  const allArtistNames = tourArtistList.map(a => a.name).join(' / ')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: tour.name,
    performer: tourArtistList.length > 0 ? tourArtistList.map(a => ({ '@type': 'MusicGroup', name: a.name })) : undefined,
    image: tour.image_url ?? undefined,
    url: `${siteUrl}/tours/${tour.id.slice(0, 8)}`,
    ...(tour.start_date ? { startDate: tour.start_date } : {}),
    ...(tour.end_date ? { endDate: tour.end_date } : {}),
    ...(firstConcert ? {
      location: {
        '@type': 'MusicVenue',
        name: firstConcert.venue_name,
        ...(firstConcert.venue_address ? { address: firstConcert.venue_address } : {}),
      },
    } : {}),
    subEvent: (concerts ?? []).map(c => ({
      '@type': 'MusicEvent',
      name: `${allArtistNames} ${tour.name} ${c.venue_name}`,
      startDate: c.start_time ? `${c.date}T${c.start_time}+09:00` : c.date,
      location: {
        '@type': 'MusicVenue',
        name: c.venue_name,
        address: c.venue_address ?? undefined,
      },
      url: `${siteUrl}/concerts/${c.id.slice(0, 8)}`,
    })),
  }

  const concertCount = (concerts ?? []).length
  const headerImage = tour.image_url ?? firstArtist?.image_url ?? null
  const dateRangeText = (() => {
    if (tour.start_date && tour.end_date) {
      const s = new Date(tour.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      const e = new Date(tour.end_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      return `${s} 〜 ${e}`
    }
    if (tour.start_date) return new Date(tour.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }) + '〜'
    return null
  })()
  const seoDescription = `${allArtistNames}「${tour.name}」全${concertCount}公演のセットリスト（セトリ）・参戦記録。${dateRangeText ? `${dateRangeText}開催。` : ''}各会場のセトリ速報・ライブレポ・掲示板を公演ごとに確認できます。`

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">ホーム</Link>
        <span>/</span>
        {tourArtistList.map((a, i) => (
          <span key={a.id} className="inline-flex items-center gap-1">
            <Link href={`/artists/${a.id.slice(0, 8)}`} className="hover:text-white transition-colors">{a.name}</Link>
            {i < tourArtistList.length - 1 && <span className="text-[#555566]">/</span>}
          </span>
        ))}
        {tourArtistList.length > 0 && <span>/</span>}
        <span className="text-white">{tour.name}</span>
      </nav>

      {/* ヘッダー画像 + ツアー情報 */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="relative h-40 sm:h-56 bg-gradient-to-br from-[#282828]/60 to-[#282828]/40">
          {headerImage && (
            <img src={headerImage} alt={tour.name} className="w-full h-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 flex items-end p-5">
            <div className="space-y-1">
              {tourArtistList.map(a => (
                <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
                  className="inline-flex items-center gap-2 text-sm text-[#b3b3b3] hover:text-white transition-colors">
                  {a.image_url && (
                    <img src={a.image_url} alt={a.name} className="w-5 h-5 rounded-full object-cover" />
                  )}
                  {a.name}
                </Link>
              ))}
              <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">{tour.name}</h1>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-wrap gap-x-5 gap-y-1.5">
          {dateRangeText && (
            <p className="text-sm text-[#8888aa] flex items-center gap-1.5">
              <Calendar size={13} className="shrink-0" />
              {dateRangeText}
            </p>
          )}
          <p className="text-sm text-[#8888aa]">全 <span className="text-white font-bold">{concertCount}</span> 公演</p>
        </div>
      </div>

      {/* SEOテキスト */}
      <p className="text-xs text-[#8888aa] leading-relaxed">{seoDescription}</p>

      {/* タブ */}
      <div className="flex gap-0 border-b border-white/10">
        <Link
          href={`/tours/${tour.id.slice(0, 8)}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab !== 'analysis' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          公演一覧
        </Link>
        <Link
          href={`/tours/${tour.id.slice(0, 8)}?tab=analysis`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'analysis' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          セトリ分析
        </Link>
      </div>

      {/* 公演一覧 */}
      <section className="space-y-4" style={{ display: tab === 'analysis' ? 'none' : undefined }}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">公演一覧</h2>
          <span className="text-sm text-[#8888aa]">{(concerts ?? []).length}公演</span>
        </div>
        {(() => {
          const total = concertList.length
          const ended = concertList.filter(c => c.date < today).length
          const ongoing = total > 0 && ended < total
          if (total === 0) return null
          return (
            <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div className="bg-white h-full rounded-full transition-all" style={{ width: `${Math.round(ended / total * 100)}%` }} />
              </div>
              <span className="text-xs text-[#8888aa] shrink-0">
                {ended}/{total}公演終了
                {ongoing && <span className="text-white ml-1.5 font-bold">開催中</span>}
              </span>
            </div>
          )
        })()}

        {(concerts ?? []).length === 0 ? (
          <p className="text-sm text-[#8888aa]">公演情報がありません</p>
        ) : (
          <div className="space-y-3">
            {(concerts ?? []).map((c) => {
              const isPast = c.date < today
              return (
                <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                  className={`glass rounded-2xl p-5 flex items-center gap-4 hover:border-white/20 transition-colors group ${isPast ? 'opacity-60' : ''}`}>
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
                    <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">
                      {c.venue_name}
                    </p>
                    {c.venue_address && (
                      <p className="text-xs text-[#8888aa] mt-0.5 truncate">{c.venue_address}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {c.start_time && (
                        <span className="text-xs text-[#8888aa]">開演 {c.start_time.slice(0, 5)}</span>
                      )}
                      {c.setlist_submissions.length > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-[#b3b3b3] border border-white/20">
                          セットリスト
                        </span>
                      )}
                      {isPast && (
                        <span className="text-xs text-[#8888aa] border border-white/10 rounded-full px-2 py-0.5">終了</span>
                      )}
                    </div>
                    {c.concert_artists.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {c.concert_artists.map(ca => ca.artists).filter(Boolean).map(a => (
                          <span key={a!.id} className="text-[10px] text-[#8888aa] border border-white/10 rounded-full px-2 py-0.5">
                            {a!.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors shrink-0">›</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* セトリ分析 */}
      {tab === 'analysis' && (
        <section className="space-y-6">
          {!analysisData || analysisData.totalWithData === 0 ? (
            <div className="glass rounded-2xl p-10 text-center space-y-2">
              <p className="text-white font-medium">セトリデータがまだありません</p>
              <p className="text-sm text-[#8888aa]">公演に参戦した方はセトリを投稿してください</p>
            </div>
          ) : (
            <>
              {/* サマリー */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'セトリあり', value: `${analysisData.totalWithData}/${analysisData.totalConcerts}公演` },
                  { label: 'ユニーク曲数', value: `${analysisData.uniqueSongs}曲` },
                  { label: '平均曲数', value: `${analysisData.avgSongs}曲` },
                ].map(({ label, value }) => (
                  <div key={label} className="glass rounded-xl p-3 text-center space-y-0.5">
                    <p className="text-white font-bold text-base">{value}</p>
                    <p className="text-[10px] text-[#8888aa]">{label}</p>
                  </div>
                ))}
              </div>

              {/* 曲リスト */}
              {(() => {
                const all = analysisData.songs.filter(s => s.pct === 100)
                const regular = analysisData.songs.filter(s => s.pct >= 30 && s.pct < 100)
                const rare = analysisData.songs.filter(s => s.pct < 30)

                const SongRow = ({ song, tier }: { song: SongStat; tier: 'all' | 'regular' | 'rare' }) => (
                  <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      tier === 'all' ? 'bg-white/80' :
                      tier === 'rare' ? 'bg-amber-400/60' :
                      'bg-white/25'
                    }`} />
                    <span className="flex-1 text-sm text-white min-w-0 truncate">{song.name}</span>
                    {song.isEncore && (
                      <span className="text-[9px] text-[#8888aa] uppercase tracking-widest shrink-0">enc</span>
                    )}
                    {tier === 'all' && (
                      <span className="text-[10px] text-white/40 uppercase tracking-[0.12em] border border-white/15 rounded px-1.5 py-0.5 shrink-0">
                        全公演
                      </span>
                    )}
                    {tier === 'rare' && (
                      <span className="text-[10px] text-amber-400/60 uppercase tracking-[0.12em] border border-amber-400/20 rounded px-1.5 py-0.5 shrink-0">
                        rare
                      </span>
                    )}
                    <span className="text-xs text-[#8888aa] font-mono tabular-nums shrink-0 w-12 text-right">
                      {song.count}/{analysisData!.totalWithData}
                    </span>
                  </div>
                )

                const Section = ({ title, songs, tier }: { title: string; songs: SongStat[]; tier: 'all' | 'regular' | 'rare' }) =>
                  songs.length === 0 ? null : (
                    <div className="glass rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-white/5">
                        <span className="text-[10px] font-bold text-[#8888aa] uppercase tracking-[0.15em]">{title}</span>
                        <span className="ml-2 text-[10px] text-[#8888aa]/60">{songs.length}曲</span>
                      </div>
                      <div className="px-5">
                        {songs.map(s => <SongRow key={s.name} song={s} tier={tier} />)}
                      </div>
                    </div>
                  )

                return (
                  <div className="space-y-3">
                    <Section title="全公演で演奏" songs={all} tier="all" />
                    <Section title="常連曲" songs={regular} tier="regular" />
                    <Section title="レア曲" songs={rare} tier="rare" />
                  </div>
                )
              })()}
            </>
          )}
        </section>
      )}
    </div>
  )
}
