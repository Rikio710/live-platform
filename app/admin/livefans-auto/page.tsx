'use client'

import { useState, useEffect } from 'react'
import { Search, RefreshCw, Check, Link as LinkIcon, Loader2, Pencil, Trash2 } from 'lucide-react'
import AdminModal from '@/components/admin/AdminModal'

type LivefansEntry = { livefans_id: number; crawl_page: number; total_pages: number | null; last_crawled_at: string | null }
type Artist = {
  id: string
  name: string
  livefans_ids: LivefansEntry[]
}
type Candidate = { livefans_id: number; name: string }
const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
type MatchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'candidates'; candidates: Candidate[] }
  | { status: 'saved' }
  | { status: 'error'; message: string }

type NewTour = { id: string; name: string; artist_name: string; concerts_added: number; setlists_added: number }

function CrawlResultBox({ result }: { result: { message: string; log?: string[] } }) {
  return (
    <div className="bg-white/5 rounded-xl px-4 py-3 space-y-1.5">
      <p className="text-sm text-white">{result.message}</p>
      {result.log?.map((line, i) => (
        <p key={i} className="text-xs text-[#b3b3b3] font-mono">{line}</p>
      ))}
    </div>
  )
}

export default function LiveFansAutoPage() {
  const [tab, setTab] = useState<'match' | 'crawl'>('crawl')
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [matchStates, setMatchStates] = useState<Record<string, MatchState>>({})
  const [filterMatch, setFilterMatch] = useState<'all' | 'matched' | 'unmatched'>('all')
  const [bulkAutoMatching, setBulkAutoMatching] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/livefans-match')
    if (res.ok) setArtists(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // --- マッチング ---
  const searchOne = async (artist: Artist) => {
    setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'searching' } }))
    try {
      const res = await fetch('/api/admin/livefans-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: artist.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMatchStates(prev => ({
        ...prev,
        [artist.id]: data.candidates?.length
          ? { status: 'candidates', candidates: data.candidates }
          : { status: 'error', message: '候補なし' },
      }))
    } catch (e: any) {
      setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'error', message: e.message } }))
    }
  }

  const saveMatch = async (artistId: string, livefansId: number) => {
    await fetch('/api/admin/livefans-match', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artistId, livefans_id: livefansId }),
    })
    setArtists(prev => prev.map(a => a.id === artistId
      ? { ...a, livefans_ids: [...a.livefans_ids.filter(e => e.livefans_id !== livefansId), { livefans_id: livefansId, crawl_page: 0, total_pages: null, last_crawled_at: null }] }
      : a))
    setMatchStates(prev => ({ ...prev, [artistId]: { status: 'saved' } }))
  }

  const removeMatch = async (artistId: string, livefansId: number) => {
    await fetch('/api/admin/livefans-match', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artistId, livefans_id: livefansId }),
    })
    setArtists(prev => prev.map(a => a.id === artistId
      ? { ...a, livefans_ids: a.livefans_ids.filter(e => e.livefans_id !== livefansId) }
      : a))
  }

  const bulkSearch = async () => {
    const unmatched = artists.filter(a => a.livefans_ids.length === 0)
    for (const artist of unmatched) {
      await searchOne(artist)
      await new Promise(r => setTimeout(r, 500))
    }
  }

  const bulkAutoMatch = async () => {
    setBulkAutoMatching(true)
    const unmatched = artists.filter(a => a.livefans_ids.length === 0)
    for (const artist of unmatched) {
      setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'searching' } }))
      try {
        const res = await fetch('/api/admin/livefans-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: artist.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        const candidates: Candidate[] = data.candidates ?? []

        let autoSelected: Candidate | null = null
        if (candidates.length === 1) {
          autoSelected = candidates[0]
        } else if (candidates.length > 1) {
          const exactMatches = candidates.filter(c => norm(c.name) === norm(artist.name))
          if (exactMatches.length === 1) autoSelected = exactMatches[0]
        }

        if (autoSelected) {
          await fetch('/api/admin/livefans-match', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artist_id: artist.id, livefans_id: autoSelected.livefans_id }),
          })
          setArtists(prev => prev.map(a => a.id === artist.id
          ? { ...a, livefans_ids: [...a.livefans_ids, { livefans_id: autoSelected!.livefans_id, crawl_page: 0, total_pages: null, last_crawled_at: null }] }
          : a))
          setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'saved' } }))
        } else {
          setMatchStates(prev => ({
            ...prev,
            [artist.id]: candidates.length
              ? { status: 'candidates', candidates }
              : { status: 'error', message: '候補なし' },
          }))
        }
      } catch (e: any) {
        setMatchStates(prev => ({ ...prev, [artist.id]: { status: 'error', message: e.message } }))
      }
      await new Promise(r => setTimeout(r, 500))
    }
    setBulkAutoMatching(false)
  }

  // --- 公演データ補完 ---
  const [venueEnriching, setVenueEnriching] = useState(false)
  const [venueEnrichResult, setVenueEnrichResult] = useState<{ message: string; log?: string[] } | null>(null)
  const runVenueEnrich = async () => {
    setVenueEnriching(true)
    setVenueEnrichResult(null)
    try {
      const res = await fetch('/api/admin/livefans-enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'venue' }) })
      const data = await res.json()
      setVenueEnrichResult({ message: data.message ?? JSON.stringify(data), log: data.log })
    } catch {
      setVenueEnrichResult({ message: '失敗しました' })
    } finally {
      setVenueEnriching(false)
    }
  }

  const [setlistEnriching, setSetlistEnriching] = useState(false)
  const [setlistEnrichResult, setSetlistEnrichResult] = useState<{ message: string; log?: string[] } | null>(null)
  const runSetlistEnrich = async () => {
    setSetlistEnriching(true)
    setSetlistEnrichResult(null)
    try {
      const res = await fetch('/api/admin/livefans-enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'setlist' }) })
      const data = await res.json()
      setSetlistEnrichResult({ message: data.message ?? JSON.stringify(data), log: data.log })
    } catch {
      setSetlistEnrichResult({ message: '失敗しました' })
    } finally {
      setSetlistEnriching(false)
    }
  }

  // --- ツアー単位クロール ---
  const [tourCrawling, setTourCrawling] = useState<'past' | 'future' | null>(null)
  const [futureCrawlResult, setFutureCrawlResult] = useState<{ message: string; log?: string[] } | null>(null)
  const [pastCrawlResult, setPastCrawlResult] = useState<{ message: string; log?: string[] } | null>(null)
  const [pastCrawlTours, setPastCrawlTours] = useState<NewTour[]>([])
  const [editingTour, setEditingTour] = useState<NewTour | null>(null)
  const [editTourName, setEditTourName] = useState('')
  const [tourSaving, setTourSaving] = useState(false)

  const runTourCrawl = async (mode: 'past' | 'future') => {
    setTourCrawling(mode)
    if (mode === 'future') setFutureCrawlResult(null)
    else { setPastCrawlResult(null); setPastCrawlTours([]) }
    try {
      const res = await fetch('/api/admin/livefans-tour-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json()
      const result = { message: data.message ?? JSON.stringify(data), log: data.log }
      if (mode === 'future') setFutureCrawlResult(result)
      else {
        setPastCrawlResult(result)
        if (data.new_tours?.length) setPastCrawlTours(data.new_tours)
      }
    } catch {
      const result = { message: 'クロールに失敗しました' }
      if (mode === 'future') setFutureCrawlResult(result)
      else setPastCrawlResult(result)
    } finally {
      setTourCrawling(null)
    }
  }

  const openEditTour = (t: NewTour) => { setEditingTour(t); setEditTourName(t.name) }
  const saveTourName = async () => {
    if (!editingTour) return
    setTourSaving(true)
    try {
      const res = await fetch(`/api/admin/tours/${editingTour.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editTourName }),
      })
      if (res.ok) {
        setPastCrawlTours(prev => prev.map(t => t.id === editingTour.id ? { ...t, name: editTourName } : t))
        setEditingTour(null)
      }
    } finally {
      setTourSaving(false)
    }
  }

  const deleteTour = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？関連する公演も全て削除されます。`)) return
    const res = await fetch(`/api/admin/tours/${id}`, { method: 'DELETE' })
    if (res.ok) setPastCrawlTours(prev => prev.filter(t => t.id !== id))
    else alert('削除に失敗しました')
  }

  const filteredArtists = artists.filter(a =>
    filterMatch === 'all' ? true :
    filterMatch === 'matched' ? a.livefans_ids.length > 0 :
    a.livefans_ids.length === 0
  )

  const matchedCount = artists.filter(a => a.livefans_ids.length > 0).length
  const cls = 'bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30'

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-black text-white">LiveFans 自動取込</h1>
        <p className="text-sm text-[#8888aa] mt-0.5">
          アーティストとLiveFansを紐付け、定期クロールで新着公演を自動発見します
        </p>
      </div>

      {/* タブ */}
      <div className="flex border border-white/10 rounded-xl p-1 bg-white/2 w-fit">
        {([['crawl', 'クロール'], ['match', 'アーティスト紐付け']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : tab === 'match' ? (
        // ===== アーティスト紐付けタブ =====
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#8888aa]">
                <span className="text-white font-bold">{matchedCount}</span> / {artists.length} 件紐付け済み
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={bulkAutoMatch} disabled={bulkAutoMatching}
                  className="flex items-center gap-1.5 text-xs bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold px-3 py-1.5 rounded-full transition-colors">
                  {bulkAutoMatching ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {bulkAutoMatching ? '自動マッチ中...' : '一括自動マッチ'}
                </button>
                <button onClick={bulkSearch} disabled={bulkAutoMatching}
                  className="flex items-center gap-1.5 text-xs border border-white/10 text-[#8888aa] hover:text-white disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors">
                  <Search size={12} /> 一括検索
                </button>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'matched', 'unmatched'] as const).map(f => (
                <button key={f} onClick={() => setFilterMatch(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterMatch === f ? 'bg-white text-black border-white' : 'border-white/10 text-[#8888aa] hover:text-white'}`}>
                  {f === 'all' ? '全て' : f === 'matched' ? '紐付け済み' : '未紐付け'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredArtists.map(artist => {
              const state = matchStates[artist.id] ?? { status: 'idle' }
              return (
                <div key={artist.id} className="glass rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{artist.name}</p>
                      {artist.livefans_ids.length > 0 ? (
                        <div className="mt-0.5 space-y-0.5">
                          {artist.livefans_ids.map(entry => (
                            <div key={entry.livefans_id} className="flex items-center gap-2">
                              <a href={`https://www.livefans.jp/artists/${entry.livefans_id}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs text-[#b3b3b3] hover:text-white flex items-center gap-1 w-fit transition-colors">
                                <LinkIcon size={10} /> livefans.jp/artists/{entry.livefans_id}
                              </a>
                              <button onClick={() => removeMatch(artist.id, entry.livefans_id)}
                                className="text-[10px] border border-red-500/20 text-red-400 hover:bg-red-500/10 px-1.5 py-0.5 rounded-full transition-colors shrink-0">
                                解除
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#8888aa] mt-0.5">未紐付け</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* 解除ボタンは各IDの横に移動 */}
                      <button onClick={() => searchOne(artist)}
                        disabled={state.status === 'searching'}
                        className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1">
                        {state.status === 'searching' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                        {state.status === 'searching' ? '検索中...' : '検索'}
                      </button>
                    </div>
                  </div>

                  {state.status === 'candidates' && (
                    <div className="space-y-1.5 pt-1 border-t border-white/5">
                      <p className="text-xs text-[#8888aa]">候補 {state.candidates.length}件 — 正しいものを選んでください</p>
                      {state.candidates.map(c => (
                        <div key={c.livefans_id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-sm text-white">{c.name}</p>
                            <p className="text-xs text-[#8888aa]">ID: {c.livefans_id}</p>
                          </div>
                          <button onClick={() => saveMatch(artist.id, c.livefans_id)}
                            className="text-xs bg-white hover:bg-[#e0e0e0] text-black font-bold px-3 py-1.5 rounded-full transition-colors">
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
        </div>
      ) : (
        // ===== クロール & 補完タブ =====
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* 左カラム: アクション */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* 今後 / 過去 クロール */}
            <div className="glass rounded-2xl divide-y divide-white/5">
              {/* 今後 */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm">今後の公演クロール</p>
                    <p className="text-xs text-[#8888aa] mt-0.5">新着公演を取得（毎朝9時自動実行）</p>
                  </div>
                  <button onClick={() => runTourCrawl('future')} disabled={tourCrawling !== null || matchedCount === 0}
                    className="flex items-center gap-1.5 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-xs px-4 py-2 rounded-full transition-colors shrink-0">
                    {tourCrawling === 'future' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {tourCrawling === 'future' ? '実行中...' : '実行'}
                  </button>
                </div>
                {futureCrawlResult && (
                  <CrawlResultBox result={futureCrawlResult} />
                )}
              </div>

              {/* 過去 */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm">過去の公演クロール</p>
                    <p className="text-xs text-[#8888aa] mt-0.5">バックフィル（完了済みはスキップ）</p>
                  </div>
                  <button onClick={() => runTourCrawl('past')} disabled={tourCrawling !== null || matchedCount === 0}
                    className="flex items-center gap-1.5 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-xs px-4 py-2 rounded-full transition-colors shrink-0">
                    {tourCrawling === 'past' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {tourCrawling === 'past' ? '実行中...' : '実行'}
                  </button>
                </div>
                {pastCrawlResult && (
                  <CrawlResultBox result={pastCrawlResult} />
                )}
              </div>
            </div>

            {/* 登録されたツアー */}
            {pastCrawlTours.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-[#8888aa] font-bold uppercase tracking-wider px-1">登録されたツアー（{pastCrawlTours.length}件）</p>
                {pastCrawlTours.map(t => (
                  <div key={t.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{t.name}</p>
                      <p className="text-xs text-[#8888aa] mt-0.5">
                        {t.artist_name}
                        {t.concerts_added > 0 && <span className="ml-2">· 公演 {t.concerts_added}件</span>}
                        {t.setlists_added > 0 && <span className="ml-1">· セトリ {t.setlists_added}件</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openEditTour(t)}
                        className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-2.5 py-1.5 rounded-full transition-colors flex items-center gap-1">
                        <Pencil size={11} /> 編集
                      </button>
                      <button onClick={() => deleteTour(t.id, t.name)}
                        className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-full transition-colors flex items-center gap-1">
                        <Trash2 size={11} /> 削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 補完 */}
            <div className="glass rounded-2xl divide-y divide-white/5">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm">会場・時刻補完</p>
                    <p className="text-xs text-[#8888aa] mt-0.5">会場「未定」・時刻なしを補完（8件ずつ）</p>
                  </div>
                  <button onClick={runVenueEnrich} disabled={venueEnriching}
                    className="flex items-center gap-1.5 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-xs px-4 py-2 rounded-full transition-colors shrink-0">
                    {venueEnriching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {venueEnriching ? '実行中...' : '実行'}
                  </button>
                </div>
                {venueEnrichResult && <CrawlResultBox result={venueEnrichResult} />}
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm">セトリ補完</p>
                    <p className="text-xs text-[#8888aa] mt-0.5">未登録セトリをLiveFansから取得（8件ずつ）</p>
                  </div>
                  <button onClick={runSetlistEnrich} disabled={setlistEnriching}
                    className="flex items-center gap-1.5 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-xs px-4 py-2 rounded-full transition-colors shrink-0">
                    {setlistEnriching ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {setlistEnriching ? '実行中...' : '実行'}
                  </button>
                </div>
                {setlistEnrichResult && <CrawlResultBox result={setlistEnrichResult} />}
              </div>
            </div>

          </div>

          {/* 右カラム: アーティスト別状況 */}
          {(() => {
            const linked = artists.filter(a => a.livefans_ids.length > 0)
            if (!linked.length) return null
            const getLastCrawled = (a: Artist) =>
              a.livefans_ids.reduce<string | null>((latest, e) => {
                if (!e.last_crawled_at) return latest
                if (!latest) return e.last_crawled_at
                return e.last_crawled_at > latest ? e.last_crawled_at : latest
              }, null)
            const isDone = (a: Artist) =>
              a.livefans_ids.every(e => e.total_pages != null && e.crawl_page >= e.total_pages)
            const sorted = [...linked].sort((a, b) => {
              const aD = getLastCrawled(a) ? new Date(getLastCrawled(a)!).getTime() : 0
              const bD = getLastCrawled(b) ? new Date(getLastCrawled(b)!).getTime() : 0
              return aD - bD
            })
            const doneCount = sorted.filter(isDone).length
            return (
              <div className="w-full lg:w-56 lg:shrink-0 glass rounded-2xl p-4 space-y-3 lg:sticky lg:top-4">
                <div>
                  <p className="text-xs font-bold text-white">クロール状況</p>
                  <p className="text-xs text-[#8888aa] mt-0.5">{doneCount}/{linked.length} 完了</p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-0.5">
                  {sorted.map(a => {
                    const done = isDone(a)
                    const lastCrawled = getLastCrawled(a)
                    const allPages = a.livefans_ids.map(e => ({ page: e.crawl_page ?? 0, total: e.total_pages }))
                    const pageLabel = allPages.length === 1
                      ? (allPages[0].total != null ? `${allPages[0].page}/${allPages[0].total}` : allPages[0].page > 0 ? `${allPages[0].page}/?` : '—')
                      : `${allPages.length}ID`
                    return (
                      <div key={a.id} className={`flex items-center gap-2 px-1.5 py-1.5 rounded-lg ${done ? 'opacity-35' : ''}`}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${done ? 'bg-green-500' : lastCrawled ? 'bg-yellow-400' : 'bg-[#444466]'}`} />
                        <p className="text-xs text-white flex-1 truncate">{a.name}</p>
                        <p className="text-xs font-mono shrink-0 text-[#8888aa]">{pageLabel}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

        </div>
      )}

      {editingTour && (
        <AdminModal title="ツアー名を編集" onClose={() => setEditingTour(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">ツアー名</label>
              <input
                type="text"
                value={editTourName}
                onChange={e => setEditTourName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingTour(null)}
                className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                キャンセル
              </button>
              <button onClick={saveTourName} disabled={tourSaving || !editTourName.trim()}
                className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {tourSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
