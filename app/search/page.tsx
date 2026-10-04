import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Mic2, Route, CalendarDays, Music } from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import SearchResultsTracker from './SearchResultsTracker'

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
        <SearchBox defaultValue="" />
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
    supabase.from('artists').select('id, slug, name, image_url, image_crop_x, image_crop_y').ilike('name', like).limit(5),
    supabase.from('tours').select('id, slug, name, start_date, artists!tours_artist_id_fkey(name)').ilike('name', like).limit(5),
    supabase.from('concerts').select('id, slug, venue_name, date, artists(name), tours(name)').ilike('venue_name', like).limit(5),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('songs')
      .select('id, name, album_name, image_url, spotify_artist_name, artist_id, artists(name)')
      .ilike('name', like)
      .order('name')
      .limit(10),
  ])

  // 曲の演奏回数を取得
  const songIds = (songs ?? []).map((s: any) => s.id) // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: perfRows } = songIds.length > 0
    ? await supabase.from('setlist_songs').select('song_id').in('song_id', songIds).eq('song_type', 'song')
    : { data: [] }
  const perfCountMap = new Map<string, number>()
  for (const r of (perfRows ?? []) as { song_id: string | null }[]) {
    if (r.song_id) perfCountMap.set(r.song_id, (perfCountMap.get(r.song_id) ?? 0) + 1)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const songResults = (songs ?? []) as any[]

  const total = (artists?.length ?? 0) + (tours?.length ?? 0) + (concerts?.length ?? 0) + songResults.length

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <SearchResultsTracker query={query} total={total} />
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-white">検索</h1>
        <SearchBox defaultValue={query} />
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
              <Link key={a.id} href={`/artists/${a.id.slice(0, 8)}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
                {a.image_url
                  ? <img src={a.image_url} alt={a.name} className="w-9 h-9 rounded-full object-cover shrink-0" style={{ objectPosition: `${(a as any).image_crop_x ?? 50}% ${(a as any).image_crop_y ?? 50}%` }} />
                  : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#333333] to-[#282828] shrink-0 flex items-center justify-center"><Mic2 size={14} className="text-white/60" /></div>
                }
                <span className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors">{a.name}</span>
                <span className="ml-auto text-[#8888aa] group-hover:text-[#b3b3b3]">›</span>
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
              <Link key={t.id} href={`/tours/${t.id.slice(0, 8)}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
                <div className="flex-1 min-w-0">
                  {t.artists?.name && <p className="text-xs text-[#b3b3b3]">{t.artists.name}</p>}
                  <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{t.name}</p>
                  {t.start_date && <p className="text-xs text-[#8888aa]">{t.start_date.slice(0, 4)}</p>}
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
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
              <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
                <div className="flex-1 min-w-0">
                  {c.artists?.name && <p className="text-xs text-[#b3b3b3]">{c.artists.name}</p>}
                  <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{c.venue_name}</p>
                  <p className="text-xs text-[#8888aa]">{c.date}{c.tours?.name ? ` — ${c.tours.name}` : ''}</p>
                </div>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
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
            {songResults.map((s: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const artistName = s.spotify_artist_name ?? s.artists?.name ?? ''
              const count = perfCountMap.get(s.id) ?? 0
              return (
                <Link key={s.id} href={`/songs/${(s.id as string).slice(0, 8)}`}
                  className="glass rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-colors group">
                  {s.image_url ? (
                    <img src={s.image_url} alt={s.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#282828] flex items-center justify-center shrink-0">
                      <Music size={14} className="text-white/30" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white group-hover:text-[#b3b3b3] transition-colors truncate">{s.name}</p>
                    <p className="text-xs text-[#8888aa] truncate">
                      {artistName}{s.album_name ? ` · ${s.album_name}` : ''}
                    </p>
                  </div>
                  <p className="text-xs text-[#555577] shrink-0">{count > 0 ? `${count}公演` : ''}</p>
                  <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
