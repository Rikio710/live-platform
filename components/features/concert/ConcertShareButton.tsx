'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import ShareModal from './ShareModal'

type Song = { song_name: string; song_type: string; is_encore: boolean }

export default function ConcertShareButton({ url, title, songs }: {
  url: string
  title: string
  songs?: Song[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-2 rounded-full transition-colors"
      >
        <Share2 size={14} />
        シェア
      </button>
      <ShareModal isOpen={open} onClose={() => setOpen(false)} url={url} title={title} songs={songs} />
    </>
  )
}
