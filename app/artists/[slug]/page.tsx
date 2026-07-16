import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Mic2, Route, Globe, Tent } from 'lucide-react'
import FollowButton from '@/components/features/artist/FollowButton'
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

type ArtistTour = Pick<Tables<'tours'>, 'id' | 'name' | 'start_date' | 'end_date' | 'image_url' | 'slug'> & {
  concerts: { id: string; setlist_submissions: { id: string }[] }[]
}

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  const baseQuery = supabase.from('artists').select('id, name, description, image_url, website_url, twitter_url, instagram_url, youtube_url')
  let metaQuery = UUID_RE.test(slug) ? baseQuery.eq('id', slug) : SHORT_ID_RE.test(slug) ? (() => { const { lo, hi } = shortIdRange(slug); return baseQuery.gte('id', lo).lt('id', hi) })() : baseQuery.eq('slug', slug)
  const { data } = await metaQuery.single()
  if (!data) return { title: 'アーティスト' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tourLinks } = await (supabase as any).from('tour_artists').select('tour_id').eq('artist_id', data.id)
  const metaTourIds = (tourLinks ?? []).map((tl: { tour_id: string }) => tl.tour_id)
  const { data: tourData } = metaTourIds.length > 0
    ? await supabase.from('tours').select('id, concerts(setlist_submissions(id))').in('id', metaTourIds)
    : { data: [] as { id: string; concerts: { setlist_submissions: { id: string }[] }[] }[] }

  const tourCount = tourData?.length ?? 0
  const setlistCount = (tourData ?? []).reduce((sum, t) => {
    const concerts = (t as any).concerts ?? []
    return sum + concerts.filter((c: any) => c.setlist_submissions?.length > 0).length
  }, 0)

  const canonicalSlug = SHORT_ID_RE.test(slug) ? slug : data.id.slice(0, 8)
  const canonicalUrl = `${siteUrl}/artists/${canonicalSlug}`
  const year = new Date().getFullYear()

  const title = `${data.name}のセトリ・ライブ情報一覧 | LiveVault`

  const descBase = setlistCount > 0
    ? `${data.name}のセットリスト（セトリ）を${setlistCount}公演分公開。ツアーごとの全曲リスト・参戦記録・掲示板をLiveVaultで確認できます。`
    : `${data.name}のライブ・コンサート情報とセットリスト（セトリ）をLiveVaultで確認。参戦記録・セトリ速報・掲示板も充実。`
  const description = data.description
    ? `${descBase}${data.description.slice(0, 40)}…`
    : descBase

  const keywords = [`${data.name} セトリ`, `${data.name} セットリスト`, `${data.name} ライブ`, `${data.name} コンサート`, `${data.name} 参戦`, 'セトリ', 'セットリスト', 'ライブ']

  const image = data.image_url ?? null
  return {
    title,
    description,
    keywords,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      ...(image ? { images: [{ url: image, width: 1200, height: 630, alt: data.name }] } : {}),
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

export default async function ArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { slug: rawSlug } = await params
  const { tab = 'info' } = await searchParams
  const slug = decodeURIComponent(rawSlug)
  const supabase = await createClient()

  if (UUID_RE.test(slug)) {
    permanentRedirect(`/artists/${slug.slice(0, 8)}`)
  }

  const { data: artist } = await (SHORT_ID_RE.test(slug)
    ? (() => { const { lo, hi } = shortIdRange(slug); return supabase.from('artists').select('*').gte('id', lo).lt('id', hi) })()
    : supabase.from('artists').select('*').eq('slug', slug)
  ).single()
  if (!artist) notFound()

  const today = new Date().toISOString().split('T')[0]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: artistTourLinks } = await (supabase as any).from('tour_artists').select('tour_id').eq('artist_id', artist.id)
  const artistTourIds = (artistTourLinks ?? []).map((tl: { tour_id: string }) => tl.tour_id)

  const [{ data: tours }, { data: upcomingConcerts }, { data: setlistConcerts }, { data: festivalConcerts }, { data: taibanConcerts }] = await Promise.all([
    artistTourIds.length > 0
      ? supabase.from('tours').select('id, name, start_date, end_date, image_url, slug, concerts(id, setlist_submissions(id))').in('id', artistTourIds).order('start_date', { ascending: false })
      : Promise.resolve({ data: [] as ArtistTour[] }),
    supabase
      .from('concerts').select('id, venue_name, date, tours(name)')
      .eq('artist_id', artist.id).gte('date', today)
      .order('date', { ascending: true }).limit(3),
    supabase
      .from('concerts').select('id, date, tours(name)')
      .eq('artist_id', artist.id).lt('date', today)
      .order('date', { ascending: false }).limit(1),
    supabase
      .from('concerts')
      .select('id, date, stage_name, festival_events(id, name, start_date, end_date, image_url, festival_groups(id, name))')
      .eq('artist_id', artist.id)
      .not('festival_event_id', 'is', null)
      .order('date', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('concert_artists')
      .select('concerts(id, venue_name, date, tour_id, tours(id, name))')
      .eq('artist_id', artist.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])


  // セトリ分析データ（tabがanalysisのときのみ取得）
  let analysisData: AnalysisData | null = null
  if (tab === 'analysis') {
    const { data: artistConcerts } = await supabase
      .from('concerts')
      .select('id')
      .eq('artist_id', artist.id)
      .lt('date', today)

    const concertIds = (artistConcerts ?? []).map(c => c.id)
    if (concertIds.length > 0) {
      const { data: submissions } = await supabase
        .from('setlist_submissions')
        .select('id, concert_id, votes_count, setlist_songs(song_id, song_name, song_type, is_encore)')
        .in('concert_id', concertIds)
        .order('votes_count', { ascending: false })

      const topPerConcert = new Map<string, { setlist_songs: { song_id: string | null; song_name: string; song_type: string; is_encore: boolean | null }[] }>()
      for (const sub of submissions ?? []) {
        if (!topPerConcert.has(sub.concert_id)) topPerConcert.set(sub.concert_id, sub)
      }

      const totalWithData = topPerConcert.size
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
  }

  const faqItems: { question: string; answer: string }[] = []

  if (upcomingConcerts && upcomingConcerts.length > 0) {
    const lines = (upcomingConcerts as Array<{ id: string; venue_name: string; date: string; tours: { name: string } | null }>)
      .map(c => {
        const dateStr = new Date(c.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
        const tourName = (c.tours as { name: string } | null)?.name
        return tourName ? `${dateStr} ${c.venue_name}（${tourName}）` : `${dateStr} ${c.venue_name}`
      })
    faqItems.push({
      question: `${artist.name}の次のライブはいつ？`,
      answer: `直近の公演：${lines.join('、')}。詳細・セトリ・参戦登録はLiveVaultで確認できます。`,
    })
  }

  const totalSetlistConcerts = (tours ?? []).reduce((sum, t) => {
    const typedTour = t as ArtistTour
    return sum + typedTour.concerts.filter(c => c.setlist_submissions.length > 0).length
  }, 0)
  if (totalSetlistConcerts > 0) {
    faqItems.push({
      question: `${artist.name}のセトリはどこで確認できる？`,
      answer: `LiveVaultでは${artist.name}の${totalSetlistConcerts}公演分のセットリストを公開しています。各ツアーページから会場ごとのセトリを確認できます。`,
    })
  }

  const latestConcert = setlistConcerts?.[0] as { id: string; date: string; tours: { name: string } | null } | undefined
  if (latestConcert) {
    const dateStr = new Date(latestConcert.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    const tourName = (latestConcert.tours as { name: string } | null)?.name
    faqItems.push({
      question: `${artist.name}の最新ライブ情報は？`,
      answer: `直近の公演は${dateStr}${tourName ? `（${tourName}）` : ''}です。LiveVaultではセトリ・参戦記録・掲示板を公開しています。`,
    })
  }

  const faqLd = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  } : null

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: artist.name },
    ],
  }

  const sameAs = [
    artist.website_url,
    artist.twitter_url,
    artist.instagram_url,
    artist.youtube_url,
  ].filter(Boolean) as string[]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: artist.name,
    description: artist.description ?? undefined,
    image: artist.image_url ?? undefined,
    url: `${siteUrl}/artists/${artist.id.slice(0, 8)}`,
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />}
      {/* ヘッダー */}
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          {artist.image_url ? (
            <img src={artist.image_url} alt={artist.name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#333333] to-[#282828] flex items-center justify-center shrink-0">
              <Mic2 size={32} className="text-white/70" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black text-white">{artist.name}</h1>
            {artist.description && (
              <p className="text-sm text-[#8888aa] mt-1 leading-relaxed">{artist.description}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {(artist.website_url || artist.twitter_url || artist.instagram_url || artist.youtube_url || (artist as any).tiktok_url) && (
            <div className="flex items-center gap-2 flex-wrap">
              {artist.website_url && (
                <a href={artist.website_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  <Globe size={12} /> 公式サイト
                </a>
              )}
              {artist.twitter_url && (
                <a href={artist.twitter_url} target="_blank" rel="noopener noreferrer" aria-label="X"
                  className="flex items-center justify-center w-8 h-8 text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              )}
              {artist.instagram_url && (
                <a href={artist.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                  className="flex items-center justify-center w-8 h-8 text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
              )}
              {artist.youtube_url && (
                <a href={artist.youtube_url} target="_blank" rel="noopener noreferrer" aria-label="YouTube"
                  className="flex items-center justify-center w-8 h-8 text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </a>
              )}
              {(artist as any).tiktok_url && (
                <a href={(artist as any).tiktok_url} target="_blank" rel="noopener noreferrer" aria-label="TikTok"
                  className="flex items-center justify-center w-8 h-8 text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 rounded-full transition-colors">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/></svg>
                </a>
              )}
            </div>
          )}
          <FollowButton artistId={artist.id} />
        </div>
      </div>

      {/* SEOテキスト */}
      <p className="text-sm text-[#8888aa] leading-relaxed">
        {artist.name}のライブ・コンサートのセットリスト（セトリ）・参戦記録・掲示板。
        {(tours ?? []).length > 0 && `${(tours ?? []).length}ツアー・`}
        {totalSetlistConcerts > 0
          ? `${totalSetlistConcerts}公演分のセトリを公開中。`
          : 'ツアーごとに公演情報・セトリ速報を確認できます。'}
        各会場のセットリスト全曲・参戦レポート・掲示板もLiveVaultで。
      </p>


      {/* 今後の公演 */}
      {(upcomingConcerts ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-white">今後の公演</h2>
          <div className="space-y-2">
            {(upcomingConcerts as Array<{ id: string; venue_name: string; date: string; tours: { name: string } | null }>).map(c => (
              <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-4 hover:border-white/20 transition-colors group">
                <div className="shrink-0 text-center w-12">
                  <p className="text-xs text-[#8888aa]">
                    {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short' })}
                  </p>
                  <p className="text-xl font-black text-white">
                    {new Date(c.date).toLocaleDateString('ja-JP', { day: 'numeric' }).replace('日', '')}
                  </p>
                  <p className="text-xs text-[#8888aa]">
                    {new Date(c.date).toLocaleDateString('ja-JP', { weekday: 'short' })}
                  </p>
                </div>
                <div className="w-px h-10 bg-white/10 shrink-0" />
                <div className="flex-1 min-w-0">
                  {(c.tours as { name: string } | null)?.name && (
                    <p className="text-xs text-[#b3b3b3] font-bold truncate">{(c.tours as { name: string }).name}</p>
                  )}
                  <p className="text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{c.venue_name}</p>
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 対バン出演 */}
      {tab !== 'analysis' && (taibanConcerts ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-white">対バン・共演</h2>
          <div className="space-y-2">
            {(taibanConcerts as any[]).map((ca: any) => {
              const c = ca.concerts
              if (!c) return null
              return (
                <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                  className="glass rounded-2xl px-4 py-3 flex items-center gap-4 hover:border-white/20 transition-colors group">
                  <div className="shrink-0 text-center w-12">
                    <p className="text-xs text-[#8888aa]">{new Date(c.date).toLocaleDateString('ja-JP', { month: 'short' })}</p>
                    <p className="text-xl font-black text-white">{new Date(c.date).toLocaleDateString('ja-JP', { day: 'numeric' }).replace('日', '')}</p>
                  </div>
                  <div className="w-px h-10 bg-white/10 shrink-0" />
                  <div className="flex-1 min-w-0">
                    {c.tours?.name && <p className="text-xs text-[#b3b3b3] font-bold truncate">{c.tours.name}</p>}
                    <p className="text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{c.venue_name}</p>
                  </div>
                  <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors shrink-0">›</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* タブ */}
      <div className="flex gap-0 border-b border-white/10">
        <Link
          href={`/artists/${artist.id.slice(0, 8)}`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab !== 'analysis' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          ライブ情報
        </Link>
        <Link
          href={`/artists/${artist.id.slice(0, 8)}?tab=analysis`}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'analysis' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          セトリ分析
        </Link>
      </div>

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

      {/* フェス出演 */}
      {tab !== 'analysis' && (festivalConcerts ?? []).length > 0 && (() => {
        type FestConcert = {
          id: string; date: string; stage_name: string | null
          festival_events: { id: string; name: string; start_date: string; end_date: string | null; image_url: string | null; festival_groups: { id: string; name: string } | null } | null
        }
        const typed = (festivalConcerts ?? []) as unknown as FestConcert[]
        // festival_event ごとにグループ化
        const grouped = new Map<string, { event: FestConcert['festival_events'] & {}; concerts: FestConcert[] }>()
        for (const c of typed) {
          if (!c.festival_events) continue
          const key = c.festival_events.id
          if (!grouped.has(key)) grouped.set(key, { event: c.festival_events, concerts: [] })
          grouped.get(key)!.concerts.push(c)
        }
        return (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2"><Tent size={18} />フェス出演</h2>
            <div className="space-y-3">
              {[...grouped.values()].map(({ event, concerts: cs }) => (
                <div key={event.id} className="glass rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    {event.image_url ? (
                      <img src={event.image_url} alt={event.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#282828] flex items-center justify-center shrink-0">
                        <Tent size={20} className="text-[#8888aa]" />
                      </div>
                    )}
                    <div>
                      {event.festival_groups && <p className="text-xs text-[#8888aa]">{event.festival_groups.name}</p>}
                      <p className="font-bold text-white">{event.name}</p>
                      <p className="text-xs text-[#8888aa]">
                        {new Date(event.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                        {event.end_date && ` 〜 ${new Date(event.end_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cs.sort((a, b) => a.date.localeCompare(b.date)).map(c => (
                      <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-3 py-2 rounded-xl transition-colors group">
                        <span className="text-sm font-bold text-white">
                          {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                        </span>
                        {c.stage_name && <span className="text-xs text-[#8888aa] group-hover:text-white transition-colors">{c.stage_name}</span>}
                        <span className="text-[#8888aa] group-hover:text-white transition-colors text-xs">›</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )
      })()}

      {/* ツアー一覧 */}
      {tab !== 'analysis' && <section className="space-y-4">
        <h2 className="text-lg font-bold text-white">ツアー・ライブ情報</h2>
        {(tours ?? []).length === 0 ? (
          <p className="text-sm text-[#8888aa]">ツアー情報がありません</p>
        ) : (
          <div className="space-y-3">
            {(tours ?? [] as ArtistTour[]).map((t) => (
              <Link key={t.id} href={`/tours/${t.id.slice(0, 8)}`}
                className="glass rounded-2xl p-5 flex items-center gap-4 hover:border-white/20 transition-colors group">
                {(t.image_url || artist.image_url) ? (
                  <img src={t.image_url ?? artist.image_url ?? undefined} alt={t.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#333333]/60 to-[#282828]/60 shrink-0 flex items-center justify-center">
                    <Route size={22} className="text-white/60" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{t.name}</p>
                  {(t.start_date || t.end_date) && (
                    <p className="text-xs text-[#8888aa] mt-0.5">
                      {t.start_date && new Date(t.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {t.start_date && t.end_date && ' 〜 '}
                      {t.end_date && new Date(t.end_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                  {t.concerts && t.concerts.length > 0 && (() => {
                    const concertCount = t.concerts.length
                    const setlistCount = t.concerts.filter(c => c.setlist_submissions.length > 0).length
                    return (
                      <p className="text-xs text-[#8888aa] mt-0.5">
                        {concertCount}公演
                        {setlistCount > 0 && (
                          <span className="ml-2 text-[#b3b3b3]">セトリ {setlistCount}公演分</span>
                        )}
                      </p>
                    )
                  })()}
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>}
    </div>
  )
}
