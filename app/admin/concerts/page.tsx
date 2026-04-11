'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import Link from 'next/link'

type Artist = { id: string; name: string }
type Tour = { id: string; name: string; artist_id: string; image_url: string | null }
type Concert = {
  id: string; venue_name: string; venue_address: string | null
  date: string; start_time: string | null; image_url: string | null
  spotify_url: string | null; apple_music_url: string | null
  artists: Artist | null; tours: { id: string; name: string } | null
}
type Form = {
  artist_id: string; tour_id: string; venue_name: string
  venue_address: string; date: string; start_time: string; image_url: string
  spotify_url: string; apple_music_url: string
}
const EMPTY: Form = { artist_id: '', tour_id: '', venue_name: '', venue_address: '', date: '', start_time: '18:00', image_url: '', spotify_url: '', apple_music_url: '' }

export default function AdminConcertsPage() {
  const [concerts, setConcerts] = useState<Concert[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [tours, setTours] = useState<Tour[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Concert | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [filterArtist, setFilterArtist] = useState('')

  const load = async () => {
    try {
      const [ccRes, arRes, trRes] = await Promise.all([
        fetch('/api/admin/concerts'),
        fetch('/api/admin/artists'),
        fetch('/api/admin/tours'),
      ])
      if (!ccRes.ok || !arRes.ok || !trRes.ok) throw new Error('fetch failed')
      const [cc, ar, tr] = await Promise.all([ccRes.json(), arRes.json(), trRes.json()])
      setConcerts(cc); setArtists(ar); setTours(tr)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filteredTours = tours.filter(t => !form.artist_id || t.artist_id === form.artist_id)

  const openCreate = () => { setForm(EMPTY); setEditing(null); setError(null); setModal('create') }
  const openEdit = (c: Concert) => {
    setForm({
      artist_id: c.artists?.id ?? '',
      tour_id: c.tours?.id ?? '',
      venue_name: c.venue_name,
      venue_address: c.venue_address ?? '',
      date: c.date,
      start_time: c.start_time ? c.start_time.slice(0, 5) : '',
      image_url: c.image_url ?? '',
      spotify_url: c.spotify_url ?? '',
      apple_music_url: c.apple_music_url ?? '',
    })
    setEditing(c); setError(null); setModal('edit')
  }

  const handleSave = async () => {
    if (!form.artist_id) { setError('アーティストを選択してください'); return }
    if (!form.venue_name.trim()) { setError('会場名は必須です'); return }
    if (!form.date) { setError('日付は必須です'); return }
    setSaving(true); setError(null)
    try {
      const isEdit = modal === 'edit' && editing
      const res = await fetch(isEdit ? `/api/admin/concerts/${editing.id}` : '/api/admin/concerts', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      if (isEdit) {
        setConcerts(prev => prev.map(c => c.id === editing.id ? data : c))
      } else {
        setConcerts(prev => [data, ...prev])
      }
      setModal(null)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: Concert) => {
    if (!confirm(`「${c.venue_name} ${new Date(c.date).toLocaleDateString('ja-JP')}」を削除しますか？`)) return
    try {
      const res = await fetch(`/api/admin/concerts/${c.id}`, { method: 'DELETE' })
      if (res.ok) setConcerts(prev => prev.filter(x => x.id !== c.id))
      else alert('削除に失敗しました')
    } catch {
      alert('ネットワークエラーが発生しました')
    }
  }

  const displayed = filterArtist ? concerts.filter(c => c.artists?.id === filterArtist) : concerts

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white">公演管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{displayed.length}件</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={filterArtist} onChange={e => setFilterArtist(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none">
            <option value="">全アーティスト</option>
            {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={openCreate}
            className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors shrink-0">
            ＋ 追加
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">データの読み込みに失敗しました</p>
          <button onClick={load} className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-4 py-2 rounded-full transition-colors">再試行</button>
        </div>
      ) : displayed.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">公演がまだ登録されていません</div>
      ) : (
        <div className="space-y-2">
          {displayed.map(c => (
            <div key={c.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
              <div className="shrink-0 text-center w-12">
                <p className="text-xs text-[#8888aa]">{new Date(c.date).toLocaleDateString('ja-JP', { month: 'short' })}</p>
                <p className="text-lg font-black text-white leading-tight">{new Date(c.date).getDate()}</p>
                <p className="text-xs text-[#8888aa]">{new Date(c.date).toLocaleDateString('ja-JP', { weekday: 'short' })}</p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white truncate">{c.venue_name}</p>
                  <span className="text-xs bg-violet-800/40 text-violet-300 px-2 py-0.5 rounded-full shrink-0">{c.artists?.name}</span>
                </div>
                <p className="text-xs text-[#8888aa] mt-0.5 truncate">
                  {c.tours?.name && `${c.tours.name} ・ `}{c.venue_address}
                  {c.start_time && ` ・ 開演 ${c.start_time.slice(0, 5)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/concerts/${c.id}`} target="_blank"
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  表示
                </Link>
                <button onClick={() => openEdit(c)}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                  編集
                </button>
                <button onClick={() => handleDelete(c)}
                  className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <AdminModal title={modal === 'create' ? '公演を追加' : '公演を編集'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">アーティスト *</label>
              <select value={form.artist_id}
                onChange={e => setForm(f => ({ ...f, artist_id: e.target.value, tour_id: '' }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
                <option value="">選択してください</option>
                {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">ツアー（任意）</label>
              <select value={form.tour_id}
                onChange={e => setForm(f => ({ ...f, tour_id: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
                disabled={!form.artist_id}>
                <option value="">選択なし（単独公演）</option>
                {filteredTours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">会場名 *</label>
              <input
                type="text"
                list="venue-list"
                value={form.venue_name}
                onChange={e => {
                  const name = e.target.value
                  const match = concerts.find(c => c.venue_name === name)
                  setForm(f => ({
                    ...f,
                    venue_name: name,
                    venue_address: match?.venue_address ?? f.venue_address,
                  }))
                }}
                placeholder="例: 東京ガーデンシアター"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
              <datalist id="venue-list">
                {Array.from(new Map(concerts.map(c => [c.venue_name, c])).values()).map(c => (
                  <option key={c.id} value={c.venue_name} />
                ))}
              </datalist>
            </div>
            <Field label="会場住所" value={form.venue_address} onChange={v => setForm(f => ({ ...f, venue_address: v }))} placeholder="例: 東京都江東区有明3-1-1" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">日付 *</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
              </div>
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">開演時刻</label>
                <input type="time" step="300" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">画像URL（空欄でツアー画像を使用）</label>
              <input type="text" value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="空欄 = ツアー画像をデフォルト使用"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
              {/* プレビュー */}
              {(() => {
                const tourImage = tours.find(t => t.id === form.tour_id)?.image_url
                const previewUrl = form.image_url || tourImage
                if (!previewUrl) return null
                return (
                  <div className="mt-2 space-y-1">
                    <img src={previewUrl} alt="" className="w-full h-24 object-cover rounded-xl opacity-80" onError={e => (e.currentTarget.style.display = 'none')} />
                    {!form.image_url && tourImage && (
                      <p className="text-xs text-[#8888aa]">ツアー画像を使用中（デフォルト）</p>
                    )}
                  </div>
                )
              })()}
            </div>
            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-xs text-[#8888aa] font-bold">プレイリストリンク（任意）</p>
              <Field label="Spotify" value={form.spotify_url} onChange={v => setForm(f => ({ ...f, spotify_url: v }))} placeholder="https://open.spotify.com/playlist/..." />
              <Field label="Apple Music" value={form.apple_music_url} onChange={v => setForm(f => ({ ...f, apple_music_url: v }))} placeholder="https://music.apple.com/jp/playlist/..." />
            </div>
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
