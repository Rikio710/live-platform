import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar, MapPin, Music2 } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import type { Tables } from '@/types/supabase'

type ConcertRow = Pick<Tables<'concerts'>, 'id' | 'slug' | 'date' | 'start_time' | 'venue_name' | 'venue_address' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'slug'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const venueName = decodeURIComponent(slug)
  const supabase = await createClient()

  const { data: metaConcerts } = await supabase
    .from('concerts')
    .select('date, artists(name)')
    .eq('venue_name', venueName)
    .order('date', { ascending: false })
    .limit(50)

  const today = new Date().toISOString().split('T')[0]
  const pastCount = (metaConcerts ?? []).filter(c => c.date < today).length
  const upcomingCount = (metaConcerts ?? []).filter(c => c.date >= today).length
  const artistNames = [...new Set((metaConcerts ?? []).map((c: any) => c.artists?.name).filter(Boolean))].slice(0, 3) as string[]

  const countText = pastCount > 0 ? `過去${pastCount}公演` : ''
  const artistText = artistNames.length > 0 ? `${artistNames.join('・')}など` : ''
  const title = `${venueName}のライブ・コンサート一覧 ${countText}のセトリ・参戦記録`.trim()
  const description = `${venueName}${countText ? `で${countText}` : ''}のライブ・コンサートセットリスト（セトリ）・参戦記録を年別に掲載。${artistText ? `${artistText}が出演。` : ''}${upcomingCount > 0 ? `今後${upcomingCount}公演の開催も予定。` : ''}セトリ速報・掲示板はLiveVaultで。`

  return {
    title,
    description,
    alternates: {
      canonical: `${siteUrl}/venues/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/venues/${slug}`,
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const venueName = decodeURIComponent(slug)
  const supabase = await createClient()

  const { data: concerts } = await supabase
    .from('concerts')
    .select('id, slug, date, start_time, venue_name, venue_address, image_url, artists(id, name, slug), tours(id, name, image_url)')
    .eq('venue_name', venueName)
    .order('date', { ascending: false })

  if (!concerts || concerts.length === 0) notFound()

  const rows = concerts as unknown as ConcertRow[]
  const today = new Date().toISOString().split('T')[0]
  const upcoming = rows.filter(c => c.date >= today)
  const past = rows.filter(c => c.date < today)
  const venueAddress = rows[0]?.venue_address ?? null

  // セトリ有無を取得
  const concertIds = rows.map(c => c.id)
  const { data: setlistData } = await supabase
    .from('setlist_submissions')
    .select('concert_id')
    .in('concert_id', concertIds)
  const setlistConcertIds = new Set((setlistData ?? []).map(s => s.concert_id))

  // 過去公演を年別にグルーピング
  const pastByYear = new Map<number, ConcertRow[]>()
  for (const c of past) {
    const year = new Date(c.date).getFullYear()
    if (!pastByYear.has(year)) pastByYear.set(year, [])
    pastByYear.get(year)!.push(c)
  }
  const pastYears = [...pastByYear.keys()].sort((a, b) => b - a)

  // 出演アーティスト（重複なし・公演数順）
  const artistMap = new Map<string, { id: string; name: string; slug: string | null; count: number }>()
  for (const c of rows) {
    if (!c.artists) continue
    const a = c.artists
    if (artistMap.has(a.id)) {
      artistMap.get(a.id)!.count++
    } else {
      artistMap.set(a.id, { id: a.id, name: a.name, slug: a.slug, count: 1 })
    }
  }
  const artists = [...artistMap.values()].sort((a, b) => b.count - a.count)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: '会場一覧', item: `${siteUrl}/venues` },
      { '@type': 'ListItem', position: 3, name: venueName },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicVenue',
    name: venueName,
    address: venueAddress ?? undefined,
    url: `${siteUrl}/venues/${slug}`,
    event: rows.map(c => ({
      '@type': 'MusicEvent',
      name: `${c.artists?.name ?? ''} ${c.tours?.name ?? c.venue_name}`,
      startDate: c.start_time ? `${c.date}T${c.start_time}+09:00` : c.date,
      location: {
        '@type': 'MusicVenue',
        name: venueName,
        ...(venueAddress ? { address: venueAddress } : {}),
      },
      performer: c.artists ? { '@type': 'MusicGroup', name: c.artists.name } : undefined,
      url: `${siteUrl}/concerts/${c.id.slice(0, 8)}`,
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
        <Link href="/venues" className="hover:text-white transition-colors">会場一覧</Link>
        <span>/</span>
        <span className="text-white">{venueName}</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-[#b3b3b3] shrink-0" />
          <h1 className="text-2xl font-black text-white">{venueName}のライブ・コンサート一覧</h1>
        </div>
        {venueAddress && <p className="text-sm text-[#8888aa]">{venueAddress}</p>}
        {/* サマリーテキスト */}
        <p className="text-sm text-[#8888aa] leading-relaxed">
          {venueName}では過去{past.length}公演のライブ・コンサートが記録されています。
          {upcoming.length > 0 && `今後${upcoming.length}公演の開催が予定されています。`}
          {artists.length > 0 && `${artists.slice(0, 3).map(a => a.name).join('、')}などが出演しています。`}
          セットリスト（セトリ）・参戦記録・掲示板はLiveVaultで確認できます。
        </p>
      </div>

      {/* 出演アーティスト */}
      {artists.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#8888aa] flex items-center gap-2">
            <Music2 size={14} />
            出演アーティスト
          </h2>
          <div className="flex flex-wrap gap-2">
            {artists.map(a => (
              <Link
                key={a.id}
                href={`/artists/${a.id.slice(0, 8)}`}
                className="flex items-center gap-1.5 border border-white/10 hover:border-white/20 text-[#b3b3b3] hover:text-white text-xs px-3 py-1.5 rounded-full transition-colors"
              >
                {a.name}
                <span className="text-[#555566]">{a.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 今後の公演 */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">今後の公演</h2>
          <ConcertList concerts={upcoming} today={today} setlistConcertIds={setlistConcertIds} />
        </section>
      )}

      {/* 過去の開催ライブ一覧（年別） */}
      {pastYears.length > 0 && (
        <section className="space-y-6">
          <h2 className="text-lg font-bold text-white">{venueName}の過去のライブ・セトリ一覧</h2>
          {pastYears.map(year => (
            <div key={year} className="space-y-2">
              <h3 className="text-sm font-bold text-[#8888aa] flex items-center gap-2">
                <span>{year}年</span>
                <span className="text-[#555566]">({pastByYear.get(year)!.length}公演)</span>
              </h3>
              <ConcertList concerts={pastByYear.get(year)!} today={today} setlistConcertIds={setlistConcertIds} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function ConcertList({
  concerts,
  today,
  setlistConcertIds,
}: {
  concerts: ConcertRow[]
  today: string
  setlistConcertIds: Set<string>
}) {
  return (
    <div className="space-y-2">
      {concerts.map(c => {
        const isPast = c.date < today
        const hasSetlist = setlistConcertIds.has(c.id)
        return (
          <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
            className={`glass rounded-2xl p-4 flex items-center gap-4 hover:border-white/20 transition-colors group ${isPast ? 'opacity-70' : ''}`}>
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
              {c.artists && (
                <p className="text-xs text-[#b3b3b3] font-bold">{c.artists.name}</p>
              )}
              <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate text-sm">
                {c.tours?.name ?? c.venue_name}
              </p>
              {c.start_time && (
                <p className="text-xs text-[#8888aa] mt-0.5 flex items-center gap-1">
                  <Calendar size={10} />
                  開演 {c.start_time.slice(0, 5)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasSetlist && (
                <span className="text-xs text-violet-400 border border-violet-500/30 bg-violet-500/10 rounded-full px-2 py-0.5">
                  セトリあり
                </span>
              )}
              {isPast && !hasSetlist && (
                <span className="text-xs text-[#8888aa] border border-white/10 rounded-full px-2 py-0.5">終了</span>
              )}
            </div>
            <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors shrink-0">›</span>
          </Link>
        )
      })}
    </div>
  )
}
