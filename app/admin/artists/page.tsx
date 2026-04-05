'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import { Mic2 } from 'lucide-react'

type Artist = { id: string; name: string; image_url: string | null; description: string | null; created_at: string }
type Form = { name: string; image_url: string; description: string }
const EMPTY: Form = { name: '', image_url: '', description: '' }

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Artist | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/artists')
    setArtists(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setForm(EMPTY); setEditing(null); setError(null); setModal('create') }
  const openEdit = (a: Artist) => {
    setForm({ name: a.name, image_url: a.image_url ?? '', description: a.description ?? '' })
    setEditing(a); setError(null); setModal('edit')
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('アーティスト名は必須です'); return }
    setSaving(true); setError(null)
    const isEdit = modal === 'edit' && editing
    const res = await fetch(isEdit ? `/api/admin/artists/${editing.id}` : '/api/admin/artists', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    if (isEdit) {
      setArtists(prev => prev.map(a => a.id === editing.id ? data : a))
    } else {
      setArtists(prev => [...prev, data])
    }
    setModal(null); setSaving(false)
  }

  const handleDelete = async (a: Artist) => {
    if (!confirm(`「${a.name}」を削除しますか？関連するツアー・公演も全て削除されます。`)) return
    const res = await fetch(`/api/admin/artists/${a.id}`, { method: 'DELETE' })
    if (res.ok) setArtists(prev => prev.filter(x => x.id !== a.id))
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">アーティスト管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{artists.length}件</p>
        </div>
        <button onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
          ＋ 追加
        </button>
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : artists.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
          アーティストがまだ登録されていません
        </div>
      ) : (
        <div className="space-y-2">
          {artists.map(a => (
            <div key={a.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
              {a.image_url ? (
                <img src={a.image_url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-violet-800/50 flex items-center justify-center shrink-0">
                  <Mic2 size={18} className="text-violet-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white">{a.name}</p>
                {a.description && <p className="text-xs text-[#8888aa] mt-0.5 truncate">{a.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => openEdit(a)}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  編集
                </button>
                <button onClick={() => handleDelete(a)}
                  className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <AdminModal title={modal === 'create' ? 'アーティストを追加' : 'アーティストを編集'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="アーティスト名 *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="例: Aimer" />
            <Field label="画像URL" value={form.image_url} onChange={v => setForm(f => ({ ...f, image_url: v }))} placeholder="https://..." />
            {form.image_url && (
              <img src={form.image_url} alt="" className="w-20 h-20 rounded-xl object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
            <Field label="説明" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="アーティストの紹介文" textarea />
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)}
                className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean
}) {
  const cls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
  return (
    <div>
      <label className="text-xs text-[#8888aa] mb-1 block">{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${cls} resize-none`} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      }
    </div>
  )
}
