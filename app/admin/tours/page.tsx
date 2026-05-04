'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import { Trash2, Plus } from 'lucide-react'

type Artist = { id: string; name: string }
type Tour = { id: string; name: string; start_date: string | null; end_date: string | null; image_url: string | null; artists: Artist | null }
type Form = { artist_id: string; name: string; image_url: string }
type ConcertRow = { _id: string; venue_name: string; date: string; start_time: string }

const EMPTY: Form = { artist_id: '', name: '', image_url: '' }
let _rowId = 0
const newRow = (): ConcertRow => ({ _id: String(++_rowId), venue_name: '', date: '', start_time: '' })

export default function AdminToursPage() {
  const [tours, setTours] = useState<Tour[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Tour | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [concertRows, setConcertRows] = useState<ConcertRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  // URLインポート
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [trRes, arRes] = await Promise.all([
        fetch('/api/admin/tours'),
        fetch('/api/admin/artists'),
      ])
      if (!trRes.ok || !arRes.ok) throw new Error('fetch failed')
      const [tr, ar] = await Promise.all([trRes.json(), arRes.json()])
      setTours(tr); setArtists(ar)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openCreate = () => {
    setForm(EMPTY)
    setConcertRows([])
    setImportUrl('')
    setImportError(null)
    setEditing(null)
    setError(null)
    setModal('create')
  }
  const openEdit = (t: Tour) => {
    setForm({ artist_id: t.artists?.id ?? '', name: t.name, image_url: t.image_url ?? '' })
    setEditing(t); setError(null); setModal('edit')
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch('/api/admin/schedule-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error ?? '取得失敗'); return }
      if (data.title) setForm(f => ({ ...f, name: f.name || data.title }))
      if (data.concerts?.length > 0) {
        setConcertRows(data.concerts.map((c: any) => ({ ...c, _id: String(++_rowId) })))
      } else {
        setImportError('公演情報が見つかりませんでした。手動で入力してください。')
      }
    } catch {
      setImportError('ネットワークエラー')
    } finally {
      setImporting(false)
    }
  }

  const updateRow = (id: string, patch: Partial<ConcertRow>) =>
    setConcertRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r))
  const removeRow = (id: string) =>
    setConcertRows(prev => prev.filter(r => r._id !== id))

  const handleSave = async () => {
    if (!form.artist_id) { setError('アーティストを選択してください'); return }
    if (!form.name.trim()) { setError('ツアー名は必須です'); return }
    setSaving(true); setError(null)
    try {
      const isEdit = modal === 'edit' && editing
      const body = isEdit
        ? form
        : { ...form, concerts: concertRows.filter(r => r.venue_name && r.date) }
      const res = await fetch(isEdit ? `/api/admin/tours/${editing.id}` : '/api/admin/tours', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      if (isEdit) {
        setTours(prev => prev.map(t => t.id === editing.id ? data : t))
      } else {
        setTours(prev => [data, ...prev])
      }
      setModal(null)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: Tour) => {
    if (!confirm(`「${t.name}」を削除しますか？関連する公演も全て削除されます。`)) return
    try {
      const res = await fetch(`/api/admin/tours/${t.id}`, { method: 'DELETE' })
      if (res.ok) setTours(prev => prev.filter(x => x.id !== t.id))
      else alert('削除に失敗しました')
    } catch {
      alert('ネットワークエラーが発生しました')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">ツアー管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{tours.length}件</p>
        </div>
        <button onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
          ＋ 追加
        </button>
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">データの読み込みに失敗しました</p>
          <button onClick={load} className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-4 py-2 rounded-full transition-colors">再試行</button>
        </div>
      ) : tours.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">ツアーがまだ登録されていません</div>
      ) : (
        <div className="space-y-2">
          {tours.map(t => (
            <div key={t.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white">{t.name}</p>
                  <span className="text-xs bg-violet-800/40 text-violet-300 px-2 py-0.5 rounded-full">{t.artists?.name}</span>
                </div>
                {(t.start_date || t.end_date) && (
                  <p className="text-xs text-[#8888aa] mt-0.5">
                    {t.start_date && new Date(t.start_date).toLocaleDateString('ja-JP')}
                    {t.start_date && t.end_date && ' 〜 '}
                    {t.end_date && new Date(t.end_date).toLocaleDateString('ja-JP')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(t)}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">編集</button>
                <button onClick={() => handleDelete(t)}
                  className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors">削除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <AdminModal title={modal === 'create' ? 'ツアーを追加' : 'ツアーを編集'} onClose={() => setModal(null)}>
          <div className="space-y-4">

            {/* URLインポート（新規作成のみ） */}
            {modal === 'create' && (
              <div className="space-y-2">
                <label className="text-xs text-[#8888aa] block">URLからインポート（livefans.jp など）</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleImport()}
                    placeholder="https://www.livefans.jp/groups/..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                  />
                  <button
                    onClick={handleImport}
                    disabled={importing || !importUrl.trim()}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shrink-0"
                  >
                    {importing ? '取得中...' : '取得'}
                  </button>
                </div>
                {importError && <p className="text-xs text-yellow-400">{importError}</p>}
                <div className="border-t border-white/8 pt-2" />
              </div>
            )}

            {/* 基本情報 */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">アーティスト *</label>
              <select value={form.artist_id} onChange={e => setForm(f => ({ ...f, artist_id: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
                <option value="">選択してください</option>
                {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Field label="ツアー名 *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="例: Live Tour 2026" />
            <Field label="画像URL" value={form.image_url} onChange={v => setForm(f => ({ ...f, image_url: v }))} placeholder="https://..." />

            {/* 公演リスト（新規作成のみ） */}
            {modal === 'create' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#8888aa]">公演 {concertRows.length > 0 && `（${concertRows.length}件）`}</label>
                  <button
                    onClick={() => setConcertRows(prev => [...prev, newRow()])}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <Plus size={12} />行を追加
                  </button>
                </div>
                {concertRows.length > 0 && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {concertRows.map(row => (
                      <div key={row._id} className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          value={row.venue_name}
                          onChange={e => updateRow(row._id, { venue_name: e.target.value })}
                          placeholder="会場名"
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                        />
                        <input
                          type="date"
                          value={row.date}
                          onChange={e => updateRow(row._id, { date: e.target.value })}
                          className="w-32 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50"
                        />
                        <input
                          type="time"
                          value={row.start_time.slice(0, 5)}
                          onChange={e => updateRow(row._id, { start_time: e.target.value + ':00' })}
                          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500/50"
                        />
                        <button onClick={() => removeRow(row._id)} className="text-[#8888aa] hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">キャンセル</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : modal === 'create' && concertRows.length > 0 ? `保存（公演${concertRows.filter(r => r.venue_name && r.date).length}件）` : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-[#8888aa] mb-1 block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50" />
    </div>
  )
}
