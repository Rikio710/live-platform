'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search } from 'lucide-react'

export default function SearchInput({ defaultValue }: { defaultValue: string }) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        if (value.trim()) router.push(`/search?q=${encodeURIComponent(value.trim())}`)
      }}
      className="relative"
    >
      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8888aa]" />
      <input
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="アーティスト・ツアー・会場・曲名で検索..."
        autoFocus
        className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
      />
    </form>
  )
}
