'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mic2, Search } from 'lucide-react'
import FollowButton from '@/components/features/artist/FollowButton'
import type { Tables } from '@/types/supabase'

type Artist = Pick<Tables<'artists'>, 'id' | 'slug' | 'name' | 'image_url' | 'image_crop_x' | 'image_crop_y' | 'description'> & {
  tour_count?: number
}
type ArtistMin = Pick<Tables<'artists'>, 'id' | 'name'>

export default function ArtistList({ artists }: { artists: Artist[] }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArtistMin[]>([])
  const [loading, setLoading] = useState(false)

  // ホーム画面の検索窓と同じ /api/suggest でサーバー検索（280ms デバウンス）
  useEffect(() => {
    const q = query.trim()
    if (!q) { setResults([]); setLoading(false); return }
    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?type=artists&q=${encodeURIComponent(q)}`, { signal: controller.signal })
        const data: { artists: ArtistMin[] } = res.ok ? await res.json() : { artists: [] }
        setResults(data.artists)
        setLoading(false)
      } catch {
        // abort 時は無視（次の検索が走っている）
        if (!controller.signal.aborted) { setResults([]); setLoading(false) }
      }
    }, 280)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  const searching = query.trim() !== ''
  const filtered: (Artist | ArtistMin)[] = searching ? results : artists

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-black text-white">アーティスト一覧</h1>
        {!searching && <p className="text-sm text-[#8888aa]">{filtered.length}組</p>}
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8888aa]" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="アーティスト名で検索..."
          className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
        />
      </div>

      {searching ? (
        <div className="space-y-1">
          {filtered.map((a) => (
            <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
              className="flex items-center gap-3 px-4 py-3 glass rounded-xl hover:border-white/20 transition-all group">
              <Mic2 size={16} className="text-[#8888aa] shrink-0" />
              <p className="font-bold text-sm text-white group-hover:text-[#b3b3b3] transition-colors">{a.name}</p>
            </Link>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-[#8888aa] py-4 text-center">該当するアーティストが見つかりませんでした</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((a) => {
            const af = a as Artist
            return (
              <div key={a.id} className="glass rounded-2xl overflow-hidden hover:border-white/20 transition-all group">
                <Link href={`/artists/${a.id.slice(0, 8)}`} className="block">
                  <div className="h-32 bg-gradient-to-br from-[#282828]/50 to-[#282828]/30 relative">
                    {af.image_url ? (
                      <img src={af.image_url} alt={a.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" style={{ objectPosition: `${af.image_crop_x ?? 50}% ${af.image_crop_y ?? 50}%` }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20">
                        <Mic2 size={40} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="px-3 pt-3 pb-1">
                    <p className="font-bold text-sm text-white truncate group-hover:text-[#b3b3b3] transition-colors">{a.name}</p>
                    {af.description && (
                      <p className="text-xs text-[#8888aa] mt-0.5 line-clamp-2 leading-relaxed">{af.description}</p>
                    )}
                  </div>
                </Link>
                <div className="px-3 pb-3 pt-1">
                  <FollowButton artistId={a.id} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
