'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useEffect, useCallback } from 'react'
import { Search, Mic2, Route } from 'lucide-react'
import Link from 'next/link'

type SuggestResult = {
  artists: { id: string; name: string; image_url: string | null }[]
  tours: { id: string; name: string; artists: { name: string } | null }[]
}

export default function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)
  const [results, setResults] = useState<SuggestResult | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) { setResults(null); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`)
      if (!res.ok) return
      const data: SuggestResult = await res.json()
      const hasResults = data.artists.length > 0 || data.tours.length > 0
      setResults(data)
      setOpen(hasResults)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!value.trim()) { setResults(null); setOpen(false); return }
    timerRef.current = setTimeout(() => fetchSuggestions(value.trim()), 280)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [value, fetchSuggestions])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim()) {
      setOpen(false)
      router.push(`/search?q=${encodeURIComponent(value.trim())}`)
    }
  }

  const totalResults = (results?.artists.length ?? 0) + (results?.tours.length ?? 0)

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8888aa] pointer-events-none"
          />
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onFocus={() => { if (results && totalResults > 0) setOpen(true) }}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="アーティスト・ライブ・会場を検索"
            autoComplete="off"
            className="w-full bg-white/5 border border-white/10 hover:border-white/20 focus:border-white/30 rounded-2xl pl-11 pr-4 py-4 text-white placeholder-[#8888aa] text-sm focus:outline-none transition-colors"
          />
        </div>
      </form>

      {open && results && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a2e] border border-white/10 rounded-2xl overflow-hidden z-50 shadow-xl">
          {results.artists.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#8888aa] flex items-center gap-1.5">
                <Mic2 size={10} /> アーティスト
              </p>
              {results.artists.map(a => (
                <Link
                  key={a.id}
                  href={`/artists/${a.id.slice(0, 8)}`}
                  onClick={() => { setOpen(false); setValue('') }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                >
                  {a.image_url
                    ? <img src={a.image_url} alt={a.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    : <div className="w-7 h-7 rounded-full bg-white/10 shrink-0 flex items-center justify-center"><Mic2 size={12} className="text-white/40" /></div>
                  }
                  <span className="text-sm text-white truncate">{a.name}</span>
                </Link>
              ))}
            </div>
          )}

          {results.tours.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#8888aa] flex items-center gap-1.5">
                <Route size={10} /> ツアー
              </p>
              {results.tours.map((t: any) => (
                <Link
                  key={t.id}
                  href={`/tours/${t.id.slice(0, 8)}`}
                  onClick={() => { setOpen(false); setValue('') }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-white/10 shrink-0 flex items-center justify-center"><Route size={12} className="text-white/40" /></div>
                  <div className="min-w-0">
                    {t.artists?.name && <p className="text-[10px] text-[#8888aa]">{t.artists.name}</p>}
                    <p className="text-sm text-white truncate">{t.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {value.trim() && (
            <Link
              href={`/search?q=${encodeURIComponent(value.trim())}`}
              onClick={() => { setOpen(false); setValue('') }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-t border-white/5 text-sm text-[#8888aa] hover:text-white"
            >
              <Search size={14} />
              「{value.trim()}」をすべて検索
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
