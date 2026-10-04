'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Calendar, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CONCERT_LIST_SELECT, toConcertItem, type ConcertListRow } from './concertItem'

export type ConcertItem = {
  id: string
  artistId: string | null
  date: string
  startTime: string | null
  venueName: string
  artistName: string | null
  tourName: string | null
  image: string | null
  imagePosition: string | null
  hasSetlist: boolean
}

/**
 * 公演一覧のタブ（近日/過去）とアーティスト絞り込み。ブラウザ側で切り替える（URL の ?tab= &artist= も維持）。
 * サーバーで searchParams を読むとページがキャッシュされなくなるため、この形にしている。
 */
export default function ConcertList({ upcoming, past }: { upcoming: ConcertItem[]; past: ConcertItem[] }) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [artist, setArtist] = useState('')

  useEffect(() => {
    const sync = () => {
      const p = new URLSearchParams(window.location.search)
      setTab(p.get('tab') === 'past' ? 'past' : 'upcoming')
      setArtist(p.get('artist') ?? '')
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const update = (next: { tab?: 'upcoming' | 'past'; artist?: string }) => {
    const t = next.tab ?? tab
    const a = next.artist ?? artist
    setTab(t)
    setArtist(a)
    const p = new URLSearchParams()
    if (t === 'past') p.set('tab', 'past')
    if (a) p.set('artist', a)
    window.history.pushState(null, '', p.size ? `/concerts?${p}` : '/concerts')
  }

  // 過去の公演はページに直近100件しか載せていないので、アーティストを選んだらそのアーティストの過去公演を取得する
  const [artistPast, setArtistPast] = useState<{ artist: string; items: ConcertItem[] } | null>(null)
  const [loadingPast, setLoadingPast] = useState(false)
  useEffect(() => {
    if (tab !== 'past' || !artist || artistPast?.artist === artist) return
    const artistId = [...upcoming, ...past].find(c => c.artistName === artist)?.artistId
    if (!artistId) return
    let cancelled = false
    setLoadingPast(true)
    const today = new Date().toISOString().split('T')[0]
    createClient().from('concerts').select(CONCERT_LIST_SELECT).eq('artist_id', artistId).lt('date', today)
      .order('date', { ascending: false }).limit(300)
      .then(({ data }) => {
        if (cancelled) return
        setArtistPast({ artist, items: ((data ?? []) as unknown as ConcertListRow[]).map(toConcertItem) })
        setLoadingPast(false)
      })
    return () => { cancelled = true }
  }, [tab, artist, upcoming, past, artistPast?.artist])

  // 一覧に公演があるアーティストだけを選択肢にする
  const artistOptions = useMemo(
    () => [...new Set([...upcoming, ...past].map(c => c.artistName).filter((n): n is string => !!n))]
      .sort((a, b) => a.localeCompare(b, 'ja')),
    [upcoming, past],
  )
  const source = tab === 'past' && artist && artistPast?.artist === artist ? artistPast.items : tab === 'past' ? past : upcoming
  const list = source.filter(c => !artist || c.artistName === artist)

  const tabClass = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${active ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`

  return (
    <>
      {/* タブ + アーティストフィルター */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex rounded-full border border-white/10 p-1 self-start">
          <button onClick={() => update({ tab: 'upcoming' })} className={tabClass(tab !== 'past')}>
            近日公演 {artist ? '' : `(${upcoming.length})`}
          </button>
          <button onClick={() => update({ tab: 'past' })} className={tabClass(tab === 'past')}>
            過去の公演 {artist ? '' : `(${past.length})`}
          </button>
        </div>

        <div className="flex gap-2 items-center min-w-0 w-full sm:w-auto">
          <select
            value={artist}
            onChange={e => update({ artist: e.target.value })}
            className="min-w-0 flex-1 sm:flex-none sm:w-64 truncate bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="">全アーティスト</option>
            {artistOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          {artist && (
            <button
              onClick={() => update({ artist: '' })}
              className="shrink-0 whitespace-nowrap text-xs text-[#8888aa] hover:text-white border border-white/10 rounded-full px-3 py-1.5 transition-colors"
            >
              ✕ 解除
            </button>
          )}
        </div>
      </div>

      {/* 公演リスト */}
      {loadingPast && tab === 'past' && artist && artistPast?.artist !== artist ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">読み込み中...</div>
      ) : list.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">公演がありません</div>
      ) : (
        <div className="space-y-2">
          {list.map(c => {
            const d = new Date(c.date)
            return (
              <Link
                key={c.id}
                href={`/concerts/${c.id.slice(0, 8)}`}
                className="glass rounded-2xl p-4 flex items-center gap-4 hover:border-white/20 transition-colors group"
              >
                {/* サムネイル */}
                <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-[#333333]/60 to-[#282828]/60">
                  {c.image ? (
                    <img
                      src={c.image}
                      alt=""
                      className="w-full h-full object-cover"
                      style={c.imagePosition ? { objectPosition: c.imagePosition } : undefined}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Calendar size={20} className="text-white/40" />
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-center w-10">
                  <p className="text-xs text-[#8888aa]">{d.toLocaleDateString('ja-JP', { month: 'short' })}</p>
                  <p className="text-lg font-black text-white">{d.toLocaleDateString('ja-JP', { day: 'numeric' }).replace('日', '')}</p>
                  <p className="text-xs text-[#8888aa]">{d.toLocaleDateString('ja-JP', { weekday: 'short' })}</p>
                </div>
                <div className="w-px h-10 bg-white/10 shrink-0" />
                <div className="flex-1 min-w-0">
                  {c.artistName && <p className="text-xs text-[#b3b3b3] font-bold">{c.artistName}</p>}
                  <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate text-sm">
                    {c.tourName ?? c.venueName}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <p className="text-xs text-[#8888aa] flex items-center gap-1">
                      <MapPin size={10} />
                      {c.venueName}
                    </p>
                    {c.startTime && (
                      <p className="text-xs text-[#8888aa] flex items-center gap-1">
                        <Calendar size={10} />
                        {c.startTime.slice(0, 5)}
                      </p>
                    )}
                    {c.hasSetlist && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-[#b3b3b3] border border-white/20">
                        セットリスト
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors shrink-0">›</span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
