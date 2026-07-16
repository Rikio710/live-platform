import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Calendar, Mic2, Route } from 'lucide-react'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'ランキング | LiveVault',
  description: '直近のセトリ充実度によるライブ公演・ツアー・アーティストのランキング。',
}

function RankNum({ n }: { n: number }) {
  return (
    <span className={`text-lg font-black w-6 shrink-0 text-center ${n === 1 ? 'text-yellow-400' : n === 2 ? 'text-[#b3b3b3]' : n === 3 ? 'text-amber-700' : 'text-[#555566]'}`}>
      {n}
    </span>
  )
}

function Thumb({ src, fallback }: { src: string | null | undefined; fallback: React.ReactNode }) {
  return (
    <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-[#282828] flex items-center justify-center">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : fallback}
    </div>
  )
}

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type = 'concert' } = await searchParams
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0]

  const { data: raw } = await supabase
    .from('concerts')
    .select('id, venue_name, date, image_url, tour_id, artist_id, artists(id, name, image_url), tours(id, name, image_url, start_date, end_date), setlist_submissions!inner(id)')
    .gte('date', twoMonthsAgoStr)
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(200)

  const concerts = (raw ?? [] as any[])
    .map((c: any) => ({ ...c, setlist_count: c.setlist_submissions.length }))
    .sort((a: any, b: any) => b.setlist_count - a.setlist_count)
    .slice(0, 10)

  const tourMap = new Map<string, any>()
  for (const c of (raw ?? []) as any[]) {
    if (!c.tour_id || !c.tours) continue
    const ex = tourMap.get(c.tour_id)
    if (ex) { ex.setlist_count += c.setlist_submissions.length } else {
      tourMap.set(c.tour_id, { id: c.tour_id, ...c.tours, setlist_count: c.setlist_submissions.length, artists: c.artists })
    }
  }
  const tours = [...tourMap.values()].sort((a, b) => b.setlist_count - a.setlist_count).slice(0, 10)

  const artistMap = new Map<string, any>()
  for (const c of (raw ?? []) as any[]) {
    if (!c.artist_id || !c.artists) continue
    const ex = artistMap.get(c.artist_id)
    if (ex) { ex.setlist_count += c.setlist_submissions.length } else {
      artistMap.set(c.artist_id, { id: c.artist_id, ...c.artists, setlist_count: c.setlist_submissions.length })
    }
  }
  const artists = [...artistMap.values()].sort((a, b) => b.setlist_count - a.setlist_count).slice(0, 10)

  const TABS = [
    { key: 'concert', label: '公演' },
    { key: 'tour', label: 'ツアー' },
    { key: 'artist', label: 'アーティスト' },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-[#b3b3b3]">Ranking</p>
        <h1 className="text-2xl font-black text-white">注目のランキング</h1>
        <p className="text-xs text-[#8888aa]">直近2ヶ月のセトリ充実度によるランキング</p>
      </div>

      <div className="flex bg-white/5 rounded-xl p-1">
        {TABS.map(tab => (
          <Link key={tab.key} href={`/ranking?type=${tab.key}`}
            className={`flex-1 py-2 text-sm font-bold rounded-lg text-center transition-colors ${type === tab.key ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`}>
            {tab.label}
          </Link>
        ))}
      </div>

      {type === 'concert' && (
        <div className="space-y-2">
          {concerts.map((c: any, i: number) => (
            <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
              className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
              <RankNum n={i + 1} />
              <Thumb src={c.image_url ?? c.tours?.image_url ?? c.artists?.image_url} fallback={<Calendar size={18} className="text-[#535353]" />} />
              <div className="flex-1 min-w-0">
                {c.artists?.name && <p className="text-xs text-[#b3b3b3] truncate">{c.artists.name}</p>}
                <p className="text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{c.tours?.name ?? c.venue_name}</p>
                <p className="text-xs text-[#8888aa] truncate">{c.venue_name} · {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</p>
              </div>
              <span className="text-xs text-violet-400 shrink-0">セトリ{c.setlist_count}件</span>
            </Link>
          ))}
        </div>
      )}

      {type === 'tour' && (
        <div className="space-y-2">
          {tours.map((t: any, i: number) => (
            <Link key={t.id} href={`/tours/${t.id.slice(0, 8)}`}
              className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
              <RankNum n={i + 1} />
              <Thumb src={t.image_url ?? t.artists?.image_url} fallback={<Route size={18} className="text-[#535353]" />} />
              <div className="flex-1 min-w-0">
                {t.artists?.name && <p className="text-xs text-[#b3b3b3] truncate">{t.artists.name}</p>}
                <p className="text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{t.name}</p>
                {(t.start_date || t.end_date) && (
                  <p className="text-xs text-[#8888aa]">
                    {t.start_date && new Date(t.start_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                    {t.start_date && t.end_date && ' 〜 '}
                    {t.end_date && new Date(t.end_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                  </p>
                )}
              </div>
              <span className="text-xs text-violet-400 shrink-0">セトリ{t.setlist_count}件</span>
            </Link>
          ))}
        </div>
      )}

      {type === 'artist' && (
        <div className="space-y-2">
          {artists.map((a: any, i: number) => (
            <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
              className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
              <RankNum n={i + 1} />
              <Thumb src={a.image_url} fallback={<Mic2 size={18} className="text-[#535353]" />} />
              <p className="flex-1 text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{a.name}</p>
              <span className="text-xs text-violet-400 shrink-0">セトリ{a.setlist_count}件</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
