'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'

type Artist = { id: string; name: string }
type Tour = { id: string; name: string; start_date: string | null; end_date: string | null; image_url: string | null; artists: Artist | null }
type Form = { artist_id: string; name: string; start_date: string; end_date: string; image_url: string }
const EMPTY: Form = { artist_id: '', name: '', start_date: '', end_date: '', image_url: '' }

export default function AdminToursPage() {
  const [tours, setTours] = useState<Tour[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Tour | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const [tr, ar] = await Promise.all([
      fetch('/api/admin/tours').then(r => r.json()),
      fetch('/api/admin/artists').then(r => r.json()),
    ])
    setTours(tr); setArtists(ar); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setEditing(null); setError(null); setModal('create') }
  const openEdit = (t: Tour) => {
    setForm({
      artist_id: t.artists?.id ?? '',
      name: t.name,
      start_date: t.start_date ?? '',
      end_date: t.end_date ?? '',
      image_url: t.image_url ?? '',
    })
    setEditing(t); setError(null); setModal('edit')
  }

  const handleSave = async () => {
    if (!form.artist_id) { setError('アーティストを選択してください'); return }
    if (!form.name.trim()) { setError('ツアー名は必須です'); return }
    setSaving(true); setError(null)
    const isEdit = modal === 'edit' && editing
    const res = await fetch(isEdit ? `/api/admin/tours/${editing.id}` : '/api/admin/tours', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    if (isEdit) {
      setTours(prev => prev.map(t => t.id === editing.id ? data : t))
    } else {
      setTours(prev => [data, ...prev])
    }
    setModal(null); setSaving(false)
  }

  const handleDelete = async (t: Tour) => {
    if (!confirm(`「${t.name}」を削除しますか？関連する公演も全て削除されます。`)) return
    const res = await fetch(`/api/admin/tours/${t.id}`, { method: 'DELETE' })
    if (res.ok) setTours(prev => prev.filter(x => x.id !== t.id))
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
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">アーティスト *</label>
              <select value={form.artist_id} onChange={e => setForm(f => ({ ...f, artist_id: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
                <option value="">選択してください</option>
                {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <Field label="ツアー名 *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="例: Live Tour 2026" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">開始日</label>
                <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">終了日</label>
                <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>
            <Field label="画像URL" value={form.image_url} onChange={v => setForm(f => ({ ...f, image_url: v }))} placeholder="https://..." />
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">キャンセル</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存'}
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
