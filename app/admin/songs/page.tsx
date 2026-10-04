'use client'

import { useState, useEffect, useCallback } from 'react'
import { Music, Disc3, X, ChevronDown, ChevronUp, GitMerge, ScanSearch } from 'lucide-react'

type Artist = { id: string; name: string }
type Song = {
  id: string
  name: string
  album_name: string | null
  release_year: number | null
  spotify_track_id: string | null
  spotify_preview_url: string | null
  image_url: string | null
  spotify_artist_name: string | null
  artist_id: string
  artists: { id: string; name: string } | null
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

type DuplicateGroup = {
  artist: { id: string; name: string }
  songs: (Song & { play_count: number })[]
}

export default function AdminSongsPage() {
  const [tab, setTab] = useState<'unlinked' | 'all' | 'check'>('unlinked')
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)

  const [enrichingId, setEnrichingId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<SpotifyCandidate[]>([])
  const [enrichLoading, setEnrichLoading] = useState(false)

  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')

  const [deduping, setDeduping] = useState(false)
  const [dedupeResult, setDedupeResult] = useState<string | null>(null)

  // 重複チェックタブ
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([])
  const [dupLoading, setDupLoading] = useState(false)
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const [mergingKey, setMergingKey] = useState<string | null>(null)

  // 一覧タブ: アーティストごとの展開状態
  const [collapsedArtists, setCollapsedArtists] = useState<Set<string>>(new Set())

  const loadSongs = useCallback(async (mode: 'unlinked' | 'all') => {
    setLoading(true)
    setSongs([])
    const param = mode === 'unlinked' ? 'unlinked=true' : 'all=true'
    const res = await fetch(`/api/admin/songs?${param}`)
    const data = await res.json()
    setSongs(data.songs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'unlinked' || tab === 'all') loadSongs(tab)
  }, [tab, loadSongs])

  const handleEnrich = async (song: Song) => {
    if (enrichingId === song.id) { setEnrichingId(null); setCandidates([]); return }
    setEnrichingId(song.id)
    setCandidates([])
    setEnrichLoading(true)
    const res = await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_name: song.artists?.name }),
    })
    const data = await res.json()
    setCandidates(data.candidates ?? [])
    setEnrichLoading(false)
  }

  const handleApply = async (song: Song, candidate: SpotifyCandidate) => {
    await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    })
    setSongs(prev => prev.map(s => s.id === song.id
      ? { ...s, spotify_track_id: candidate.spotify_track_id, image_url: candidate.image_url, spotify_artist_name: candidate.artist, album_name: candidate.album_name, release_year: candidate.release_year }
      : s
    ))
    setEnrichingId(null)
    setCandidates([])
    // 未登録タブの場合はリストから除外
    if (tab === 'unlinked') {
      setSongs(prev => prev.filter(s => s.id !== song.id))
    }
  }

  const handleDelete = async (songId: string) => {
    if (!confirm('この曲を削除しますか？')) return
    const res = await fetch(`/api/admin/songs/${songId}`, { method: 'DELETE' })
    if (res.ok) setSongs(prev => prev.filter(s => s.id !== songId))
  }

  const handleBulkLink = async () => {
    if (!confirm(`未登録 ${songs.length}曲を一括自動連携しますか？`)) return
    setBulkRunning(true)
    let done = 0
    for (const song of songs) {
      setBulkProgress(`${done}/${songs.length} 処理中: ${song.name}`)
      const res = await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_name: song.artists?.name }),
      })
      const data = await res.json()
      const top = data.candidates?.[0]
      if (top) {
        await fetch(`/api/admin/songs/${song.id}/spotify-enrich`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(top),
        })
      }
      done++
      await new Promise(r => setTimeout(r, 400))
    }
    setBulkRunning(false)
    setBulkProgress('')
    loadSongs('unlinked')
  }

  // アーティストごとにグループ化
  const grouped = songs.reduce<{ artist: Artist; songs: Song[] }[]>((acc, song) => {
    const artistId = song.artist_id
    const existing = acc.find(g => g.artist.id === artistId)
    if (existing) {
      existing.songs.push(song)
    } else {
      acc.push({ artist: { id: artistId, name: song.artists?.name ?? '不明' }, songs: [song] })
    }
    return acc
  }, []).sort((a, b) => a.artist.name.localeCompare(b.artist.name, 'ja'))

  const loadDupCheck = async () => {
    setDupLoading(true)
    setDismissedKeys(new Set())
    const res = await fetch('/api/admin/songs/check-duplicates')
    const data = await res.json()
    setDupGroups(data.groups ?? [])
    setDupLoading(false)
  }

  const handleMerge = async (group: DuplicateGroup, canonicalId: string) => {
    const key = group.songs.map(s => s.id).sort().join(',')
    setMergingKey(key)
    const dupIds = group.songs.filter(s => s.id !== canonicalId).map(s => s.id)
    await fetch('/api/admin/songs/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonicalId, dupIds }),
    })
    setDupGroups(prev => prev.filter(g => g.songs.map(s => s.id).sort().join(',') !== key))
    setMergingKey(null)
  }

  const handleDismiss = (group: DuplicateGroup) => {
    const key = group.songs.map(s => s.id).sort().join(',')
    setDismissedKeys(prev => new Set([...prev, key]))
  }

  const handleDedupe = async () => {
    if (!confirm('重複した曲を統合します。この操作は元に戻せません。続けますか？')) return
    setDeduping(true)
    setDedupeResult(null)
    try {
      const res = await fetch('/api/admin/songs/deduplicate', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setDedupeResult(`エラー: ${data.error}`)
      } else {
        setDedupeResult(`完了: ${data.mergedGroups}グループ統合、${data.deletedSongs}曲削除、${data.updatedLinks}件のリンク更新`)
        if (tab !== 'check') loadSongs(tab)
      }
    } catch {
      setDedupeResult('エラーが発生しました')
    }
    setDeduping(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Music size={20} className="text-white" />
          <h1 className="text-xl font-bold text-white">曲管理</h1>
        </div>
        <button
          onClick={handleDedupe}
          disabled={deduping}
          className="flex items-center gap-1.5 text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
        >
          <GitMerge size={12} />
          {deduping ? '処理中...' : '重複を整理'}
        </button>
      </div>
      {dedupeResult && (
        <p className="text-xs text-[#8888aa] bg-white/5 rounded-xl px-4 py-2">{dedupeResult}</p>
      )}

      {/* タブ */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setTab('unlinked')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'unlinked' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          未登録
          {tab === 'unlinked' && !loading && songs.length > 0 && (
            <span className="ml-2 text-xs bg-white/10 text-[#b3b3b3] px-1.5 py-0.5 rounded-full">{songs.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'all' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          一覧
        </button>
        <button
          onClick={() => { setTab('check'); if (dupGroups.length === 0 && !dupLoading) loadDupCheck() }}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'check' ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'}`}
        >
          重複チェック
          {tab === 'check' && !dupLoading && dupGroups.length > 0 && (
            <span className="ml-2 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
              {dupGroups.filter(g => !dismissedKeys.has(g.songs.map(s => s.id).sort().join(','))).length}
            </span>
          )}
        </button>
      </div>

      {/* 未登録タブ */}
      {tab === 'unlinked' && (
        <div className="space-y-4">
          {/* 一括連携ボタン */}
          {!loading && songs.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-[#8888aa]">未連携 <span className="text-white font-bold">{songs.length}</span> 曲</p>
              <button
                onClick={handleBulkLink}
                disabled={bulkRunning}
                className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
              >
                {bulkRunning ? bulkProgress || '処理中...' : '一括自動連携'}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-[#8888aa] text-center py-8">読み込み中...</p>
          ) : songs.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-[#8888aa]">未連携の曲はありません</div>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ artist, songs: artistSongs }) => (
                <div key={artist.id} className="space-y-1">
                  <p className="text-xs font-bold text-[#8888aa] uppercase tracking-widest px-1 pb-1 border-b border-white/5">
                    {artist.name}
                    <span className="ml-2 font-normal normal-case tracking-normal text-[#555577]">{artistSongs.length}曲</span>
                  </p>
                  {artistSongs.map(song => (
                    <SongRow
                      key={song.id}
                      song={song}
                      enrichingId={enrichingId}
                      candidates={candidates}
                      enrichLoading={enrichLoading}
                      onEnrich={handleEnrich}
                      onApply={handleApply}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 一覧タブ */}
      {tab === 'all' && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-sm text-[#8888aa] text-center py-8">読み込み中...</p>
          ) : grouped.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-[#8888aa]">曲がありません</div>
          ) : (
            grouped.map(({ artist, songs: artistSongs }) => {
              const isCollapsed = collapsedArtists.has(artist.id)
              const linked = artistSongs.filter(s => s.spotify_track_id).length
              return (
                <div key={artist.id} className="glass rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setCollapsedArtists(prev => {
                      const next = new Set(prev)
                      if (next.has(artist.id)) next.delete(artist.id)
                      else next.add(artist.id)
                      return next
                    })}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">{artist.name}</span>
                      <span className="text-xs text-[#8888aa]">{artistSongs.length}曲</span>
                      <span className="text-xs text-green-400/70">{linked}連携済み</span>
                    </div>
                    {isCollapsed ? <ChevronDown size={14} className="text-[#8888aa]" /> : <ChevronUp size={14} className="text-[#8888aa]" />}
                  </button>

                  {!isCollapsed && (
                    <div className="border-t border-white/5 divide-y divide-white/5">
                      {artistSongs.map(song => (
                        <div key={song.id} className="px-4 py-3 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${song.spotify_track_id ? 'bg-green-400/70' : 'bg-white/15'}`} />
                            <p className="text-sm text-white flex-1">{song.name}</p>
                            <span className="text-[10px] text-[#555577]">{song.play_count}回</span>
                          </div>
                          {/* 連携済みプレビュー */}
                          {song.spotify_track_id && (
                            <div className="ml-5 flex items-center gap-3 bg-white/3 rounded-xl px-3 py-2">
                              {song.image_url ? (
                                <img src={song.image_url} alt={song.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-[#1DB954]/10 flex items-center justify-center shrink-0">
                                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#1DB954]" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white truncate">{song.name}</p>
                                <p className="text-[11px] text-[#8888aa] truncate">
                                  {song.spotify_artist_name ?? artist.name}
                                  {song.album_name && ` · ${song.album_name}`}
                                  {song.release_year && ` (${song.release_year})`}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 重複チェックタブ */}
      {tab === 'check' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#8888aa]">
              {dupLoading ? '検索中...' : `${dupGroups.filter(g => !dismissedKeys.has(g.songs.map(s => s.id).sort().join(','))).length}グループ`}
            </p>
            <button
              onClick={loadDupCheck}
              disabled={dupLoading}
              className="flex items-center gap-1.5 text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
            >
              <ScanSearch size={12} />
              再チェック
            </button>
          </div>

          {dupLoading ? (
            <p className="text-sm text-[#8888aa] text-center py-8">検索中...</p>
          ) : dupGroups.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-sm text-[#8888aa]">重複候補が見つかりませんでした</div>
          ) : (
            <div className="space-y-3">
              {dupGroups
                .filter(g => !dismissedKeys.has(g.songs.map(s => s.id).sort().join(',')))
                .map(group => {
                  const key = group.songs.map(s => s.id).sort().join(',')
                  const isMerging = mergingKey === key
                  // canonicalの候補: spotify連携済み優先、次に演奏回数
                  const defaultCanonical = [...group.songs].sort((a, b) => {
                    if (a.spotify_track_id && !b.spotify_track_id) return -1
                    if (!a.spotify_track_id && b.spotify_track_id) return 1
                    return b.play_count - a.play_count
                  })[0]

                  return (
                    <div key={key} className="glass rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#8888aa] uppercase tracking-widest">{group.artist?.name}</span>
                        <button
                          onClick={() => handleDismiss(group)}
                          className="text-[10px] text-[#555577] hover:text-[#8888aa] transition-colors"
                        >
                          別曲として無視
                        </button>
                      </div>
                      <div className="divide-y divide-white/5">
                        {group.songs.map(song => (
                          <div key={song.id} className="px-4 py-3 flex items-center gap-3">
                            {song.image_url ? (
                              <img src={song.image_url} alt={song.name} className="w-8 h-8 rounded object-cover shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded bg-white/5 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white">{song.name}</p>
                              <p className="text-[11px] text-[#8888aa]">
                                {song.play_count}回
                                {song.spotify_track_id && <span className="ml-2 text-green-400/70">Spotify連携済み</span>}
                              </p>
                            </div>
                            {song.id === defaultCanonical.id && (
                              <span className="text-[10px] text-yellow-400/70 shrink-0">canonical</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2.5 border-t border-white/5">
                        <button
                          onClick={() => handleMerge(group, defaultCanonical.id)}
                          disabled={isMerging}
                          className="w-full text-xs bg-white/5 hover:bg-white/10 text-white rounded-xl py-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          <GitMerge size={12} />
                          {isMerging ? '統合中...' : `「${defaultCanonical.name}」に統合`}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SongRow({
  song,
  enrichingId,
  candidates,
  enrichLoading,
  onEnrich,
  onApply,
  onDelete,
}: {
  song: Song
  enrichingId: string | null
  candidates: SpotifyCandidate[]
  enrichLoading: boolean
  onEnrich: (song: Song) => void
  onApply: (song: Song, candidate: SpotifyCandidate) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium truncate">{song.name}</p>
          <p className="text-[11px] text-[#8888aa]">{song.play_count}回演奏</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onEnrich(song)}
            className={`text-xs border px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 ${
              enrichingId === song.id
                ? 'border-white/20 text-white'
                : 'border-white/10 text-[#8888aa] hover:text-white hover:border-white/20'
            }`}
          >
            <Disc3 size={12} />
            Spotify
          </button>
          <button onClick={() => onDelete(song.id)} className="text-[#8888aa] hover:text-red-400 transition-colors p-1">
            <X size={14} />
          </button>
        </div>
      </div>

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
                    onClick={() => onApply(song, c)}
                    className="w-full flex items-center gap-3 text-left hover:bg-white/5 rounded-lg px-2 py-2 transition-colors group"
                  >
                    {c.image_url && (
                      <img src={c.image_url} alt={c.name} className="w-9 h-9 rounded object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.name}</p>
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
  )
}
