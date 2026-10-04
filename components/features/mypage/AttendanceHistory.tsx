'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Ticket, Mic2, MapPin, Tent, ChevronDown, ChevronRight } from 'lucide-react'

type FestivalEvent = {
  id: string; name: string; image_url: string | null
  festival_groups: { id: string; name: string | null } | null
}

type Attendance = {
  id: string
  created_at: string | null
  concerts: {
    id: string
    slug: string | null
    venue_name: string
    date: string
    image_url: string | null
    stage_name: string | null
    festival_event_id: string | null
    artists: { id: string; name: string; image_url: string | null; image_crop_x?: number | null; image_crop_y?: number | null } | null
    tours: { id: string; name: string; image_url: string | null } | null
    festival_events: FestivalEvent | null
  }
}

type ArtistStat = { name: string; count: number; image_url: string | null }

// フェスグループ（同じfestival_event_idを持つconcertをまとめる）
type FestivalGroup = {
  festivalEvent: FestivalEvent
  attendances: Attendance[]
}

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
  const [expandedFestivals, setExpandedFestivals] = useState<Set<string>>(new Set())

  const artists = Object.entries(artistMap).sort((a, b) => b[1].count - a[1].count)
  const years = Object.keys(yearMap).sort((a, b) => Number(b) - Number(a))

  const filteredByArtist = filterArtist === 'all'
    ? attendances
    : attendances.filter(a => a.concerts.artists?.id === filterArtist)

  const filteredYearMap = filteredByArtist.reduce<Record<string, number>>((acc, a) => {
    const year = new Date(a.concerts.date).getFullYear().toString()
    acc[year] = (acc[year] ?? 0) + 1
    return acc
  }, {})

  const filtered = filteredByArtist
    .filter(a => {
      if (filterYear === 'all') return true
      return new Date(a.concerts.date).getFullYear().toString() === filterYear
    })
    .sort((a, b) => new Date(b.concerts.date).getTime() - new Date(a.concerts.date).getTime())

  // フェスとソロを分離してグループ化
  const festivalMap = new Map<string, FestivalGroup>()
  const soloAttendances: Attendance[] = []

  for (const a of filtered) {
    if (a.concerts.festival_event_id && a.concerts.festival_events) {
      const key = a.concerts.festival_event_id
      if (!festivalMap.has(key)) {
        festivalMap.set(key, { festivalEvent: a.concerts.festival_events, attendances: [] })
      }
      festivalMap.get(key)!.attendances.push(a)
    } else {
      soloAttendances.push(a)
    }
  }

  // フェスの最新日付でソート
  const festivalGroups = [...festivalMap.values()].sort((a, b) => {
    const aDate = Math.max(...a.attendances.map(x => new Date(x.concerts.date).getTime()))
    const bDate = Math.max(...b.attendances.map(x => new Date(x.concerts.date).getTime()))
    return bDate - aDate
  })

  // 表示アイテム（フェスカード + ソロ）を日付でマージ
  type DisplayItem =
    | { type: 'festival'; group: FestivalGroup; representativeDate: Date }
    | { type: 'solo'; attendance: Attendance }

  const displayItems: DisplayItem[] = [
    ...festivalGroups.map(g => ({
      type: 'festival' as const,
      group: g,
      representativeDate: new Date(Math.max(...g.attendances.map(a => new Date(a.concerts.date).getTime()))),
    })),
    ...soloAttendances.map(a => ({ type: 'solo' as const, attendance: a })),
  ].sort((a, b) => {
    const aDate = a.type === 'festival' ? a.representativeDate : new Date(a.attendance.concerts.date)
    const bDate = b.type === 'festival' ? b.representativeDate : new Date(b.attendance.concerts.date)
    return bDate.getTime() - aDate.getTime()
  })

  const toggleFestival = (id: string) => {
    setExpandedFestivals(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      {/* フィルター */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterArtist}
          onChange={e => setFilterArtist(e.target.value)}
          className="w-44 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="all">すべてのアーティスト</option>
          {artists.map(([id, a]) => (
            <option key={id} value={id}>{a.name}（{a.count}回）</option>
          ))}
        </select>
        <select
          value={filterYear}
          onChange={e => setFilterYear(e.target.value)}
          className="w-44 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-white/30"
        >
          <option value="all">すべての年</option>
          {years.filter(y => filteredYearMap[y]).map(y => (
            <option key={y} value={y}>{y}年（{filteredYearMap[y]}回）</option>
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
          <div className="flex justify-center"><Ticket size={36} className="text-[#b3b3b3]/50" /></div>
          <p className="text-white font-bold">参戦履歴がありません</p>
          <p className="text-sm text-[#8888aa]">公演ページから参戦登録しよう！</p>
          <Link href="/" className="inline-block mt-2 bg-white hover:bg-[#e0e0e0] text-black text-sm font-bold px-5 py-2.5 rounded-full transition-colors">
            公演を探す
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {displayItems.map((item, idx) => {
            if (item.type === 'festival') {
              const { group } = item
              const fe = group.festivalEvent
              const isExpanded = expandedFestivals.has(fe.id)
              const sorted = [...group.attendances].sort((a, b) => a.concerts.date.localeCompare(b.concerts.date))
              return (
                <div key={`fest-${fe.id}`} className="glass rounded-2xl overflow-hidden">
                  {/* フェスヘッダー */}
                  <button
                    onClick={() => toggleFestival(fe.id)}
                    className="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/5 transition-colors text-left"
                  >
                    {fe.image_url ? (
                      <img src={fe.image_url} alt={fe.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#282828] flex items-center justify-center shrink-0">
                        <Tent size={18} className="text-[#8888aa]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {fe.festival_groups && <p className="text-xs text-[#8888aa]">{fe.festival_groups.name}</p>}
                      <p className="text-sm font-bold text-white truncate">{fe.name}</p>
                      <p className="text-xs text-[#8888aa]">{group.attendances.length}アーティストを参戦</p>
                    </div>
                    <span className="text-[#8888aa] shrink-0">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                  </button>
                  {/* 展開: アーティスト一覧 */}
                  {isExpanded && (
                    <div className="border-t border-white/5 divide-y divide-white/5">
                      {sorted.map(a => (
                        <Link key={a.id} href={`/concerts/${a.concerts.id.slice(0, 8)}`}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group">
                          {a.concerts.artists?.image_url ? (
                            <img src={a.concerts.artists.image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" style={{ objectPosition: `${a.concerts.artists.image_crop_x ?? 50}% ${a.concerts.artists.image_crop_y ?? 50}%` }} />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#282828] flex items-center justify-center shrink-0">
                              <Mic2 size={14} className="text-[#8888aa]" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{a.concerts.artists?.name ?? '—'}</p>
                            <p className="text-xs text-[#8888aa]">
                              {new Date(a.concerts.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                              {a.concerts.stage_name && ` · ${a.concerts.stage_name}`}
                            </p>
                          </div>
                          <span className="text-[#8888aa] group-hover:text-white transition-colors text-sm">›</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            // ソロ公演
            const a = item.attendance
            const d = new Date(a.concerts.date)
            const month = d.toLocaleDateString('ja-JP', { month: 'numeric' })
            const day = d.toLocaleDateString('ja-JP', { day: 'numeric' })
            const year = d.getFullYear()
            const weekday = d.toLocaleDateString('ja-JP', { weekday: 'short' })
            return (
              <Link key={a.id} href={`/concerts/${a.concerts.id.slice(0, 8)}`}
                className="group relative flex rounded-xl overflow-hidden border border-white/8 bg-white/3 hover:border-white/20 transition-all">
                {/* サムネ */}
                <div className="w-20 h-20 m-2.5 rounded-lg shrink-0 overflow-hidden relative bg-[#1a1a2e] self-center">
                  {a.concerts.image_url ? (
                    <img src={a.concerts.image_url} alt="" className="w-full h-full object-cover" />
                  ) : a.concerts.tours?.image_url ? (
                    <img src={a.concerts.tours.image_url} alt="" className="w-full h-full object-cover" />
                  ) : a.concerts.artists?.image_url ? (
                    <img src={a.concerts.artists.image_url} alt="" className="w-full h-full object-cover opacity-40" style={{ objectPosition: `${a.concerts.artists.image_crop_x ?? 50}% ${a.concerts.artists.image_crop_y ?? 50}%` }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Mic2 size={18} className="text-[#8888aa]" />
                    </div>
                  )}
                </div>
                {/* メイン情報 */}
                <div className="flex-1 min-w-0 py-5 px-3">
                  <p className="text-sm font-bold text-white truncate">{a.concerts.artists?.name ?? '—'}</p>
                  {a.concerts.tours?.name && (
                    <p className="text-xs text-[#8888aa] truncate">{a.concerts.tours.name}</p>
                  )}
                  <p className="text-xs text-[#666] mt-0.5 flex items-center gap-1">
                    <MapPin size={9} className="shrink-0" />
                    {a.concerts.venue_name}
                  </p>
                </div>
                {/* ミシン目 + 日付スタブ */}
                <div className="flex items-stretch shrink-0">
                  <div className="border-l border-dashed border-white/15 my-2" />
                  <div className="py-5 flex flex-col items-center justify-center w-16 shrink-0">
                    <p className="text-[10px] text-[#8888aa]">{month}月</p>
                    <p className="text-xl font-black text-white leading-none">{day}</p>
                    <p className="text-[10px] text-[#555] mt-0.5">{year} {weekday}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
