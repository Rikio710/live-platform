'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ticket, Mic2, MapPin } from 'lucide-react'

type Attendance = {
  id: string
  created_at: string | null
  concerts: {
    id: string
    slug: string | null
    venue_name: string
    date: string
    image_url: string | null
    artists: { id: string; name: string; image_url: string | null } | null
    tours: { id: string; name: string } | null
  }
}

type ArtistStat = { name: string; count: number; image_url: string | null }

export default function AttendanceHistory({
  attendances,
  artistMap,
  yearMap,
}: {
  attendances: Attendance[]
  artistMap: Record<string, ArtistStat>
  yearMap: Record<string, number>
}) {
  const [filterArtist, setFilterArtist] = useState<string>('all')
  const [filterYear, setFilterYear] = useState<string>('all')

  const artists = Object.entries(artistMap).sort((a, b) => b[1].count - a[1].count)
  const years = Object.keys(yearMap).sort((a, b) => Number(b) - Number(a))

  const filtered = attendances.filter(a => {
    const artistId = a.concerts.artists?.id
    const year = new Date(a.concerts.date).getFullYear().toString()
    if (filterArtist !== 'all' && artistId !== filterArtist) return false
    if (filterYear !== 'all' && year !== filterYear) return false
    return true
  })

  return (
    <div className="space-y-5">
      {/* フィルター */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterArtist}
          onChange={e => setFilterArtist(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="all">すべてのアーティスト</option>
          {artists.map(([id, a]) => (
            <option key={id} value={id}>{a.name}（{a.count}回）</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
        >
          <option value="all">すべての年</option>
          {years.map(y => (
            <option key={y} value={y}>{y}年（{yearMap[y]}回）</option>
          ))}
        </select>
        {(filterArtist !== 'all' || filterYear !== 'all') && (
          <button
            onClick={() => { setFilterArtist('all'); setFilterYear('all') }}
            className="text-xs text-[#8888aa] hover:text-white border border-white/10 rounded-full px-3 py-2 transition-colors"
          >
            クリア
          </button>
        )}
        <span className="text-xs text-[#8888aa] self-center ml-1">{filtered.length}件</span>
      </div>

      {/* カード一覧 */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center space-y-3">
          <div className="flex justify-center"><Ticket size={36} className="text-violet-400/50" /></div>
          <p className="text-white font-bold">参戦履歴がありません</p>
          <p className="text-sm text-[#8888aa]">公演ページから参戦登録しよう！</p>
          <Link href="/" className="inline-block mt-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-5 py-2.5 rounded-full transition-colors">
            公演を探す
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(a => (
            <Link key={a.id} href={`/concerts/${a.concerts.slug ?? a.concerts.id}`}
              className="glass rounded-2xl overflow-hidden hover:border-violet-500/40 transition-all group">
              {/* サムネイル */}
              <div className="h-28 relative bg-gradient-to-br from-violet-900/50 to-pink-900/40">
                {a.concerts.image_url ? (
                  <img src={a.concerts.image_url} alt="" className="w-full h-full object-cover opacity-50 group-hover:opacity-60 transition-opacity" />
                ) : a.concerts.artists?.image_url ? (
                  <img src={a.concerts.artists.image_url} alt="" className="w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-20">
                    <Mic2 size={36} className="text-white" />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <span className="text-xs bg-violet-600/80 text-white rounded-full px-2 py-0.5 font-bold">
                    {new Date(a.concerts.date).getFullYear()}
                  </span>
                </div>
              </div>

              {/* 情報 */}
              <div className="p-3 space-y-0.5">
                <p className="text-xs text-violet-300 font-bold truncate">
                  {a.concerts.artists?.name ?? '—'}
                </p>
                <p className="text-xs text-[#8888aa] truncate">
                  {a.concerts.tours?.name ?? a.concerts.venue_name}
                </p>
                <p className="text-xs text-[#8888aa] flex items-center gap-1">
                  <MapPin size={10} className="shrink-0" />{a.concerts.venue_name}
                </p>
                <p className="text-xs text-[#8888aa]">
                  {new Date(a.concerts.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
