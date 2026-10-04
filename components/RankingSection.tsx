'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Mic2, Route } from 'lucide-react'

type ArtistImageInfo = { id: string; name: string; image_url: string | null; image_crop_x?: number | null; image_crop_y?: number | null }

export type RankingConcert = {
  id: string
  venue_name: string
  date: string
  image_url: string | null
  artists: ArtistImageInfo | null
  tours: { id: string; name: string; image_url: string | null } | null
}

export type RankingTour = {
  id: string
  name: string
  image_url: string | null
  start_date: string | null
  end_date: string | null
  artists: ArtistImageInfo | null
}

export type RankingArtist = {
  id: string
  name: string
  image_url: string | null
  image_crop_x?: number | null
  image_crop_y?: number | null
}

type Props = {
  concerts: RankingConcert[]
  tours: RankingTour[]
  artists: RankingArtist[]
}

const SEGMENTS = ['公演', 'ツアー', 'アーティスト'] as const
type Segment = typeof SEGMENTS[number]

function RankNum({ n }: { n: number }) {
  return (
    <span className={`text-lg font-black w-6 shrink-0 text-center ${n === 1 ? 'text-yellow-400' : n === 2 ? 'text-[#b3b3b3]' : n === 3 ? 'text-amber-700' : 'text-[#555566]'}`}>
      {n}
    </span>
  )
}

function Thumb({ src, fallback, objectPosition }: { src: string | null | undefined; fallback: React.ReactNode; objectPosition?: string }) {
  return (
    <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-[#282828] flex items-center justify-center">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" style={objectPosition ? { objectPosition } : undefined} /> : fallback}
    </div>
  )
}

function AllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs text-[#8888aa] hover:text-white transition-colors flex justify-end items-center gap-1 pt-1">
      全てのランキングを見る ›
    </Link>
  )
}

function ConcertList({ concerts }: { concerts: RankingConcert[] }) {
  if (concerts.length === 0) return <p className="text-sm text-[#8888aa]">データがありません</p>
  return (
    <div className="space-y-2">
      {concerts.map((c, i) => (
        <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
          className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
          <RankNum n={i + 1} />
          <Thumb
            src={c.image_url ?? c.tours?.image_url ?? c.artists?.image_url}
            fallback={<Calendar size={18} className="text-[#535353]" />}
            objectPosition={!c.image_url && !c.tours?.image_url && c.artists ? `${c.artists.image_crop_x ?? 50}% ${c.artists.image_crop_y ?? 50}%` : undefined}
          />
          <div className="flex-1 min-w-0">
            {c.artists?.name && <p className="text-xs text-[#b3b3b3] truncate">{c.artists.name}</p>}
            <p className="text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">
              {c.tours?.name ?? c.venue_name}
            </p>
            <p className="text-xs text-[#8888aa] truncate">
              {c.venue_name} · {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
            </p>
          </div>
        </Link>
      ))}
      <AllLink href="/ranking?type=concert" />
    </div>
  )
}

function TourList({ tours }: { tours: RankingTour[] }) {
  if (tours.length === 0) return <p className="text-sm text-[#8888aa]">データがありません</p>
  return (
    <div className="space-y-2">
      {tours.map((t, i) => (
        <Link key={t.id} href={`/tours/${t.id.slice(0, 8)}`}
          className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
          <RankNum n={i + 1} />
          <Thumb
            src={t.image_url ?? t.artists?.image_url}
            fallback={<Route size={18} className="text-[#535353]" />}
            objectPosition={!t.image_url && t.artists ? `${t.artists.image_crop_x ?? 50}% ${t.artists.image_crop_y ?? 50}%` : undefined}
          />
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
        </Link>
      ))}
      <AllLink href="/ranking?type=tour" />
    </div>
  )
}

function ArtistList({ artists }: { artists: RankingArtist[] }) {
  if (artists.length === 0) return <p className="text-sm text-[#8888aa]">データがありません</p>
  return (
    <div className="space-y-2">
      {artists.map((a, i) => (
        <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
          className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
          <RankNum n={i + 1} />
          <Thumb
            src={a.image_url}
            fallback={<Mic2 size={18} className="text-[#535353]" />}
            objectPosition={`${a.image_crop_x ?? 50}% ${a.image_crop_y ?? 50}%`}
          />
          <p className="flex-1 text-sm font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{a.name}</p>
        </Link>
      ))}
      <AllLink href="/ranking?type=artist" />
    </div>
  )
}

export default function RankingSection({ concerts, tours, artists }: Props) {
  const [active, setActive] = useState<Segment>('公演')

  return (
    <section className="max-w-5xl mx-auto px-4 py-8 space-y-5">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-[#b3b3b3]">Ranking</p>
        <h2 className="text-2xl font-black text-white">注目のランキング</h2>
      </div>

      {/* スマホ: セグメントコントロール */}
      <div className="sm:hidden space-y-4">
        <div className="flex bg-white/5 rounded-xl p-1">
          {SEGMENTS.map(seg => (
            <button key={seg} onClick={() => setActive(seg)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${active === seg ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`}>
              {seg}
            </button>
          ))}
        </div>
        {active === '公演' && <ConcertList concerts={concerts} />}
        {active === 'ツアー' && <TourList tours={tours} />}
        {active === 'アーティスト' && <ArtistList artists={artists} />}
      </div>

      {/* PC: 縦並び */}
      <div className="hidden sm:block space-y-8">
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#8888aa] uppercase tracking-wider">公演</h3>
          <ConcertList concerts={concerts} />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#8888aa] uppercase tracking-wider">ツアー</h3>
          <TourList tours={tours} />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[#8888aa] uppercase tracking-wider">アーティスト</h3>
          <ArtistList artists={artists} />
        </div>
      </div>
    </section>
  )
}
