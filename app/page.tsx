import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { PlusCircle } from 'lucide-react'
import ArtistsSection from '@/components/ArtistsSection'
import UpcomingConcerts from '@/components/UpcomingConcerts'
import RecentConcerts from '@/components/RecentConcerts'
import SearchBox from '@/components/SearchBox'
import RankingSection from '@/components/RankingSection'
import type { RankingConcert, RankingTour, RankingArtist } from '@/components/RankingSection'
import type { Tables } from '@/types/supabase'

type ConcertCard = Pick<Tables<'concerts'>, 'id' | 'slug' | 'venue_name' | 'date' | 'start_time' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

type UpcomingConcert = ConcertCard

type RecentSetlistConcert = {
  id: string
  slug: string | null
  venue_name: string
  date: string
  artists: { id: string; name: string } | null
  tours: { name: string } | null
}

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'LiveVault | ライブ・コンサートのセトリ記録・参戦管理',
  description: 'ライブ・コンサートのセットリスト記録、参戦履歴管理、リアルタイム掲示板。アーティストのライブ体験をみんなで共有するプラットフォーム。',
}

export default async function TopPage() {
  const supabase = await createClient()

  const today = new Date().toISOString().split('T')[0]

  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0]

  const [{ data: upcomingConcerts }, { data: recentConcerts }, { data: popularArtists }, { data: recentSetlistSubmissions }, { data: rankingRaw }] = await Promise.all([
    supabase
      .from('concerts')
      .select('id, slug, venue_name, date, start_time, image_url, artists(id, name, image_url), tours(id, name, image_url)')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(8),
    supabase
      .from('concerts')
      .select('id, slug, venue_name, date, start_time, image_url, artists(id, name, image_url), tours(id, name, image_url)')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(8),
    supabase
      .from('artists')
      .select('id, slug, name, image_url')
      .limit(50),
    supabase
      .from('concerts')
      .select('id, slug, venue_name, date, tour_id, artist_id, artists(id, name), tours(id, name), setlist_submissions!inner(id)')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(60),
    supabase
      .from('concerts')
      .select('id, venue_name, date, image_url, tour_id, artist_id, artists(id, name, image_url), tours(id, name, image_url, start_date, end_date), setlist_submissions!inner(id)')
      .gte('date', twoMonthsAgoStr)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(100),
  ])

  // ランキング集計
  const rankingConcerts: RankingConcert[] = (rankingRaw ?? [] as any[])
    .map((c: any) => ({ ...c, setlist_count: (c.setlist_submissions as any[]).length }))
    .sort((a: any, b: any) => b.setlist_count - a.setlist_count)
    .slice(0, 3)

  const tourMap = new Map<string, any>()
  for (const c of (rankingRaw ?? []) as any[]) {
    if (!c.tour_id || !c.tours) continue
    const ex = tourMap.get(c.tour_id)
    const cnt = (c.setlist_submissions as any[]).length
    if (ex) { ex.setlist_count += cnt } else {
      tourMap.set(c.tour_id, { id: c.tour_id, ...c.tours, setlist_count: cnt, artists: c.artists })
    }
  }
  const rankingTours: RankingTour[] = [...tourMap.values()].sort((a, b) => b.setlist_count - a.setlist_count).slice(0, 3)

  const artistMap2 = new Map<string, any>()
  for (const c of (rankingRaw ?? []) as any[]) {
    if (!c.artist_id || !c.artists) continue
    const ex = artistMap2.get(c.artist_id)
    const cnt = (c.setlist_submissions as any[]).length
    if (ex) { ex.setlist_count += cnt } else {
      artistMap2.set(c.artist_id, { id: c.artist_id, ...c.artists, setlist_count: cnt })
    }
  }
  const rankingArtists: RankingArtist[] = [...artistMap2.values()].sort((a, b) => b.setlist_count - a.setlist_count).slice(0, 3)

  // ツアーIDまたはアーティストIDで重複排除して6件取得
  const seenKeys = new Set<string>()
  const recentSetlistConcerts: RecentSetlistConcert[] = []
  for (const c of (recentSetlistSubmissions ?? []) as any[]) {
    const key = c.tour_id ?? c.artist_id ?? c.id
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    recentSetlistConcerts.push(c as RecentSetlistConcert)
    if (recentSetlistConcerts.length >= 6) break
  }

  return (
    <div>
      {/* 検索 */}
      <section className="px-4 py-4 sm:py-6">
        <div className="max-w-2xl mx-auto">
          <SearchBox />
        </div>
      </section>

      {/* 近日公演 */}
      <section id="upcoming" className="max-w-5xl mx-auto px-4 pt-2 pb-8 space-y-5">
        <div className="flex items-end justify-between">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-[#b3b3b3]">Upcoming</p>
            <h2 className="text-2xl font-black text-white">近日開催の公演</h2>
          </div>
        </div>
        <UpcomingConcerts initialConcerts={(upcomingConcerts ?? []) as UpcomingConcert[]} />
      </section>

      {/* ランキング */}
      <RankingSection concerts={rankingConcerts} tours={rankingTours} artists={rankingArtists} />

      {/* 注目のセトリ */}
      {recentSetlistConcerts.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 py-8 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-[#b3b3b3]">Setlist</p>
            <h2 className="text-2xl font-black text-white">注目のセトリ</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentSetlistConcerts.map(c => (
              <Link
                key={c.id}
                href={`/concerts/${(c.id as string).slice(0, 8)}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  {c.artists?.name && (
                    <p className="text-xs text-[#b3b3b3] truncate">{c.artists.name}</p>
                  )}
                  <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">
                    {c.tours?.name ?? c.venue_name}
                  </p>
                  <p className="text-xs text-[#8888aa]">
                    {c.date} {c.tours?.name ? `— ${c.venue_name}` : ''}
                  </p>
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 最近終わった公演 */}
      <section className="max-w-5xl mx-auto px-4 py-8 space-y-5">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-[#b3b3b3]">Recent</p>
          <h2 className="text-2xl font-black text-white">最近終了した公演</h2>
        </div>
        <RecentConcerts initialConcerts={(recentConcerts ?? []) as ConcertCard[]} />
      </section>

      {/* アーティスト */}
      {(popularArtists ?? []).length > 0 && (
        <ArtistsSection artists={popularArtists ?? []} />
      )}
    </div>
  )
}
