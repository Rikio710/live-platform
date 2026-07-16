'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, MapPin } from 'lucide-react'
import type { Tables } from '@/types/supabase'

type UpcomingConcert = Pick<Tables<'concerts'>, 'id' | 'slug' | 'venue_name' | 'date' | 'start_time' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

const PAGE_SIZE = 8

export default function UpcomingConcerts({ initialConcerts }: { initialConcerts: UpcomingConcert[] }) {
  const supabase = createClient()
  const [concerts, setConcerts] = useState<UpcomingConcert[]>(initialConcerts)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialConcerts.length === PAGE_SIZE)

  const loadMore = async () => {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('concerts')
      .select('id, slug, venue_name, date, start_time, image_url, artists(id, name, image_url), tours(id, name, image_url)')
      .gte('date', today)
      .order('date', { ascending: true })
      .range(concerts.length, concerts.length + PAGE_SIZE - 1)

    const rows = (data ?? []) as unknown as UpcomingConcert[]
    setConcerts(prev => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false)
  }

  if (concerts.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
        現在登録されている公演はありません
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {concerts.map(c => (
          <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
            className="group rounded-lg p-3 hover:bg-[#282828] transition-colors">
            <div className="aspect-square rounded-md overflow-hidden bg-[#282828] mb-3">
              {(c.image_url || c.tours?.image_url || c.artists?.image_url) ? (
                <img src={c.image_url ?? c.tours?.image_url ?? c.artists?.image_url ?? undefined} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Calendar size={32} className="text-[#535353]" />
                </div>
              )}
            </div>
            <p className="text-sm font-bold text-white truncate leading-tight">
              {c.tours?.name ?? c.venue_name}
            </p>
            <p className="text-xs text-[#b3b3b3] truncate mt-0.5">{c.artists?.name}</p>
            <p className="text-xs text-[#b3b3b3] mt-0.5">
              {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              {c.start_time && ` · ${c.start_time.slice(0, 5)}`}
            </p>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loading}
            className="border border-white/10 hover:border-white/20 text-[#8888aa] hover:text-white font-bold px-6 py-2.5 rounded-full transition-colors text-sm disabled:opacity-50"
          >
            {loading ? '読み込み中...' : 'もっと見る'}
          </button>
        </div>
      )}
    </div>
  )
}
