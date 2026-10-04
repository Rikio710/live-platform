'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, ImageIcon } from 'lucide-react'
import FocalPointEditor from '@/components/admin/FocalPointEditor'

type Artist = {
  id: string
  name: string
  image_url: string | null
  image_crop_x: number | null
  image_crop_y: number | null
  image_crop_scale: number | null
}

export default function ArtistImagesPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/admin/artists')
      .then(r => r.json())
      .then(data => { setArtists(data); setLoading(false) })
  }, [])

  const filtered = artists.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <ImageIcon size={20} className="text-white" />
        <h1 className="text-xl font-bold text-white">アーティスト画像調整</h1>
      </div>
      <p className="text-xs text-[#8888aa]">
        アーティストをタップして焦点（表示位置）を調整できます。変更はホーム・アーティストページ・公演ページなど全ての画像に反映されます。
      </p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="アーティスト名で絞り込み"
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/20"
      />

      {loading ? (
        <p className="text-sm text-[#8888aa] text-center py-8">読み込み中...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(artist => {
            const isOpen = openId === artist.id
            return (
              <div key={artist.id} className="glass rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenId(isOpen ? null : artist.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                >
                  {artist.image_url ? (
                    <img
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                      style={{
                        objectPosition: `${artist.image_crop_x ?? 50}% ${artist.image_crop_y ?? 50}%`,
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <ImageIcon size={16} className="text-[#8888aa]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{artist.name}</p>
                    {artist.image_url ? (
                      <p className="text-[11px] text-[#555577]">
                        焦点 {artist.image_crop_x ?? 50}% / {artist.image_crop_y ?? 50}%
                        {artist.image_crop_scale && artist.image_crop_scale !== 1 && ` · ズーム ${artist.image_crop_scale}×`}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#555577]">画像なし</p>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={16} className="text-[#8888aa] shrink-0" />
                    : <ChevronDown size={16} className="text-[#8888aa] shrink-0" />
                  }
                </button>

                {isOpen && artist.image_url && (
                  <div className="border-t border-white/5">
                    <FocalPointEditor artist={artist as Artist & { image_url: string }} />
                  </div>
                )}
                {isOpen && !artist.image_url && (
                  <div className="border-t border-white/5 px-4 py-4 text-sm text-[#8888aa]">
                    画像が設定されていません
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-[#8888aa] text-center py-8">該当するアーティストがいません</p>
          )}
        </div>
      )}
    </div>
  )
}
