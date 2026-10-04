'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import { ChevronDown, ChevronRight } from 'lucide-react'

type FestivalEvent = {
  id: string; name: string; slug: string | null
  start_date: string; end_date: string | null
  venue_name: string | null; image_url: string | null
}
type FestivalGroup = {
  id: string; name: string; slug: string | null; image_url: string | null
  festival_events: FestivalEvent[]
}

type GroupForm = { name: string; slug: string; image_url: string }
type EventForm = { group_id: string; name: string; slug: string; start_date: string; end_date: string; venue_name: string; venue_address: string; image_url: string }
type CrawlResult = { concerts_added: number; total_slots: number; matched_artists: number; unmatched_artists: string[]; errors: string[]; message: string }
type PendingFestivalGroup = { id: string; livefans_group_id: number; name: string | null; crawl_status: string | null; detected_at: string | null; livefans_pending_event_ids: number[] | null }

const EMPTY_GROUP: GroupForm = { name: '', slug: '', image_url: '' }
const EMPTY_EVENT: EventForm = { group_id: '', name: '', slug: '', start_date: '', end_date: '', venue_name: '', venue_address: '', image_url: '' }

export default function AdminFestivalsPage() {
  const [groups, setGroups] = useState<FestivalGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [modal, setModal] = useState<'group-create' | 'group-edit' | 'event-create' | 'event-edit' | 'crawl' | null>(null)
  const [editingGroup, setEditingGroup] = useState<FestivalGroup | null>(null)
  const [editingEvent, setEditingEvent] = useState<FestivalEvent | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP)
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_EVENT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pendingGroups, setPendingGroups] = useState<PendingFestivalGroup[]>([])

  const [crawlTargetEvent, setCrawlTargetEvent] = useState<FestivalEvent | null>(null)
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawling, setCrawling] = useState(false)
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null)

  const [queueProcessing, setQueueProcessing] = useState(false)
  const [queueResult, setQueueResult] = useState<{ total_events: number; total_concerts: number; log: string[]; message: string; phase?: number; remaining?: number; queued?: number } | null>(null)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)
  const [crawlingGroupId, setCrawlingGroupId] = useState<string | null>(null)

  const load = async () => {
    try {
      const [festRes, pgRes] = await Promise.all([
        fetch('/api/admin/festivals'),
        fetch('/api/admin/festival-groups'),
      ])
      if (festRes.ok) setGroups(await festRes.json())
      if (pgRes.ok) setPendingGroups(await pgRes.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const openGroupCreate = () => { setGroupForm(EMPTY_GROUP); setEditingGroup(null); setError(null); setModal('group-create') }
  const openGroupEdit = (g: FestivalGroup) => { setGroupForm({ name: g.name, slug: g.slug ?? '', image_url: g.image_url ?? '' }); setEditingGroup(g); setError(null); setModal('group-edit') }
  const openEventCreate = (groupId: string) => { setEventForm({ ...EMPTY_EVENT, group_id: groupId }); setEditingEvent(null); setError(null); setModal('event-create') }
  const openCrawl = (e: FestivalEvent) => { setCrawlTargetEvent(e); setCrawlUrl(''); setCrawlResult(null); setError(null); setModal('crawl') }
  const openEventEdit = (e: FestivalEvent, groupId: string) => {
    setEventForm({
      group_id: groupId,
      name: e.name, slug: e.slug ?? '',
      start_date: e.start_date, end_date: e.end_date ?? '',
      venue_name: e.venue_name ?? '', venue_address: '', image_url: e.image_url ?? '',
    })
    setEditingEvent(e); setError(null); setModal('event-edit')
  }

  const saveGroup = async () => {
    if (!groupForm.name.trim()) { setError('フェス名は必須です'); return }
    setSaving(true); setError(null)
    try {
      const isEdit = modal === 'group-edit' && editingGroup
      const res = await fetch(isEdit ? `/api/admin/festivals/${editingGroup.id}` : '/api/admin/festivals', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'group', ...groupForm }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      if (isEdit) {
        setGroups(prev => prev.map(g => g.id === editingGroup.id ? data : g))
      } else {
        setGroups(prev => [...prev, { ...data, festival_events: [] }])
      }
      setModal(null)
    } catch { setError('ネットワークエラー') }
    finally { setSaving(false) }
  }

  const saveEvent = async () => {
    if (!eventForm.name.trim()) { setError('開催名は必須です'); return }
    if (!eventForm.start_date) { setError('開始日は必須です'); return }
    setSaving(true); setError(null)
    try {
      const isEdit = modal === 'event-edit' && editingEvent
      const res = await fetch(isEdit ? `/api/admin/festivals/${editingEvent.id}` : '/api/admin/festivals', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'event', ...eventForm }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      setGroups(prev => prev.map(g => {
        if (g.id !== eventForm.group_id) return g
        if (isEdit) return { ...g, festival_events: g.festival_events.map(e => e.id === editingEvent.id ? data : e) }
        return { ...g, festival_events: [...g.festival_events, data] }
      }))
      setModal(null)
    } catch { setError('ネットワークエラー') }
    finally { setSaving(false) }
  }

  const deleteGroup = async (g: FestivalGroup) => {
    if (!confirm(`「${g.name}」を削除しますか？（配下のfestival_eventsも削除されます）`)) return
    const res = await fetch(`/api/admin/festivals/${g.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'group' }) })
    if (res.ok) setGroups(prev => prev.filter(x => x.id !== g.id))
    else alert('削除に失敗しました')
  }

  const deleteEvent = async (e: FestivalEvent, groupId: string) => {
    if (!confirm(`「${e.name}」を削除しますか？`)) return
    const res = await fetch(`/api/admin/festivals/${e.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'event' }) })
    if (res.ok) setGroups(prev => prev.map(g => g.id !== groupId ? g : { ...g, festival_events: g.festival_events.filter(x => x.id !== e.id) }))
    else alert('削除に失敗しました')
  }

  const reprocess = async (id: string) => {
    setReprocessingId(id)
    try {
      const res = await fetch('/api/admin/festival-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) await load()
    } catch { /* ignore */ }
    finally { setReprocessingId(null) }
  }

  const processQueue = async (groupId?: string) => {
    if (groupId) setCrawlingGroupId(groupId)
    else setQueueProcessing(true)
    setQueueResult(null)
    try {
      const res = await fetch('/api/admin/livefans-festival-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(groupId ? { group_id: groupId } : { limit: 1 }),
        signal: AbortSignal.timeout(70000),
      })
      const text = await res.text()
      let data: typeof queueResult
      try { data = JSON.parse(text) } catch {
        data = { total_events: 0, total_concerts: 0, log: [`サーバーエラー (HTTP ${res.status}): ${text.slice(0, 200)}`], message: 'サーバータイムアウト — 再実行してください' }
      }
      setQueueResult(data)
      if (res.ok) await load()
    } catch (e) {
      setQueueResult({ total_events: 0, total_concerts: 0, log: [`ネットワークエラー: ${e}`], message: 'リクエスト失敗 — 再実行してください' })
    } finally { setCrawlingGroupId(null); setQueueProcessing(false) }
  }

  const runCrawl = async () => {
    if (!crawlTargetEvent) return
    const m = crawlUrl.match(/\/events\/(\d+)/)
    if (!m) { setError('LiveFans のイベントURL（/events/xxxxx）を入力してください'); return }
    setCrawling(true); setError(null); setCrawlResult(null)
    try {
      const res = await fetch('/api/admin/livefans-festival-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ festival_event_id: crawlTargetEvent.id, livefans_event_id: parseInt(m[1]) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'クロールに失敗しました'); return }
      setCrawlResult(data)
    } catch { setError('ネットワークエラー') }
    finally { setCrawling(false) }
  }

  const cls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30'

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">フェス管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{groups.length}件のフェスシリーズ</p>
        </div>
        <button onClick={openGroupCreate} className="bg-white hover:bg-[#e0e0e0] text-black font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
          ＋ フェスシリーズ追加
        </button>
      </div>

      {pendingGroups.filter(g => g.crawl_status === 'pending').length > 0 && (
        <div className="glass rounded-2xl p-4 space-y-3 border border-yellow-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">クロールキュー</p>
              <p className="text-xs text-[#8888aa] mt-0.5">
                過去クロールで検出されたフェス（未処理）— {pendingGroups.filter(g => g.crawl_status === 'pending').length}件
              </p>
            </div>
            <button
              onClick={() => processQueue()}
              disabled={queueProcessing}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold text-sm px-4 py-2 rounded-full transition-colors shrink-0"
            >
              {queueProcessing ? '処理中...' : 'キュー処理'}
            </button>

          </div>
          {(queueProcessing || queueResult) && (
            <div className="bg-black/30 rounded-xl px-4 py-3 space-y-1">
              {queueProcessing ? (
                <p className="text-xs text-yellow-400 font-mono">処理中...</p>
              ) : queueResult && (
                <>
                  <p className="text-sm text-white font-bold">{queueResult.message}</p>
                  {(queueResult.remaining ?? 0) > 0 && (
                    <p className="text-xs text-yellow-400">残り {queueResult.remaining} 件 — 続けてクロールしてください</p>
                  )}
                  {queueResult.log.length === 0 && (
                    <p className="text-xs text-[#8888aa] font-mono">（ログなし）</p>
                  )}
                  {queueResult.log.map((line, i) => (
                    <p key={i} className="text-xs text-[#b3b3b3] font-mono">{line}</p>
                  ))}
                </>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            {pendingGroups.filter(g => g.crawl_status === 'pending').map(g => {
              const pendingCount = g.livefans_pending_event_ids?.length ?? 0
              const phase = pendingCount > 0 ? 2 : 1
              return (
                <div key={g.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{g.name ?? `group:${g.livefans_group_id}`}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <a href={`https://www.livefans.jp/groups/${g.livefans_group_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs text-[#8888aa] hover:text-white transition-colors">
                        livefans.jp/groups/{g.livefans_group_id}
                      </a>
                      <span className="text-[10px] text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                        {phase === 1 ? 'リスト未取得' : `残り${pendingCount}件`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => processQueue(g.id)}
                    disabled={crawlingGroupId === g.id || queueProcessing}
                    className="text-xs bg-yellow-500/20 hover:bg-yellow-500/30 disabled:opacity-50 text-yellow-400 border border-yellow-500/30 px-3 py-1.5 rounded-full transition-colors shrink-0"
                  >
                    {crawlingGroupId === g.id ? '処理中...' : phase === 1 ? 'リスト取得' : 'イベント処理'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pendingGroups.filter(g => g.crawl_status === 'done').length > 0 && (
        <div className="glass rounded-2xl p-4 space-y-2 border border-white/10">
          <p className="text-sm font-bold text-white">処理済みグループ（再処理可能）</p>
          <div className="space-y-1.5">
            {pendingGroups.filter(g => g.crawl_status === 'done').map(g => (
              <div key={g.id} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{g.name ?? `group:${g.livefans_group_id}`}</p>
                  <a href={`https://www.livefans.jp/groups/${g.livefans_group_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[#8888aa] hover:text-white transition-colors">
                    livefans.jp/groups/{g.livefans_group_id}
                  </a>
                </div>
                <button
                  onClick={() => reprocess(g.id)}
                  disabled={reprocessingId === g.id}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors shrink-0"
                >
                  {reprocessingId === g.id ? '...' : '再処理'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : groups.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">フェスシリーズがまだありません</div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="glass rounded-2xl overflow-hidden">
              {/* グループヘッダー */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button onClick={() => toggleExpand(g.id)} className="text-[#8888aa] hover:text-white transition-colors">
                  {expanded.has(g.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {g.image_url && <img src={g.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">{g.name}</p>
                  <p className="text-xs text-[#8888aa]">{g.festival_events.length}回の開催</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEventCreate(g.id)} className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                    ＋ 開催追加
                  </button>
                  <button onClick={() => openGroupEdit(g)} className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                    編集
                  </button>
                  <button onClick={() => deleteGroup(g)} className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors">
                    削除
                  </button>
                </div>
              </div>

              {/* festival_events 一覧 */}
              {expanded.has(g.id) && (
                <div className="border-t border-white/5 divide-y divide-white/5">
                  {g.festival_events.length === 0 ? (
                    <p className="px-10 py-4 text-sm text-[#8888aa]">開催がまだありません</p>
                  ) : (
                    g.festival_events
                      .sort((a, b) => b.start_date.localeCompare(a.start_date))
                      .map(e => (
                        <div key={e.id} className="flex items-center gap-3 px-10 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white">{e.name}</p>
                            <p className="text-xs text-[#8888aa] mt-0.5">
                              {new Date(e.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                              {e.end_date && ` 〜 ${new Date(e.end_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}`}
                              {e.venue_name && ` ・ ${e.venue_name}`}
                            </p>
                          </div>
                          <p className="text-xs text-[#8888aa] font-mono shrink-0">{e.id.slice(0, 8)}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => openCrawl(e)} className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                              クロール
                            </button>
                            <button onClick={() => openEventEdit(e, g.id)} className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                              編集
                            </button>
                            <button onClick={() => deleteEvent(e, g.id)} className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors">
                              削除
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* フェスシリーズ モーダル */}
      {(modal === 'group-create' || modal === 'group-edit') && (
        <AdminModal title={modal === 'group-create' ? 'フェスシリーズを追加' : 'フェスシリーズを編集'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">フェス名 *</label>
              <input type="text" value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例: ROCK IN JAPAN FESTIVAL" className={cls} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">スラッグ（URL用）</label>
              <input type="text" value={groupForm.slug} onChange={e => setGroupForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="例: rock-in-japan" className={cls} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">画像URL</label>
              <input type="text" value={groupForm.image_url} onChange={e => setGroupForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="https://..." className={cls} />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">キャンセル</button>
              <button onClick={saveGroup} disabled={saving} className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* クロール モーダル */}
      {modal === 'crawl' && crawlTargetEvent && (
        <AdminModal title={`クロール: ${crawlTargetEvent.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">LiveFans イベントURL</label>
              <input
                type="text"
                value={crawlUrl}
                onChange={e => setCrawlUrl(e.target.value)}
                placeholder="https://www.livefans.jp/events/1649621"
                className={cls}
              />
              <p className="text-xs text-[#8888aa] mt-1">フェスのイベントページURL（/events/xxxxx）を入力してください</p>
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            {crawlResult && (
              <div className="bg-white/5 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                <p className="text-white font-bold">{crawlResult.message}</p>
                <p className="text-[#8888aa]">スロット: {crawlResult.total_slots}件 / マッチ: {crawlResult.matched_artists}件 / 追加: {crawlResult.concerts_added}件</p>
                {crawlResult.unmatched_artists.length > 0 && (
                  <div>
                    <p className="text-yellow-400 text-xs mt-2">未マッチのアーティスト（DB に存在しない）:</p>
                    <p className="text-[#8888aa] text-xs">{crawlResult.unmatched_artists.join('、')}</p>
                  </div>
                )}
                {crawlResult.errors.length > 0 && (
                  <div>
                    <p className="text-red-400 text-xs mt-2">エラー:</p>
                    {crawlResult.errors.map((e, i) => <p key={i} className="text-red-300 text-xs">{e}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">閉じる</button>
              <button onClick={runCrawl} disabled={crawling || !crawlUrl} className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {crawling ? 'クロール中...' : 'クロール実行'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* 開催 モーダル */}
      {(modal === 'event-create' || modal === 'event-edit') && (
        <AdminModal title={modal === 'event-create' ? '開催を追加' : '開催を編集'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">開催名 *</label>
              <input type="text" value={eventForm.name} onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例: ROCK IN JAPAN FESTIVAL 2025" className={cls} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">スラッグ（URL用）</label>
              <input type="text" value={eventForm.slug} onChange={e => setEventForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="例: rock-in-japan-2025" className={cls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">開始日 *</label>
                <input type="date" value={eventForm.start_date} onChange={e => setEventForm(f => ({ ...f, start_date: e.target.value }))}
                  className={cls} />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">終了日（複数日の場合）</label>
                <input type="date" value={eventForm.end_date} onChange={e => setEventForm(f => ({ ...f, end_date: e.target.value }))}
                  className={cls} />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">会場名</label>
              <input type="text" value={eventForm.venue_name} onChange={e => setEventForm(f => ({ ...f, venue_name: e.target.value }))}
                placeholder="例: 千葉市蘇我スポーツ公園" className={cls} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">会場住所</label>
              <input type="text" value={eventForm.venue_address} onChange={e => setEventForm(f => ({ ...f, venue_address: e.target.value }))}
                placeholder="例: 千葉県千葉市中央区川崎町1-2" className={cls} />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">画像URL</label>
              <input type="text" value={eventForm.image_url} onChange={e => setEventForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="https://..." className={cls} />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">キャンセル</button>
              <button onClick={saveEvent} disabled={saving} className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
