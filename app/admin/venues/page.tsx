'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import Link from 'next/link'
import { MapPin, ExternalLink } from 'lucide-react'

type Venue = {
  venue_name: string
  venue_address: string | null
  count: number
}

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<Venue | null>(null)
  const [formName, setFormName] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

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
    setEditing(v)
    setFormName(v.venue_name)
    setFormAddress(v.venue_address ?? '')
    setError(null)
  }

  const handleSave = async () => {
    if (!editing) return
    if (!formName.trim()) { setError('会場名は必須です'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: editing.venue_name, new_name: formName, new_address: formAddress }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      setVenues(prev => prev.map(v =>
        v.venue_name === editing.venue_name
          ? { ...v, venue_name: formName.trim(), venue_address: formAddress.trim() || null }
          : v
      ))
      setEditing(null)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const filtered = search
    ? venues.filter(v => v.venue_name.includes(search) || (v.venue_address ?? '').includes(search))
    : venues

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white">会場管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{venues.length}会場</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="会場名・住所で絞り込み"
          className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50 w-56"
        />
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
            <div key={v.venue_name} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
              <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <MapPin size={15} className="text-violet-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate">{v.venue_name}</p>
                <p className="text-xs text-[#8888aa] mt-0.5 truncate">
                  {v.venue_address ?? <span className="text-yellow-500/70">住所未登録</span>}
                  <span className="ml-2 text-violet-400">{v.count}公演</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/venues/${encodeURIComponent(v.venue_name)}`}
                  target="_blank"
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                >
                  <ExternalLink size={11} />表示
                </Link>
                <button
                  onClick={() => openEdit(v)}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors"
                >
                  編集
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AdminModal title="会場を編集" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <p className="text-xs text-[#8888aa] bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
              会場名・住所を変更すると、この会場の全 <span className="text-violet-300 font-bold">{editing.count}公演</span> に自動反映されます。
            </p>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">会場名 *</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">住所</label>
              <input
                type="text"
                value={formAddress}
                onChange={e => setFormAddress(e.target.value)}
                placeholder="例: 東京都江東区有明3-10-60"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存して全公演に反映'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}
