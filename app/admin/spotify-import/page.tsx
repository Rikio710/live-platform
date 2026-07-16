'use client'

import { useState, useEffect } from 'react'
import { Music2, Search, Check, X, Download, Loader2, RefreshCw, CheckSquare, Square } from 'lucide-react'

type DBartist = { id: string; name: string; image_url: string | null; spotify_id: string | null }
type Candidate = { spotifyId: string; name: string; popularity: number; imageUrl: string | null; genres: string[] }

type MatchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'candidates'; candidates: Candidate[] }
  | { status: 'saved' }
  | { status: 'error'; message: string }

export default function SpotifyImportPage() {
  const [tab, setTab] = useState<'link' | 'discover'>('link')

  // 紐付けタブ
  const [artists, setArtists] = useState<DBartist[]>([])
  const [loadingArtists, setLoadingArtists] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [matchStates, setMatchStates] = useState<Record<string, MatchState>>({})
  const [filterLink, setFilterLink] = useState<'all' | 'linked' | 'unlinked'>('all')

  // 新規取込タブ
  const [discovering, setDiscovering] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editedNames, setEditedNames] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [discoverError, setDiscoverError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/spotify-artists')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setArtists(data)
        } else {
          setLoadError(data?.error ?? 'アーティスト一覧の取得に失敗しました')
        }
        setLoadingArtists(false)
      })
      .catch(() => { setLoadError('通信エラーが発生しました'); setLoadingArtists(false) })
  }, [])

  // --- 紐付け ---
  const searchOne = async (artist: DBartist) => {
    setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'searching' } }))
    try {
      const res = await fetch('/api/admin/spotify-artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', name: artist.name }),
      })
      const data = await res.json()
      setMatchStates(prev => ({
        ...prev,
        [artist.id]: data.candidates?.length
          ? { status: 'candidates', candidates: data.candidates }
          : { status: 'error', message: '候補なし' },
      }))
    } catch {
      setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'error', message: '検索失敗' } }))
    }
  }

  const saveLink = async (artistId: string, candidate: Candidate | null) => {
    await fetch('/api/admin/spotify-artists', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artist_id: artistId,
        spotify_id: candidate?.spotifyId ?? null,
        image_url: candidate?.imageUrl ?? null,
      }),
    })
    setArtists(prev => prev.map(a =>
      a.id === artistId
        ? { ...a, spotify_id: candidate?.spotifyId ?? null, image_url: candidate?.imageUrl ?? a.image_url }
        : a
    ))
    setMatchStates(prev => ({ ...prev, [artistId]: { status: 'saved' } }))
  }

  const bulkSearch = async () => {
    const unlinked = artists.filter(a => !a.spotify_id)
    for (const artist of unlinked) {
      await searchOne(artist)
      await new Promise(r => setTimeout(r, 400))
    }
  }

  // --- 新規取込 ---
  const discover = async () => {
    setDiscovering(true)
    setDiscoverError(null)
    setCandidates([])
    setSelected(new Set())
    setEditedNames({})
    setImportResult(null)
    try {
      const res = await fetch('/api/admin/spotify-artists', { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCandidates(data)
      setSelected(new Set(data.map((c: Candidate) => c.spotifyId)))
      if (data.length === 0) setDiscoverError('新規アーティストが見つかりませんでした')
    } catch (e: any) {
      setDiscoverError(e.message ?? '取得失敗')
    } finally {
      setDiscovering(false)
    }
  }

  const toggleAll = () => {
    setSelected(prev => prev.size === candidates.length ? new Set() : new Set(candidates.map(c => c.spotifyId)))
  }

  const handleImport = async () => {
    const targets = candidates.filter(c => selected.has(c.spotifyId)).map(c => ({
      ...c,
      name: editedNames[c.spotifyId] ?? c.name,
    }))
    if (!targets.length) return
    setImporting(true)
    try {
      const res = await fetch('/api/admin/spotify-artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', artists: targets }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportResult(`${data.inserted}件のアーティストを登録しました`)
      setCandidates(prev => prev.filter(c => !selected.has(c.spotifyId)))
      setSelected(new Set())
    } catch (e: any) {
      setDiscoverError(e.message ?? '登録失敗')
    } finally {
      setImporting(false)
    }
  }

  const linkedCount = artists.filter(a => !!a.spotify_id).length
  const filteredArtists = artists.filter(a =>
    filterLink === 'all' ? true : filterLink === 'linked' ? !!a.spotify_id : !a.spotify_id
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-black text-white">Spotify連携</h1>
        <p className="text-sm text-[#8888aa] mt-0.5">アーティストの紐付けと新規取込</p>
      </div>

      <div className="flex border border-white/10 rounded-xl p-1 bg-white/2 w-fit">
        {([['link', 'Spotify紐付け'], ['discover', '新規アーティスト取込']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'link' ? (
        // ===== 紐付けタブ =====
        <div className="space-y-4">
          {loadingArtists ? (
            <p className="text-sm text-[#8888aa]">読み込み中...</p>
          ) : loadError ? (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{loadError}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-[#8888aa]">
                  <span className="text-white font-bold">{linkedCount}</span> / {artists.length} 件紐付け済み
                </p>
                <div className="flex gap-2">
                  {(['all', 'linked', 'unlinked'] as const).map(f => (
                    <button key={f} onClick={() => setFilterLink(f)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterLink === f ? 'bg-white text-black border-white' : 'border-white/10 text-[#8888aa] hover:text-white'}`}>
                      {f === 'all' ? '全て' : f === 'linked' ? '紐付け済み' : '未紐付け'}
                    </button>
                  ))}
                </div>
                <button onClick={bulkSearch}
                  className="ml-auto flex items-center gap-1.5 text-xs border border-white/10 text-[#8888aa] hover:text-white px-3 py-1.5 rounded-full transition-colors">
                  <Search size={12} /> 未紐付けを一括検索
                </button>
              </div>

              <div className="space-y-2">
                {filteredArtists.map(artist => {
                  const state = matchStates[artist.id] ?? { status: 'idle' }
                  return (
                    <div key={artist.id} className="glass rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-3">
                        {artist.image_url
                          ? <img src={artist.image_url} alt={artist.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                          : <div className="w-9 h-9 rounded-full bg-[#333] flex items-center justify-center shrink-0"><Music2 size={14} className="text-[#8888aa]" /></div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white">{artist.name}</p>
                          <p className="text-xs text-[#8888aa] mt-0.5">
                            {artist.spotify_id ? `Spotify ID: ${artist.spotify_id}` : '未紐付け'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {artist.spotify_id && (
                            <button onClick={() => saveLink(artist.id, null)}
                              className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-full transition-colors">
                              解除
                            </button>
                          )}
                          <button onClick={() => searchOne(artist)} disabled={state.status === 'searching'}
                            className="flex items-center gap-1 text-xs border border-white/10 text-[#8888aa] hover:text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-50">
                            {state.status === 'searching' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                            {state.status === 'searching' ? '検索中...' : '検索'}
                          </button>
                        </div>
                      </div>

                      {state.status === 'candidates' && (
                        <div className="space-y-1.5 pt-1 border-t border-white/5">
                          <p className="text-xs text-[#8888aa]">候補 {state.candidates.length}件 — 正しいものを選んでください</p>
                          {state.candidates.map(c => (
                            <div key={c.spotifyId} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                              {c.imageUrl
                                ? <img src={c.imageUrl} alt={c.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                : <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center shrink-0"><Music2 size={12} className="text-[#8888aa]" /></div>
                              }
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white">{c.name}</p>
                                <p className="text-xs text-[#8888aa]">人気度 {c.popularity} · {(c.genres ?? []).slice(0, 2).join(', ')}</p>
                              </div>
                              <button onClick={() => saveLink(artist.id, c)}
                                className="text-xs bg-white hover:bg-[#e0e0e0] text-black font-bold px-3 py-1.5 rounded-full transition-colors shrink-0">
                                選択
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {state.status === 'saved' && (
                        <p className="text-xs text-green-400 flex items-center gap-1"><Check size={12} /> 保存しました</p>
                      )}
                      {state.status === 'error' && (
                        <p className="text-xs text-[#8888aa]">{state.message}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        // ===== 新規アーティスト取込タブ =====
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-[#8888aa]">
              紐付け済みアーティストをもとにSpotifyから未登録アーティストを発見します
            </p>
            <button onClick={discover} disabled={discovering}
              className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-5 py-2.5 rounded-full transition-colors shrink-0">
              {discovering ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {discovering ? '取得中...' : '新規を取得'}
            </button>
          </div>

          {discoverError && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{discoverError}</p>}
          {importResult && <p className="text-sm text-green-400 bg-green-500/10 rounded-xl px-4 py-3">{importResult}</p>}

          {candidates.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-[#8888aa] hover:text-white transition-colors">
                  {selected.size === candidates.length ? <CheckSquare size={16} className="text-[#b3b3b3]" /> : <Square size={16} />}
                  全選択 / 全解除
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#8888aa]">{selected.size}件選択中</span>
                  <button onClick={handleImport} disabled={importing || selected.size === 0}
                    className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
                    <Download size={14} />
                    {importing ? '登録中...' : `${selected.size}件を登録`}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {candidates.map(c => (
                  <div key={c.spotifyId} onClick={() => setSelected(prev => {
                    const next = new Set(prev)
                    next.has(c.spotifyId) ? next.delete(c.spotifyId) : next.add(c.spotifyId)
                    return next
                  })}
                    className={`glass rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer transition-colors ${selected.has(c.spotifyId) ? 'border-white/20' : 'opacity-50'}`}>
                    {selected.has(c.spotifyId) ? <CheckSquare size={16} className="text-[#b3b3b3] shrink-0" /> : <Square size={16} className="text-[#8888aa] shrink-0" />}
                    {c.imageUrl
                      ? <img src={c.imageUrl} alt={c.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-[#333] flex items-center justify-center shrink-0"><Music2 size={16} className="text-[#b3b3b3]" /></div>
                    }
                    <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editedNames[c.spotifyId] ?? c.name}
                        onChange={e => setEditedNames(prev => ({ ...prev, [c.spotifyId]: e.target.value }))}
                        className="bg-transparent text-white font-bold text-sm w-full outline-none border-b border-transparent focus:border-white/30 transition-colors"
                      />
                      {(c.genres ?? []).length > 0 && <p className="text-xs text-[#8888aa] truncate">{(c.genres ?? []).slice(0, 3).join(', ')}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[#8888aa]">人気度</p>
                      <p className="text-sm font-bold text-[#b3b3b3]">{c.popularity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!discovering && candidates.length === 0 && !discoverError && (
            <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
              「新規を取得」ボタンを押してください
            </div>
          )}
        </div>
      )}
    </div>
  )
}
