'use client'

import { useState, useEffect, useMemo } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import { MapPin, ExternalLink, Loader2, Merge, ScanSearch, X, Check } from 'lucide-react'

type Venue = {
  venue_name: string
  venue_address: string | null
  count: number
}

type AutoGroup = {
  venues: Venue[]       // 公演数の多い順
  canonical: string     // 統一後の正規名（編集可）
  included: boolean     // このグループを実行対象にするか
}

// 名前を正規化してグルーピングのキーを作る
function normalizeKey(name: string): string {
  return name
    .normalize('NFKC')                       // 全角英数→半角
    .toLowerCase()
    .replace(/\s*[（(][^)）]*[)）]/g, '')    // 末尾のカッコ（注釈）を除去
    .replace(/[　\s]+/g, '')                 // 全角スペース含む空白を除去
    .trim()
}

function detectDuplicates(venues: Venue[]): AutoGroup[] {
  const map = new Map<string, Venue[]>()
  for (const v of venues) {
    const key = normalizeKey(v.venue_name)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(v)
  }
  return Array.from(map.values())
    .filter(g => g.length >= 2)
    .map(g => {
      const sorted = [...g].sort((a, b) => b.count - a.count)
      return { venues: sorted, canonical: sorted[0].venue_name, included: true }
    })
    .sort((a, b) => {
      const ta = a.venues.reduce((s, v) => s + v.count, 0)
      const tb = b.venues.reduce((s, v) => s + v.count, 0)
      return tb - ta
    })
}

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<Venue | null>(null)
  const [formName, setFormName] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

  // 手動選択マージ
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mergeCanonical, setMergeCanonical] = useState('')
  const [mergeAddress, setMergeAddress] = useState('')
  const [merging, setMerging] = useState(false)
  const [mergeLookingUp, setMergeLookingUp] = useState(false)

  // 自動検出
  const [autoGroups, setAutoGroups] = useState<AutoGroup[] | null>(null)
  const [batchMerging, setBatchMerging] = useState(false)
  const [batchDone, setBatchDone] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/venues')
      if (!res.ok) throw new Error()
      setVenues(await res.json())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openEdit = (v: Venue) => {
    setEditing(v); setFormName(v.venue_name); setFormAddress(v.venue_address ?? ''); setEditError(null)
  }

  const lookupAddress = async (name: string, setAddr: (a: string) => void, setBusy: (v: boolean) => void) => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/venues/places', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name }),
      })
      const data = await res.json()
      if (data.address) setAddr(data.address)
      else alert(data.error ?? '住所が見つかりませんでした')
    } catch { alert('検索に失敗しました') }
    finally { setBusy(false) }
  }

  const callMerge = async (aliases: string[], canonical: string, canonical_address?: string) => {
    const res = await fetch('/api/admin/venues', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliases, canonical: canonical.trim(), canonical_address }),
    })
    if (!res.ok) throw new Error('統一に失敗しました')
  }

  const handleSave = async () => {
    if (!editing || !formName.trim()) { setEditError('会場名は必須です'); return }
    setSaving(true); setEditError(null)
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: editing.venue_name, new_name: formName, new_address: formAddress }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error ?? '保存に失敗しました'); return }
      setVenues(prev => prev.map(v =>
        v.venue_name === editing.venue_name
          ? { ...v, venue_name: formName.trim(), venue_address: formAddress.trim() || null }
          : v
      ))
      setEditing(null)
    } catch { setEditError('ネットワークエラーが発生しました') }
    finally { setSaving(false) }
  }

  // 手動マージ
  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
        if (next.size <= 2) {
          const sel = venues.filter(v => next.has(v.venue_name))
          setMergeCanonical(sel.reduce((a, b) => a.count >= b.count ? a : b).venue_name)
          setMergeAddress('')
        }
      }
      return next
    })
  }
  const selectedVenues = useMemo(() => venues.filter(v => selected.has(v.venue_name)), [venues, selected])
  const selectedTotal = selectedVenues.reduce((s, v) => s + v.count, 0)

  const handleMerge = async () => {
    if (!mergeCanonical.trim() || selected.size < 2) return
    if (!confirm(`${selected.size}件を「${mergeCanonical}」に統一します（${selectedTotal}公演対象）。よろしいですか？`)) return
    setMerging(true)
    try {
      await callMerge(Array.from(selected), mergeCanonical, mergeAddress || undefined)
      await load(); setSelected(new Set()); setMergeCanonical(''); setMergeAddress('')
    } catch { alert('統一に失敗しました') }
    finally { setMerging(false) }
  }

  // 自動検出
  const runAutoDetect = () => {
    setBatchDone(null)
    setAutoGroups(detectDuplicates(venues))
  }

  const updateGroup = (i: number, patch: Partial<AutoGroup>) =>
    setAutoGroups(prev => prev ? prev.map((g, idx) => idx === i ? { ...g, ...patch } : g) : prev)

  const includedGroups = autoGroups?.filter(g => g.included) ?? []
  const includedTotal = includedGroups.reduce((s, g) => s + g.venues.reduce((ss, v) => ss + v.count, 0), 0)

  const handleBatchMerge = async () => {
    if (!includedGroups.length) return
    setBatchMerging(true)
    try {
      for (const g of includedGroups) {
        await callMerge(g.venues.map(v => v.venue_name), g.canonical)
      }
      setBatchDone(`${includedGroups.length}グループを統一しました`)
      await load()
      setAutoGroups(null)
    } catch { alert('一括統一に失敗しました') }
    finally { setBatchMerging(false) }
  }

  const filtered = search
    ? venues.filter(v => v.venue_name.includes(search) || (v.venue_address ?? '').includes(search))
    : venues

  const mapsUrl = (name: string, address: string | null) =>
    `https://www.google.com/maps/search/${encodeURIComponent(address ?? name)}`

  return (
    <div className="space-y-6 max-w-4xl pb-32">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white">会場管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{venues.length}会場</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {batchDone && <p className="text-xs text-green-400 flex items-center gap-1"><Check size={12} />{batchDone}</p>}
          <button
            onClick={runAutoDetect}
            disabled={loading || venues.length === 0}
            className="flex items-center gap-2 border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 disabled:opacity-40 text-sm px-4 py-2 rounded-full transition-colors"
          >
            <ScanSearch size={14} />重複を自動検出
          </button>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setSelected(new Set()) }}
            placeholder="会場名・住所で絞り込み"
            className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30 w-48"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">データの読み込みに失敗しました</p>
          <button onClick={load} className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-4 py-2 rounded-full transition-colors">再試行</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">会場が見つかりません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(v => (
            <div key={v.venue_name} className={`glass rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors ${selected.has(v.venue_name) ? 'border-white/20 bg-white/5' : ''}`}>
              <input type="checkbox" checked={selected.has(v.venue_name)} onChange={() => toggleSelect(v.venue_name)}
                className="w-4 h-4 rounded accent-white shrink-0 cursor-pointer" />
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                <MapPin size={13} className="text-[#b3b3b3]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm truncate">{v.venue_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {v.venue_address ? (
                    <a href={mapsUrl(v.venue_name, v.venue_address)} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[#8888aa] hover:text-white truncate flex items-center gap-1 transition-colors">
                      <MapPin size={10} className="shrink-0" />{v.venue_address}
                    </a>
                  ) : (
                    <span className="text-xs text-yellow-500/70">住所未登録</span>
                  )}
                  <span className="text-xs text-[#555566] shrink-0">{v.count}公演</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={mapsUrl(v.venue_name, v.venue_address)} target="_blank" rel="noopener noreferrer"
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-2.5 py-1.5 rounded-full transition-colors flex items-center gap-1">
                  <ExternalLink size={11} />地図
                </a>
                <button onClick={() => openEdit(v)}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  編集
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 手動マージパネル */}
      {selected.size >= 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0d0d14]/95 backdrop-blur px-4 py-4">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center gap-2">
              <Merge size={14} className="text-[#b3b3b3]" />
              <p className="text-sm font-bold text-white">{selected.size}件選択中（{selectedTotal}公演が対象）</p>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-[#8888aa] hover:text-white transition-colors">クリア</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-48">
                <p className="text-[10px] text-[#8888aa] mb-1">統一後の正規名</p>
                <input type="text" value={mergeCanonical} onChange={e => setMergeCanonical(e.target.value)}
                  placeholder="正規の会場名"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
              </div>
              <div className="flex-1 min-w-48">
                <p className="text-[10px] text-[#8888aa] mb-1">住所（任意）</p>
                <div className="flex gap-1.5">
                  <input type="text" value={mergeAddress} onChange={e => setMergeAddress(e.target.value)}
                    placeholder="住所を自動入力または手動入力"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
                  <button onClick={() => lookupAddress(mergeCanonical || Array.from(selected)[0], setMergeAddress, setMergeLookingUp)}
                    disabled={mergeLookingUp || !mergeCanonical.trim()}
                    className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg transition-colors shrink-0">
                    {mergeLookingUp ? <Loader2 size={13} className="animate-spin" /> : '住所検索'}
                  </button>
                </div>
              </div>
            </div>
            <button onClick={handleMerge} disabled={merging || !mergeCanonical.trim()}
              className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-6 py-2.5 rounded-full transition-colors">
              {merging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
              {merging ? '統一中...' : `「${mergeCanonical || '？'}」に統一`}
            </button>
          </div>
        </div>
      )}

      {/* 自動検出モーダル */}
      {autoGroups !== null && (
        <AdminModal title={`重複の自動検出 — ${autoGroups.length}グループ検出`} onClose={() => setAutoGroups(null)}>
          <div className="space-y-4">
            {autoGroups.length === 0 ? (
              <p className="text-sm text-[#8888aa] text-center py-6">重複する会場名は見つかりませんでした</p>
            ) : (
              <>
                <p className="text-xs text-[#8888aa]">
                  名前が同じと判定されたグループです。正規名を確認・修正し、統一するグループを選んで一括実行してください。
                </p>

                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {autoGroups.map((g, i) => (
                    <div key={i} className={`rounded-xl border p-3 space-y-2 transition-colors ${g.included ? 'border-white/15 bg-white/3' : 'border-white/5 opacity-50'}`}>
                      <div className="flex items-start gap-2">
                        <input type="checkbox" checked={g.included} onChange={e => updateGroup(i, { included: e.target.checked })}
                          className="w-4 h-4 accent-white mt-0.5 shrink-0 cursor-pointer" />
                        <div className="flex-1 space-y-1.5">
                          {/* 含まれる会場名一覧 */}
                          <div className="space-y-0.5">
                            {g.venues.map((v, vi) => (
                              <div key={v.venue_name} className="flex items-center gap-2">
                                <span className={`text-xs font-mono px-1.5 py-0.5 rounded shrink-0 ${vi === 0 ? 'bg-white/10 text-white' : 'text-[#8888aa]'}`}>
                                  {vi === 0 ? '多' : '　'}
                                </span>
                                <span className={`text-sm flex-1 truncate ${vi === 0 ? 'text-white font-bold' : 'text-[#8888aa]'}`}>{v.venue_name}</span>
                                <span className="text-xs text-[#555566] shrink-0">{v.count}公演</span>
                              </div>
                            ))}
                          </div>
                          {/* 正規名入力 */}
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] text-[#8888aa] shrink-0">統一後:</span>
                            <input type="text" value={g.canonical} onChange={e => updateGroup(i, { canonical: e.target.value })}
                              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
                            <button onClick={() => updateGroup(i, { included: false })}
                              className="text-[#555566] hover:text-red-400 transition-colors shrink-0">
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/5 pt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#8888aa]">
                    {includedGroups.length}グループ（{includedTotal}公演）を統一
                  </p>
                  <button onClick={handleBatchMerge} disabled={batchMerging || includedGroups.length === 0}
                    className="flex items-center gap-2 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold text-sm px-6 py-2.5 rounded-full transition-colors shrink-0">
                    {batchMerging ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />}
                    {batchMerging ? '統一中...' : '一括統一'}
                  </button>
                </div>
              </>
            )}
          </div>
        </AdminModal>
      )}

      {/* 編集モーダル */}
      {editing && (
        <AdminModal title="会場を編集" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <p className="text-xs text-[#8888aa] bg-white/5 border border-violet-500/20 rounded-xl px-4 py-3">
              変更すると、この会場の全 <span className="text-[#b3b3b3] font-bold">{editing.count}公演</span> に自動反映されます。
            </p>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">会場名 *</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-[#8888aa]">住所</label>
                <button onClick={() => lookupAddress(formName, setFormAddress, setLookingUp)}
                  disabled={lookingUp || !formName.trim()}
                  className="flex items-center gap-1 text-xs text-[#8888aa] hover:text-white disabled:opacity-40 transition-colors">
                  {lookingUp ? <Loader2 size={11} className="animate-spin" /> : <MapPin size={11} />}
                  {lookingUp ? '検索中...' : 'Googleマップで住所を自動入力'}
                </button>
              </div>
              <input type="text" value={formAddress} onChange={e => setFormAddress(e.target.value)}
                placeholder="例: 東京都文京区後楽1-3-61"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
              {formAddress && (
                <a href={mapsUrl(formName, formAddress)} target="_blank" rel="noopener noreferrer"
                  className="mt-1 text-xs text-[#8888aa] hover:text-white flex items-center gap-1 transition-colors w-fit">
                  <ExternalLink size={10} />地図で確認
                </a>
              )}
            </div>
            {editError && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{editError}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">キャンセル</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存して全公演に反映'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
