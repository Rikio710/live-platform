import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Mic2, Route, CalendarDays, Music } from 'lucide-react'
import SearchInput from './SearchInput'

export const metadata: Metadata = { title: '検索' }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q = '' } = await searchParams
  const query = q.trim()

  if (!query) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-black text-white">検索</h1>
        <SearchInput defaultValue="" />
        <p className="text-sm text-[#8888aa]">アーティスト・ツアー・公演・曲名で検索できます</p>
      </div>
    )
  }

  const supabase = await createClient()
  const like = `%${query}%`

  const [
    { data: artists },
    { data: tours },
    { data: concerts },
    { data: songs },
  ] = await Promise.all([
    supabase.from('artists').select('id, slug, name, image_url').ilike('name', like).limit(5),
    supabase.from('tours').select('id, slug, name, start_date, artists(name)').ilike('name', like).limit(5),
    supabase.from('concerts').select('id, slug, venue_name, date, artists(name), tours(name)').ilike('venue_name', like).limit(5),
    supabase.from('setlist_songs')
      .select('song_name, concerts(id, slug, venue_name, date, artists(name))')
      .ilike('song_name', like)
      .limit(20),
  ])

  // 曲名：同じ曲名でグループ化して公演リストにまとめる
  const songMap = new Map<string, { song_name: string; concerts: { id: string; slug: string | null; venue_name: string; date: string; artist: string }[] }>()
  for (const s of (songs ?? []) as any[]) {
    if (!s.concerts) continue
    const key = s.song_name
    if (!songMap.has(key)) songMap.set(key, { song_name: key, concerts: [] })
    const entry = songMap.get(key)!
    if (!entry.concerts.find(c => c.id === s.concerts.id)) {
      entry.concerts.push({
        id: s.concerts.id,
        slug: s.concerts.slug,
        venue_name: s.concerts.venue_name,
        date: s.concerts.date,
        artist: s.concerts.artists?.name ?? '',
      })
    }
  }
  const songResults = [...songMap.values()].slice(0, 5)

  const total = (artists?.length ?? 0) + (tours?.length ?? 0) + (concerts?.length ?? 0) + songResults.length

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-white">検索</h1>
        <SearchInput defaultValue={query} />
        <p className="text-xs text-[#8888aa]">「{query}」の検索結果 {total}件</p>
      </div>

      {total === 0 && (
        <p className="text-sm text-[#8888aa]">該当する結果が見つかりませんでした</p>
      )}

      {(artists?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#8888aa] flex items-center gap-2">
            <Mic2 size={14} /> アーティスト
          </h2>
          <div className="space-y-2">
            {(artists ?? []).map(a => (
              <Link key={a.id} href={`/artists/${a.slug ?? a.id}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-violet-500/40 transition-colors group">
                {a.image_url
                  ? <img src={a.image_url} alt={a.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-800 to-pink-800 shrink-0 flex items-center justify-center"><Mic2 size={14} className="text-white/60" /></div>
                }
                <span className="font-bold text-white group-hover:text-violet-300 transition-colors">{a.name}</span>
                <span className="ml-auto text-[#8888aa] group-hover:text-violet-300">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(tours?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#8888aa] flex items-center gap-2">
            <Route size={14} /> ツアー
          </h2>
          <div className="space-y-2">
            {(tours ?? []).map((t: any) => (
              <Link key={t.id} href={`/tours/${t.slug ?? t.id}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-violet-500/40 transition-colors group">
                <div className="flex-1 min-w-0">
                  {t.artists?.name && <p className="text-xs text-violet-300">{t.artists.name}</p>}
                  <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate">{t.name}</p>
                  {t.start_date && <p className="text-xs text-[#8888aa]">{t.start_date.slice(0, 4)}</p>}
                </div>
                <span className="text-[#8888aa] group-hover:text-violet-300 shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(concerts?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#8888aa] flex items-center gap-2">
            <CalendarDays size={14} /> 公演
          </h2>
          <div className="space-y-2">
            {(concerts ?? []).map((c: any) => (
              <Link key={c.id} href={`/concerts/${c.slug ?? c.id}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-violet-500/40 transition-colors group">
                <div className="flex-1 min-w-0">
                  {c.artists?.name && <p className="text-xs text-violet-300">{c.artists.name}</p>}
                  <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate">{c.venue_name}</p>
                  <p className="text-xs text-[#8888aa]">{c.date}{c.tours?.name ? ` — ${c.tours.name}` : ''}</p>
                </div>
                <span className="text-[#8888aa] group-hover:text-violet-300 shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {songResults.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-[#8888aa] flex items-center gap-2">
            <Music size={14} /> 曲名
          </h2>
          <div className="space-y-2">
            {songResults.map(s => (
              <div key={s.song_name} className="glass rounded-2xl px-4 py-3 space-y-2">
                <p className="font-bold text-white">{s.song_name}</p>
                <div className="space-y-1">
                  {s.concerts.slice(0, 3).map(c => (
                    <Link key={c.id} href={`/concerts/${c.slug ?? c.id}`}
                      className="flex items-center gap-2 text-xs text-[#8888aa] hover:text-violet-300 transition-colors">
                      <span className="shrink-0">{c.date}</span>
                      <span className="truncate">{c.artist && `${c.artist} `}{c.venue_name}</span>
                    </Link>
                  ))}
                  {s.concerts.length > 3 && (
                    <p className="text-xs text-[#8888aa]">他 {s.concerts.length - 3}公演</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
