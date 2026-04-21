'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, MapPin } from 'lucide-react'
import type { Tables } from '@/types/supabase'

type UpcomingConcert = Pick<Tables<'concerts'>, 'id' | 'venue_name' | 'date' | 'start_time' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

const PAGE_SIZE = 6

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
      .select('id, venue_name, date, start_time, image_url, artists(id, name), tours(id, name, image_url)')
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
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {concerts.map(c => (
          <Link key={c.id} href={`/concerts/${c.id}`}
            className="glass rounded-2xl overflow-hidden hover:border-violet-500/40 transition-all group">
            <div className="h-36 bg-gradient-to-br from-violet-900/50 to-pink-900/30 relative">
              {(c.image_url || c.tours?.image_url) && (
                <img src={c.image_url ?? c.tours?.image_url ?? undefined} alt="" className="w-full h-full object-cover opacity-50 group-hover:opacity-60 transition-opacity" />
              )}
              <div className="absolute inset-0 flex items-end p-3">
                <div>
                  <p className="text-xs text-violet-300 font-bold">{c.artists?.name}</p>
                  <p className="text-sm font-bold text-white leading-tight">{c.tours?.name}</p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-1">
              <p className="text-xs text-[#8888aa] flex items-center gap-1">
                <Calendar size={11} className="shrink-0" />
                {new Date(c.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                {c.start_time && ` ${c.start_time.slice(0, 5)}〜`}
              </p>
              <p className="text-sm font-medium text-white truncate flex items-center gap-1">
                <MapPin size={11} className="shrink-0 text-[#8888aa]" />
                {c.venue_name}
              </p>
            </div>
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
