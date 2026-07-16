'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mic2 } from 'lucide-react'

const INITIAL_COUNT = 12

export default function ArtistsSection({ artists }: { artists: any[] }) {
  const [showAll, setShowAll] = useState(false)

  const displayed = showAll ? artists : artists.slice(0, INITIAL_COUNT)

  return (
    <section className="max-w-5xl mx-auto px-4 py-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">アーティスト</h2>
        <Link href="/artists" className="text-sm text-[#b3b3b3] hover:text-[#b3b3b3] transition-colors font-medium">
          すべて見る →
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {displayed.map((a: any) => (
          <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
            className="flex items-center gap-2 glass rounded-full px-4 py-2 hover:border-white/20 transition-colors text-sm font-medium">
            {a.image_url ? (
              <img src={a.image_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <span className="w-6 h-6 rounded-full bg-[#333333] flex items-center justify-center">
                <Mic2 size={11} className="text-[#b3b3b3]" />
              </span>
            )}
            {a.name}
          </Link>
        ))}
      </div>
      {!showAll && artists.length > INITIAL_COUNT && (
        <button
          onClick={() => setShowAll(true)}
          className="text-sm text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-4 py-2 rounded-full transition-colors"
        >
          さらに表示 ({artists.length - INITIAL_COUNT}組)
        </button>
      )}
    </section>
  )
}
