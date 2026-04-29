'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Artist = { id: string; name: string }

export default function ArtistFilter({ artists, tab, artist }: { artists: Artist[]; tab: string; artist: string }) {
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (value) params.set('artist', value)
    router.push(`/concerts?${params.toString()}`)
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <select
        value={artist}
        onChange={handleChange}
        className="bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-sm text-white focus:outline-none"
      >
        <option value="">全アーティスト</option>
        {artists.map(a => (
          <option key={a.id} value={a.name}>{a.name}</option>
        ))}
      </select>
      {artist && (
        <Link
          href={`/concerts?tab=${tab}`}
          className="text-xs text-[#8888aa] hover:text-white border border-white/10 rounded-full px-3 py-1.5 transition-colors"
        >
          ✕ 解除
        </Link>
      )}
    </div>
  )
}
