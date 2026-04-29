import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar, MapPin } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import type { Tables } from '@/types/supabase'

type ConcertRow = Pick<Tables<'concerts'>, 'id' | 'slug' | 'date' | 'start_time' | 'venue_name' | 'venue_address' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const venueName = decodeURIComponent(slug)
  const title = `${venueName} セトリ・ライブ公演一覧 | 参戦記録`
  const description = `${venueName}で開催されたライブ・コンサートのセットリスト（セトリ）・参戦記録一覧。公演ごとのセトリ速報・ライブレポを確認できます。`
  return {
    title,
    description,
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
    .select('id, slug, date, start_time, venue_name, venue_address, image_url, artists(id, name), tours(id, name, image_url)')
    .eq('venue_name', venueName)
    .order('date', { ascending: false })

  if (!concerts || concerts.length === 0) notFound()

  const rows = concerts as unknown as ConcertRow[]
  const today = new Date().toISOString().split('T')[0]
  const upcoming = rows.filter(c => c.date >= today)
  const past = rows.filter(c => c.date < today)
  const venueAddress = rows[0]?.venue_address ?? null

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
      performer: c.artists ? { '@type': 'MusicGroup', name: c.artists.name } : undefined,
      url: `${siteUrl}/concerts/${(c as any).slug ?? c.id}`,
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
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-violet-400 shrink-0" />
          <h1 className="text-2xl font-black text-white">{venueName}</h1>
        </div>
        {venueAddress && <p className="text-sm text-[#8888aa]">{venueAddress}</p>}
        <p className="text-xs text-[#8888aa]">
          {venueName}のセットリスト（セトリ）・ライブ・コンサート公演一覧
        </p>
      </div>

      {/* 近日公演 */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">近日公演</h2>
          <ConcertList concerts={upcoming} today={today} />
        </section>
      )}

      {/* 過去公演 */}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">過去の公演</h2>
          <ConcertList concerts={past} today={today} />
        </section>
      )}
    </div>
  )
}

function ConcertList({ concerts, today }: { concerts: ConcertRow[]; today: string }) {
  return (
    <div className="space-y-2">
      {concerts.map(c => {
        const isPast = c.date < today
        return (
          <Link key={c.id} href={`/concerts/${c.slug ?? c.id}`}
            className={`glass rounded-2xl p-4 flex items-center gap-4 hover:border-violet-500/40 transition-colors group ${isPast ? 'opacity-60' : ''}`}>
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
                <p className="text-xs text-violet-300 font-bold">{c.artists.name}</p>
              )}
              <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate text-sm">
                {c.tours?.name ?? c.venue_name}
              </p>
              {c.start_time && (
                <p className="text-xs text-[#8888aa] mt-0.5 flex items-center gap-1">
                  <Calendar size={10} />
                  開演 {c.start_time.slice(0, 5)}
                </p>
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
  )
}
