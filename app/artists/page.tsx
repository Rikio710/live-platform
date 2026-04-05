'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Mic2, Search } from 'lucide-react'
import FollowButton from '@/components/features/artist/FollowButton'

export default function ArtistsPage() {
  const supabase = createClient()
  const [artists, setArtists] = useState<any[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('artists')
      .select('id, name, image_url, description')
      .order('name')
      .then(({ data }) => setArtists(data ?? []))
  }, [])

  const filtered = query
    ? artists.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
    : artists

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">アーティスト</h1>
        <p className="text-sm text-[#8888aa] mt-1">{filtered.length}組</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8888aa]" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="アーティスト名で検索..."
          className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((a: any) => (
          <div key={a.id} className="glass rounded-2xl overflow-hidden hover:border-violet-500/30 transition-all group">
            <Link href={`/artists/${a.id}`} className="block">
              <div className="h-32 bg-gradient-to-br from-violet-900/50 to-pink-900/30 relative">
                {a.image_url ? (
                  <img src={a.image_url} alt={a.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-20">
                    <Mic2 size={40} className="text-white" />
                  </div>
                )}
              </div>
              <div className="px-3 pt-3 pb-1">
                <p className="font-bold text-sm text-white truncate group-hover:text-violet-300 transition-colors">{a.name}</p>
                {a.description && (
                  <p className="text-xs text-[#8888aa] mt-0.5 line-clamp-2 leading-relaxed">{a.description}</p>
                )}
              </div>
            </Link>
            <div className="px-3 pb-3 pt-1">
              <FollowButton artistId={a.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
