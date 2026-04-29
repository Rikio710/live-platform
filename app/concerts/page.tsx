import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar, MapPin } from 'lucide-react'
import { siteUrl } from '@/lib/site'
import type { Tables } from '@/types/supabase'
import ArtistFilter from './ArtistFilter'

type ConcertRow = Pick<Tables<'concerts'>, 'id' | 'slug' | 'date' | 'start_time' | 'venue_name' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'ライブ・コンサート公演一覧 | LiveVault',
  description: '近日開催・過去のライブ・コンサート公演一覧。アーティストごとのセットリスト（セトリ）・参戦記録を確認できます。',
  openGraph: {
    title: 'ライブ・コンサート公演一覧 | LiveVault',
    description: '近日開催・過去のライブ・コンサート公演一覧。アーティストごとのセットリスト（セトリ）・参戦記録を確認できます。',
    url: `${siteUrl}/concerts`,
  },
}

export default async function ConcertsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; artist?: string }>
}) {
  const { tab = 'upcoming', artist = '' } = await searchParams
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: upcoming }, { data: past }, { data: artists }] = await Promise.all([
    supabase
      .from('concerts')
      .select('id, slug, date, start_time, venue_name, image_url, artists(id, name), tours(id, name, image_url)')
      .gte('date', today)
      .order('date', { ascending: true }),
    supabase
      .from('concerts')
      .select('id, slug, date, start_time, venue_name, image_url, artists(id, name), tours(id, name, image_url)')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(100),
    supabase
      .from('artists')
      .select('id, name')
      .order('name'),
  ])

  const upcomingRows = (upcoming ?? []) as unknown as ConcertRow[]
  const pastRows = (past ?? []) as unknown as ConcertRow[]

  const filterConcerts = (rows: ConcertRow[]) =>
    artist ? rows.filter(c => c.artists?.name === artist) : rows

  const filteredUpcoming = filterConcerts(upcomingRows)
  const filteredPast = filterConcerts(pastRows)
  const currentList = tab === 'past' ? filteredPast : filteredUpcoming

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-white">公演一覧</h1>
        <p className="text-sm text-[#8888aa]">ライブ・コンサートのセットリスト（セトリ）・参戦記録一覧</p>
      </div>

      {/* タブ + アーティストフィルター */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex rounded-full border border-white/10 p-1 self-start">
          <Link
            href={`/concerts?tab=upcoming${artist ? `&artist=${encodeURIComponent(artist)}` : ''}`}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${tab !== 'past' ? 'bg-violet-600 text-white' : 'text-[#8888aa] hover:text-white'}`}
          >
            近日公演 {artist ? '' : `(${upcomingRows.length})`}
          </Link>
          <Link
            href={`/concerts?tab=past${artist ? `&artist=${encodeURIComponent(artist)}` : ''}`}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${tab === 'past' ? 'bg-violet-600 text-white' : 'text-[#8888aa] hover:text-white'}`}
          >
            過去の公演 {artist ? '' : `(${pastRows.length})`}
          </Link>
        </div>

        <ArtistFilter artists={artists ?? []} tab={tab} artist={artist} />
      </div>

      {/* 公演リスト */}
      {currentList.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
          公演がありません
        </div>
      ) : (
        <div className="space-y-2">
          {currentList.map(c => (
            <Link
              key={c.id}
              href={`/concerts/${c.slug ?? c.id}`}
              className="glass rounded-2xl p-4 flex items-center gap-4 hover:border-violet-500/40 transition-colors group"
            >
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
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs text-[#8888aa] flex items-center gap-1">
                    <MapPin size={10} />
                    {c.venue_name}
                  </p>
                  {c.start_time && (
                    <p className="text-xs text-[#8888aa] flex items-center gap-1">
                      <Calendar size={10} />
                      {c.start_time.slice(0, 5)}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-[#8888aa] group-hover:text-violet-300 transition-colors shrink-0">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
