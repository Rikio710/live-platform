'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Music, Search, Disc3, ChevronDown, ChevronUp, X } from 'lucide-react'

type Artist = { id: string; name: string }
type Song = {
  id: string
  name: string
  album_name: string | null
  release_year: number | null
  spotify_track_id: string | null
  spotify_preview_url: string | null
  play_count: number
}
type SpotifyCandidate = {
  spotify_track_id: string
  name: string
  artist: string
  album_name: string | null
  release_year: number | null
  spotify_preview_url: string | null
  image_url: string | null
}

export default function AdminSongsPage() {
  const supabase = createClient()
  const [artists, setArtists] = useState<Artist[]>([])
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  // Spotify enrich state
  const [enrichingId, setEnrichingId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<SpotifyCandidate[]>([])
  const [enrichLoading, setEnrichLoading] = useState(false)

  useEffect(() => {
    supabase.from('artists').select('id, name').order('name').then(({ data }) => setArtists(data ?? []))
  }, [])

  const loadSongs = async (artist: Artist) => {
    setLoading(true)
    setSongs([])
    const res = await fetch(`/api/admin/songs?artist_id=${artist.id}`)
    const data = await res.json()
    setSongs(data.songs ?? [])
    setLoading(false)
  }

  const handleSelectArtist = (artist: Artist) => {
    setSelectedArtist(artist)
    setSearchQ('')
    loadSongs(artist)
  }

  const handleEnrich = async (song: Song) => {
    if (enrichingId === song.id) { setEnrichingId(null); setCandidates([]); return }
    setEnrichingId(song.id)
    setCandidates([])
    setEnrichLoading(true)
    const res = await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_name: selectedArtist?.name }),
    })
    const data = await res.json()
    setCandidates(data.candidates ?? [])
    setEnrichLoading(false)
  }

  const handleApply = async (song: Song, candidate: SpotifyCandidate) => {
    const res = await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    })
    if (!res.ok) return
    setSongs(prev => prev.map(s => s.id === song.id
      ? { ...s, spotify_track_id: candidate.spotify_track_id, spotify_preview_url: candidate.spotify_preview_url, album_name: candidate.album_name, release_year: candidate.release_year }
      : s
    ))
    setEnrichingId(null)
    setCandidates([])
  }

  const handleDelete = async (songId: string) => {
    if (!confirm('この曲を削除しますか？\n※ セトリとの紐づきは解除されますが、セトリデータ自体は残ります。')) return
    const res = await fetch(`/api/admin/songs/${songId}`, { method: 'DELETE' })
    if (res.ok) setSongs(prev => prev.filter(s => s.id !== songId))
  }

  const filtered = songs.filter(s => s.name.toLowerCase().includes(searchQ.toLowerCase()))
  const enriched = songs.filter(s => s.spotify_track_id).length

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Music size={20} className="text-white" />
        <h1 className="text-xl font-bold text-white">曲管理</h1>
      </div>

      {/* アーティスト選択 */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <p className="text-sm text-[#8888aa]">アーティストを選択</p>
        <div className="flex flex-wrap gap-2">
          {artists.map(a => (
            <button
              key={a.id}
              onClick={() => handleSelectArtist(a)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                selectedArtist?.id === a.id
                  ? 'bg-white text-black font-bold'
                  : 'border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {selectedArtist && (
        <>
          {/* サマリー */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-white font-bold">{selectedArtist.name}</h2>
              <p className="text-xs text-[#8888aa]">
                {songs.length}曲 · Spotify連携済み {enriched}曲
                {songs.length > 0 && ` (${Math.round(enriched / songs.length * 100)}%)`}
              </p>
            </div>
            <button
              onClick={async () => {
                // 未連携の曲を順番にenrich
                const unenriched = songs.filter(s => !s.spotify_track_id)
                if (unenriched.length === 0) { alert('すべて連携済みです'); return }
                if (!confirm(`未連携 ${unenriched.length}曲を一括自動連携しますか？`)) return
                for (const song of unenriched) {
                  const res = await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ artist_name: selectedArtist.name }),
                  })
                  const data = await res.json()
                  const top = data.candidates?.[0]
                  if (top) {
                    await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(top),
                    })
                    setSongs(prev => prev.map(s => s.id === song.id
                      ? { ...s, spotify_track_id: top.spotify_track_id, spotify_preview_url: top.spotify_preview_url, album_name: top.album_name, release_year: top.release_year }
                      : s
                    ))
                  }
                  await new Promise(r => setTimeout(r, 400))
                }
                alert('完了')
              }}
              className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors"
            >
              一括自動連携
            </button>
          </div>

          {/* 検索 */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8888aa]" />
            <input
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="曲名で絞り込み"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
            />
          </div>

          {/* 曲リスト */}
          {loading ? (
            <p className="text-sm text-[#8888aa] text-center py-8">読み込み中...</p>
          ) : (
            <div className="space-y-2">
              {filtered.map(song => (
                <div key={song.id} className="glass rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${song.spotify_track_id ? 'bg-green-400/70' : 'bg-white/20'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{song.name}</p>
                      <p className="text-[11px] text-[#8888aa]">
                        {song.play_count}回演奏
                        {song.album_name && ` · ${song.album_name}`}
                        {song.release_year && ` (${song.release_year})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {song.spotify_track_id && (
                        <span className="text-[10px] text-green-400/70 border border-green-400/20 rounded px-1.5 py-0.5 uppercase tracking-widest">
                          linked
                        </span>
                      )}
                      <button
                        onClick={() => handleEnrich(song)}
                        className="text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <Disc3 size={12} className="inline mr-1" />
                        Spotify
                      </button>
                      <button onClick={() => handleDelete(song.id)} className="text-[#8888aa] hover:text-red-400 transition-colors p-1">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Spotify候補 */}
                  {enrichingId === song.id && (
                    <div className="border-t border-white/5 px-4 py-3 space-y-2">
                      {enrichLoading ? (
                        <p className="text-xs text-[#8888aa]">検索中...</p>
                      ) : candidates.length === 0 ? (
                        <p className="text-xs text-[#8888aa]">候補が見つかりませんでした</p>
                      ) : (
                        <>
                          <p className="text-[10px] text-[#8888aa] uppercase tracking-widest">Spotify候補</p>
                          <div className="space-y-1.5">
                            {candidates.map(c => (
                              <button
                                key={c.spotify_track_id}
                                onClick={() => handleApply(song, c)}
                                className="w-full flex items-center gap-3 text-left hover:bg-white/5 rounded-lg px-2 py-2 transition-colors group"
                              >
                                {c.image_url && (
                                  <img src={c.image_url} alt={c.name} className="w-9 h-9 rounded object-cover shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white truncate group-hover:text-white">{c.name}</p>
                                  <p className="text-[11px] text-[#8888aa] truncate">{c.artist} · {c.album_name}{c.release_year ? ` (${c.release_year})` : ''}</p>
                                </div>
                                <span className="text-[10px] text-[#8888aa] group-hover:text-white transition-colors shrink-0">適用</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
