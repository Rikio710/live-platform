'use client'

import { useState, useEffect } from 'react'
import { Search, RefreshCw, Check, X, Link as LinkIcon, Loader2, Pencil, Trash2 } from 'lucide-react'
import AdminModal from '@/components/admin/AdminModal'

type Artist = { id: string; name: string; livefans_id: number | null }
type Candidate = { livefans_id: number; name: string }
type QueueItem = {
  id: string
  artist_id: string
  livefans_event_id: number | null
  event_name: string | null
  event_date: string
  venue_name: string | null
  status: string
  artists: { id: string; name: string; image_url: string | null } | null
}

type MatchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'candidates'; candidates: Candidate[] }
  | { status: 'saved' }
  | { status: 'error'; message: string }

type FullCrawlResult = {
  concerts_added: number
  setlists_added: number
  tours_added: number
  total_found: number
  message: string
}

type NewTour = { id: string; name: string; artist_name: string; concerts_added: number; setlists_added: number }

export default function LiveFansAutoPage() {
  const [tab, setTab] = useState<'match' | 'crawl' | 'full'>('match')
  const [artists, setArtists] = useState<Artist[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [matchStates, setMatchStates] = useState<Record<string, MatchState>>({})
  const [crawlResult, setCrawlResult] = useState<string | null>(null)
  const [crawling, setCrawling] = useState(false)
  const [filterMatch, setFilterMatch] = useState<'all' | 'matched' | 'unmatched'>('all')
  const [approving, setApproving] = useState<Set<string>>(new Set())

  // フル取込
  const [fullArtistId, setFullArtistId] = useState('')
  const [fullMaxEvents, setFullMaxEvents] = useState(10)
  const [fullCrawling, setFullCrawling] = useState(false)
  const [fullResult, setFullResult] = useState<FullCrawlResult | null>(null)

  // approve フォーム（ツアー・会場補完用）
  const [approveForm, setApproveForm] = useState<Record<string, {
    venue_name: string; venue_address: string; start_time: string; tour_id: string; festival_event_id: string; stage_name: string; _open?: boolean
  }>>({})

  const load = async () => {
    setLoading(true)
    const [artRes, qRes] = await Promise.all([
      fetch('/api/admin/livefans-match'),
      fetch('/api/admin/crawl-queue'),
    ])
    if (artRes.ok) setArtists(await artRes.json())
    if (qRes.ok) setQueue(await qRes.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const initApproveForm = (item: QueueItem) => {
    if (approveForm[item.id]) return
    setApproveForm(prev => ({
      ...prev,
      [item.id]: {
        venue_name: item.venue_name ?? '',
        venue_address: '',
        start_time: '',
        tour_id: '',
        festival_event_id: '',
        stage_name: '',
      },
    }))
  }

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

  const saveMatch = async (artistId: string, livefansId: number | null) => {
    await fetch('/api/admin/livefans-match', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist_id: artistId, livefans_id: livefansId }),
    })
    setArtists(prev => prev.map(a => a.id === artistId ? { ...a, livefans_id: livefansId } : a))
    setMatchStates(prev => ({ ...prev, [artistId]: { status: 'saved' } }))
  }

  const bulkSearch = async () => {
    const unmatched = artists.filter(a => !a.livefans_id)
    for (const artist of unmatched) {
      await searchOne(artist)
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // --- クロール ---
  const runCrawl = async () => {
    setCrawling(true)
    setCrawlResult(null)
    try {
      const res = await fetch('/api/admin/livefans-crawl', { method: 'POST' })
      const data = await res.json()
      setCrawlResult(data.message ?? JSON.stringify(data))
      const qRes = await fetch('/api/admin/crawl-queue')
      if (qRes.ok) setQueue(await qRes.json())
    } catch {
      setCrawlResult('クロールに失敗しました')
    } finally {
      setCrawling(false)
    }
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

  // --- キュー操作 ---
  const approve = async (item: QueueItem) => {
    const form = approveForm[item.id]
    if (!form) return
    setApproving(prev => new Set(prev).add(item.id))
    try {
      const res = await fetch('/api/admin/crawl-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          action: 'approve',
          concert_data: {
            artist_id: item.artist_id,
            venue_name: form.venue_name || item.venue_name || '',
            venue_address: form.venue_address || null,
            date: item.event_date,
            start_time: form.start_time || null,
            tour_id: form.tour_id || null,
            festival_event_id: form.festival_event_id || null,
            stage_name: form.stage_name || null,
          },
        }),
      })
      if (res.ok) setQueue(prev => prev.filter(q => q.id !== item.id))
      else alert('取込に失敗しました')
    } finally {
      setApproving(prev => { const s = new Set(prev); s.delete(item.id); return s })
    }
  }

  const reject = async (id: string) => {
    await fetch('/api/admin/crawl-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'reject' }),
    })
    setQueue(prev => prev.filter(q => q.id !== id))
  }

  // --- フル取込 ---
  const runFullCrawl = async () => {
    if (!fullArtistId) return
    setFullCrawling(true)
    setFullResult(null)
    try {
      const res = await fetch('/api/admin/livefans-full-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: fullArtistId, max_events: fullMaxEvents }),
      })
      const data = await res.json()
      setFullResult(data)
    } catch {
      setFullResult({ concerts_added: 0, setlists_added: 0, tours_added: 0, total_found: 0, message: '取込に失敗しました' })
    } finally {
      setFullCrawling(false)
    }
  }

  const filteredArtists = artists.filter(a =>
    filterMatch === 'all' ? true :
    filterMatch === 'matched' ? !!a.livefans_id :
    !a.livefans_id
  )

  const matchedCount = artists.filter(a => !!a.livefans_id).length
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
        {([['match', 'アーティスト紐付け'], ['crawl', 'クロール & 取込キュー'], ['full', 'フル取込']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === key ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`}>
            {label}
            {key === 'crawl' && queue.length > 0 && (
              <span className="ml-2 bg-white text-black text-xs rounded-full px-1.5 py-0.5 font-black">{queue.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : tab === 'full' ? (
        // ===== フル取込タブ =====
        <div className="space-y-5 max-w-xl">
          <div className="glass rounded-2xl p-5 space-y-4">
            <div>
              <p className="font-bold text-white">フル取込</p>
              <p className="text-xs text-[#8888aa] mt-0.5">
                アーティストの公演一覧ページを巡回し、ツアー・公演・セトリを一括で直接登録します。
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">アーティスト（livefans_id 紐付け済みのみ）</label>
                <select value={fullArtistId} onChange={e => setFullArtistId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30">
                  <option value="">選択してください</option>
                  {artists.filter(a => !!a.livefans_id).map(a => (
                    <option key={a.id} value={a.id}>{a.name} (ID: {a.livefans_id})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">最大取込件数（1回の実行あたり）</label>
                <input
                  type="number" min={1} max={30} value={fullMaxEvents}
                  onChange={e => setFullMaxEvents(Math.min(30, Math.max(1, parseInt(e.target.value) || 10)))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-24 focus:outline-none focus:border-white/30"
                />
                <p className="text-xs text-[#8888aa] mt-1">多いほどタイムアウトのリスクが上がります。最初は10件推奨。</p>
              </div>
            </div>

            <button onClick={runFullCrawl} disabled={fullCrawling || !fullArtistId}
              className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-6 py-2.5 rounded-full transition-colors">
              {fullCrawling ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {fullCrawling ? '取込中...' : '取込開始'}
            </button>

            {fullResult && (
              <div className="border-t border-white/5 pt-4 space-y-2">
                <p className="text-sm text-white">{fullResult.message}</p>
                {fullResult.concerts_added > 0 && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: '公演', value: fullResult.concerts_added },
                      { label: 'ツアー', value: fullResult.tours_added },
                      { label: 'セトリ', value: fullResult.setlists_added },
                    ].map(s => (
                      <div key={s.label} className="bg-white/5 rounded-xl py-3">
                        <p className="text-2xl font-black text-white">{s.value}</p>
                        <p className="text-xs text-[#8888aa]">{s.label}追加</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-[#8888aa] font-bold mb-2 uppercase tracking-wider">フロー</p>
            <ol className="text-xs text-[#8888aa] space-y-1 list-decimal list-inside">
              <li>livefans.jp の公演検索ページ（過去・未来）を最大4ページ巡回</li>
              <li>既にDBに登録済みの公演（livefans_event_id で照合）をスキップ</li>
              <li>各公演ページを取得 → ツアーリンクとセトリを抽出</li>
              <li>ツアーが未登録なら自動作成（livefans_group_id で重複防止）</li>
              <li>公演・セトリを直接DBに登録</li>
            </ol>
          </div>
        </div>
      ) : tab === 'match' ? (
        // ===== アーティスト紐付けタブ =====
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm text-[#8888aa]">
              <span className="text-white font-bold">{matchedCount}</span> / {artists.length} 件紐付け済み
            </p>
            <div className="flex gap-2">
              {(['all', 'matched', 'unmatched'] as const).map(f => (
                <button key={f} onClick={() => setFilterMatch(f)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterMatch === f ? 'bg-white text-black border-white' : 'border-white/10 text-[#8888aa] hover:text-white'}`}>
                  {f === 'all' ? '全て' : f === 'matched' ? '紐付け済み' : '未紐付け'}
                </button>
              ))}
            </div>
            <button onClick={bulkSearch}
              className="flex items-center gap-1.5 text-xs border border-white/10 text-[#8888aa] hover:text-white px-3 py-1.5 rounded-full transition-colors ml-auto">
              <Search size={12} /> 未紐付けを一括検索
            </button>
          </div>

          <div className="space-y-2">
            {filteredArtists.map(artist => {
              const state = matchStates[artist.id] ?? { status: 'idle' }
              return (
                <div key={artist.id} className="glass rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{artist.name}</p>
                      {artist.livefans_id ? (
                        <a href={`https://www.livefans.jp/artists/${artist.livefans_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-xs text-[#b3b3b3] hover:text-white flex items-center gap-1 mt-0.5 w-fit transition-colors">
                          <LinkIcon size={10} /> livefans.jp/artists/{artist.livefans_id}
                        </a>
                      ) : (
                        <p className="text-xs text-[#8888aa] mt-0.5">未紐付け</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {artist.livefans_id && (
                        <button onClick={() => saveMatch(artist.id, null)}
                          className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-full transition-colors">
                          解除
                        </button>
                      )}
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
        // ===== クロール & 取込キュータブ =====
        <div className="space-y-6">
          {/* 今後の公演クロール */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">今後の公演クロール</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  これから開催される公演を取得します（毎朝9時に自動実行）
                </p>
              </div>
              <button onClick={() => runTourCrawl('future')} disabled={tourCrawling !== null || matchedCount === 0}
                className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-5 py-2.5 rounded-full transition-colors shrink-0">
                {tourCrawling === 'future' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {tourCrawling === 'future' ? 'クロール中...' : 'クロール実行'}
              </button>
            </div>
            {futureCrawlResult && (
              <div className="bg-white/5 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-white">{futureCrawlResult.message}</p>
                {futureCrawlResult.log?.map((line, i) => (
                  <p key={i} className="text-xs text-[#b3b3b3] font-mono">{line}</p>
                ))}
              </div>
            )}
          </div>

          {/* 過去の公演クロール */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">過去の公演クロール</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  過去公演をバックフィルします。前回の続きから進みます。
                </p>
              </div>
              <button onClick={() => runTourCrawl('past')} disabled={tourCrawling !== null || matchedCount === 0}
                className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-5 py-2.5 rounded-full transition-colors shrink-0">
                {tourCrawling === 'past' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {tourCrawling === 'past' ? 'クロール中...' : 'クロール実行'}
              </button>
            </div>
            {pastCrawlResult && (
              <div className="bg-white/5 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-white">{pastCrawlResult.message}</p>
                {pastCrawlResult.log?.map((line, i) => (
                  <p key={i} className="text-xs text-[#b3b3b3] font-mono">{line}</p>
                ))}
              </div>
            )}
          </div>

          {/* 登録されたツアー */}
          {pastCrawlTours.length > 0 && (
            <div className="space-y-3">
              <p className="font-bold text-white">登録されたツアー <span className="text-[#8888aa] font-normal text-sm">({pastCrawlTours.length}件)</span></p>
              <div className="space-y-2">
                {pastCrawlTours.map(t => (
                  <div key={t.id} className="glass rounded-xl px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate">{t.name}</p>
                      <p className="text-xs text-[#8888aa] mt-0.5">
                        {t.artist_name}
                        {t.concerts_added > 0 && <span className="ml-2">· 公演 {t.concerts_added}件</span>}
                        {t.setlists_added > 0 && <span className="ml-1">· セトリ {t.setlists_added}件</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openEditTour(t)}
                        className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                        <Pencil size={11} /> 編集
                      </button>
                      <button onClick={() => deleteTour(t.id, t.name)}
                        className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                        <Trash2 size={11} /> 削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 会場・時刻補完 */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">会場・時刻補完</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  会場が「未定」または開演時刻がない公演を補完します。全公演が対象（8件ずつ）。
                </p>
              </div>
              <button onClick={runVenueEnrich} disabled={venueEnriching}
                className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-5 py-2.5 rounded-full transition-colors shrink-0">
                {venueEnriching ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {venueEnriching ? '補完中...' : '補完実行'}
              </button>
            </div>
            {venueEnrichResult && (
              <div className="bg-white/5 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-white">{venueEnrichResult.message}</p>
                {venueEnrichResult.log?.map((line, i) => (
                  <p key={i} className="text-xs text-[#b3b3b3] font-mono">{line}</p>
                ))}
              </div>
            )}
          </div>

          {/* セトリ補完 */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">セトリ補完</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  セトリが未登録の公演にLiveFansから取得して登録します。過去の公演のみ対象（8件ずつ）。
                </p>
              </div>
              <button onClick={runSetlistEnrich} disabled={setlistEnriching}
                className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-5 py-2.5 rounded-full transition-colors shrink-0">
                {setlistEnriching ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {setlistEnriching ? '補完中...' : '補完実行'}
              </button>
            </div>
            {setlistEnrichResult && (
              <div className="bg-white/5 rounded-xl px-4 py-3 space-y-2">
                <p className="text-sm text-white">{setlistEnrichResult.message}</p>
                {setlistEnrichResult.log?.map((line, i) => (
                  <p key={i} className="text-xs text-[#b3b3b3] font-mono">{line}</p>
                ))}
              </div>
            )}
          </div>

          {/* 旧クロール（キュー方式） */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">旧クロール（キュー方式）</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  新着公演を発見してキューに積みます。1件ずつ確認して手動で取込できます。
                </p>
              </div>
              <button onClick={runCrawl} disabled={crawling || matchedCount === 0}
                className="flex items-center gap-2 border border-white/10 hover:border-white/20 disabled:opacity-50 text-white font-bold text-sm px-5 py-2.5 rounded-full transition-colors shrink-0">
                {crawling ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {crawling ? 'クロール中...' : 'クロール実行'}
              </button>
            </div>
            {crawlResult && (
              <p className="text-sm text-white bg-white/5 rounded-xl px-4 py-3">{crawlResult}</p>
            )}
          </div>

          {/* 取込キュー */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">取込キュー <span className="text-[#8888aa] font-normal text-sm">({queue.length}件)</span></p>
              {queue.length > 0 && (
                <button onClick={() => fetch('/api/admin/crawl-queue', { method: 'DELETE' }).then(() => load())}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-3 py-1.5 rounded-full transition-colors">
                  処理済みを削除
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center text-[#8888aa] text-sm">
                キューに取込待ちの公演はありません
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map(item => {
                  const form = approveForm[item.id]
                  const isApproving = approving.has(item.id)
                  return (
                    <div key={item.id} className="glass rounded-xl overflow-hidden">
                      <div className="flex items-start gap-3 p-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-white">{item.artists?.name}</p>
                            <span className="text-xs text-[#8888aa]">
                              {new Date(item.event_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}
                            </span>
                          </div>
                          <p className="text-xs text-[#8888aa] truncate">{item.event_name || '—'}</p>
                          <p className="text-xs text-[#8888aa]">{item.venue_name || '会場未取得'}</p>
                          {item.livefans_event_id && (
                            <a href={`https://www.livefans.jp/events/${item.livefans_event_id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-[#b3b3b3] hover:text-white flex items-center gap-1 w-fit transition-colors">
                              <LinkIcon size={10} /> LiveFansで確認
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => { initApproveForm(item); setApproveForm(prev => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { venue_name: item.venue_name ?? '', venue_address: '', start_time: '', tour_id: '', festival_event_id: '', stage_name: '' }), _open: !prev[item.id]?._open as any } })) }}
                            className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                            詳細
                          </button>
                          <button onClick={() => reject(item.id)}
                            className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-full transition-colors">
                            <X size={12} />
                          </button>
                        </div>
                      </div>

                      {/* 取込フォーム（展開時） */}
                      {form && (
                        <div className="border-t border-white/5 p-4 space-y-3 bg-white/2">
                          <p className="text-xs text-[#8888aa] font-bold uppercase tracking-wider">公演情報を確認・補完して取込</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-[#8888aa] mb-1 block">会場名 *</label>
                              <input type="text" value={form.venue_name}
                                onChange={e => setApproveForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], venue_name: e.target.value } }))}
                                className={cls} />
                            </div>
                            <div>
                              <label className="text-xs text-[#8888aa] mb-1 block">開演時刻</label>
                              <input type="time" step="300" value={form.start_time}
                                onChange={e => setApproveForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], start_time: e.target.value } }))}
                                className={cls} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-[#8888aa] mb-1 block">会場住所</label>
                            <input type="text" value={form.venue_address} placeholder="例: 東京都江東区有明3-1-1"
                              onChange={e => setApproveForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], venue_address: e.target.value } }))}
                              className={`${cls} w-full`} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-[#8888aa] mb-1 block">ツアーID（任意）</label>
                              <input type="text" value={form.tour_id} placeholder="UUID"
                                onChange={e => setApproveForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], tour_id: e.target.value } }))}
                                className={cls} />
                            </div>
                            <div>
                              <label className="text-xs text-[#8888aa] mb-1 block">ステージ名（任意）</label>
                              <input type="text" value={form.stage_name} placeholder="例: LOTUS STAGE"
                                onChange={e => setApproveForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], stage_name: e.target.value } }))}
                                className={cls} />
                            </div>
                          </div>
                          <button onClick={() => approve(item)} disabled={isApproving || !form.venue_name}
                            className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-5 py-2 rounded-full transition-colors">
                            {isApproving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {isApproving ? '取込中...' : 'この公演を取込'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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
