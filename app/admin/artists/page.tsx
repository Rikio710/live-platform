'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import { ArtistCircleImage } from '@/components/ArtistCircleImage'
import { Mic2, SlidersHorizontal } from 'lucide-react'

type WikidataCandidate = {
  wikidataId: string
  label: string
  wikidataDescription: string
  description: string
  website_url: string | null
  twitter_url: string | null
  instagram_url: string | null
  youtube_url: string | null
  tiktok_url: string | null
  image_url: string | null
}

type Artist = {
  id: string; name: string; image_url: string | null; description: string | null
  website_url: string | null; twitter_url: string | null; instagram_url: string | null; youtube_url: string | null; tiktok_url: string | null
  created_at: string
  image_crop_x: number | null; image_crop_y: number | null; image_crop_scale: number | null
  livefans_id: number | null
}
type Form = { name: string; image_url: string; description: string; website_url: string; twitter_url: string; instagram_url: string; youtube_url: string; tiktok_url: string; livefans_id: string }
const EMPTY: Form = { name: '', image_url: '', description: '', website_url: '', twitter_url: '', instagram_url: '', youtube_url: '', tiktok_url: '', livefans_id: '' }

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Artist | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  // Wikidata補完
  const [wikidataLoading, setWikidataLoading] = useState(false)
  const [wikidataCandidates, setWikidataCandidates] = useState<WikidataCandidate[] | null>(null)
  const [wikidataError, setWikidataError] = useState<string | null>(null)
  const [spotifyImageUrl, setSpotifyImageUrl] = useState<string | null>(null)

  const [cropModal, setCropModal] = useState<Artist | null>(null)
  const [cropX, setCropX] = useState(50)
  const [cropY, setCropY] = useState(50)
  const [cropScale, setCropScale] = useState(1)
  const [cropSaving, setCropSaving] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/artists')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setArtists(await res.json())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openCreate = () => {
    setForm(EMPTY); setEditing(null); setError(null); setModal('create')
    setWikidataCandidates(null); setWikidataError(null); setSpotifyImageUrl(null)
  }
  const openEdit = (a: Artist) => {
    setForm({
      name: a.name,
      image_url: a.image_url ?? '',
      description: a.description ?? '',
      website_url: a.website_url ?? '',
      twitter_url: a.twitter_url ?? '',
      instagram_url: a.instagram_url ?? '',
      youtube_url: a.youtube_url ?? '',
      tiktok_url: a.tiktok_url ?? '',
      livefans_id: a.livefans_id ? String(a.livefans_id) : '',
    })
    setEditing(a); setError(null); setModal('edit')
    setWikidataCandidates(null); setWikidataError(null); setSpotifyImageUrl(null)
  }

  const handleWikidataEnrich = async () => {
    if (!form.name.trim()) return
    setWikidataLoading(true)
    setWikidataCandidates(null)
    setWikidataError(null)
    try {
      const res = await fetch('/api/admin/wikidata-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setWikidataError(data.error ?? '取得失敗'); return }
      if (data.candidates.length === 0) { setWikidataError('該当するアーティストが見つかりませんでした'); return }
      setWikidataCandidates(data.candidates)
      if (data.spotify_image_url) setSpotifyImageUrl(data.spotify_image_url)
    } catch {
      setWikidataError('ネットワークエラー')
    } finally {
      setWikidataLoading(false)
    }
  }

  const applyCandidate = (c: WikidataCandidate) => {
    setForm(f => ({
      ...f,
      description: f.description || c.description,
      // Spotify画像を優先、なければWikidata画像
      image_url: f.image_url || spotifyImageUrl || c.image_url || '',
      website_url: f.website_url || c.website_url || '',
      twitter_url: f.twitter_url || c.twitter_url || '',
      instagram_url: f.instagram_url || c.instagram_url || '',
      youtube_url: f.youtube_url || c.youtube_url || '',
      tiktok_url: f.tiktok_url || c.tiktok_url || '',
    }))
    setWikidataCandidates(null)
    setSpotifyImageUrl(null)
  }

  const openCrop = (a: Artist) => {
    setCropModal(a)
    setCropX(a.image_crop_x ?? 50)
    setCropY(a.image_crop_y ?? 50)
    setCropScale(a.image_crop_scale ?? 1)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('アーティスト名は必須です'); return }
    setSaving(true); setError(null)
    try {
      const isEdit = modal === 'edit' && editing
      const res = await fetch(isEdit ? `/api/admin/artists/${editing.id}` : '/api/admin/artists', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          image_crop_x: editing?.image_crop_x ?? 50,
          image_crop_y: editing?.image_crop_y ?? 50,
          image_crop_scale: editing?.image_crop_scale ?? 1,
          livefans_id: form.livefans_id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      if (isEdit) {
        setArtists(prev => prev.map(a => a.id === editing.id ? data : a))
      } else {
        setArtists(prev => [...prev, data])
      }
      setModal(null)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCrop = async () => {
    if (!cropModal) return
    setCropSaving(true)
    try {
      const res = await fetch(`/api/admin/artists/${cropModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cropModal.name,
          image_url: cropModal.image_url,
          description: cropModal.description,
          website_url: cropModal.website_url,
          twitter_url: cropModal.twitter_url,
          instagram_url: cropModal.instagram_url,
          youtube_url: cropModal.youtube_url,
          tiktok_url: cropModal.tiktok_url,
          image_crop_x: cropX,
          image_crop_y: cropY,
          image_crop_scale: cropScale,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setArtists(prev => prev.map(a => a.id === cropModal.id ? data : a))
        setCropModal(null)
      }
    } finally {
      setCropSaving(false)
    }
  }

  const handleDelete = async (a: Artist) => {
    if (!confirm(`「${a.name}」を削除しますか？関連するツアー・公演も全て削除されます。`)) return
    try {
      const res = await fetch(`/api/admin/artists/${a.id}`, { method: 'DELETE' })
      if (res.ok) setArtists(prev => prev.filter(x => x.id !== a.id))
      else alert('削除に失敗しました')
    } catch {
      alert('ネットワークエラーが発生しました')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">アーティスト管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{artists.length}件</p>
        </div>
        <button onClick={openCreate}
          className="bg-white hover:bg-[#e0e0e0] text-black font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
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
      ) : artists.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
          アーティストがまだ登録されていません
        </div>
      ) : (
        <div className="space-y-2">
          {artists.map(a => (
            <div key={a.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
              {a.image_url ? (
                <ArtistCircleImage
                  url={a.image_url}
                  name={a.name}
                  cropX={a.image_crop_x}
                  cropY={a.image_crop_y}
                  cropScale={a.image_crop_scale}
                  className="w-10 h-10 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#333333] flex items-center justify-center shrink-0">
                  <Mic2 size={18} className="text-[#b3b3b3]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white">{a.name}</p>
                {a.description && <p className="text-xs text-[#8888aa] mt-0.5 truncate">{a.description}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.image_url && (
                  <button onClick={() => openCrop(a)}
                    className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1">
                    <SlidersHorizontal size={11} />
                    画像調整
                  </button>
                )}
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
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">アーティスト名 *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setWikidataCandidates(null); setWikidataError(null) }}
                  placeholder="例: Mr.Children"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  onClick={handleWikidataEnrich}
                  disabled={wikidataLoading || !form.name.trim()}
                  className="shrink-0 border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 disabled:opacity-40 text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                >
                  {wikidataLoading ? '検索中...' : '自動取得'}
                </button>
              </div>
              {wikidataError && <p className="text-xs text-yellow-400 mt-1">{wikidataError}</p>}
              {wikidataCandidates && wikidataCandidates.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {spotifyImageUrl && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <img src={spotifyImageUrl} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      <p className="text-xs text-green-400">Spotify画像を取得済み（候補選択時に自動適用）</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                    {wikidataCandidates.map(c => (
                      <button
                        key={c.wikidataId}
                        type="button"
                        onClick={() => applyCandidate(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors"
                      >
                        <p className="text-sm text-white font-bold">{c.label}</p>
                        <p className="text-xs text-[#8888aa] mt-0.5">{c.wikidataDescription}</p>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {c.website_url && <span className="text-xs text-[#6688aa]">HP</span>}
                          {c.twitter_url && <span className="text-xs text-[#6688aa]">X</span>}
                          {c.instagram_url && <span className="text-xs text-[#6688aa]">Instagram</span>}
                          {c.youtube_url && <span className="text-xs text-[#6688aa]">YouTube</span>}
                          {c.tiktok_url && <span className="text-xs text-[#6688aa]">TikTok</span>}
                          {(spotifyImageUrl || c.image_url) && <span className="text-xs text-[#6688aa]">画像</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Field label="画像URL" value={form.image_url} onChange={v => setForm(f => ({ ...f, image_url: v }))} placeholder="https://..." />
            {form.image_url && (
              <img src={form.image_url} alt="" className="w-20 h-20 rounded-xl object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
            <Field label="説明" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="アーティストの紹介文" textarea />
            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-xs text-[#8888aa] font-bold">livefans</p>
              <Field label="livefans アーティストID" value={form.livefans_id} onChange={v => setForm(f => ({ ...f, livefans_id: v }))} placeholder="例: 83037" />
              {form.livefans_id && (
                <p className="text-xs text-[#8888aa]">
                  スクレイパーURL: https://www.livefans.jp/search/artist/{form.livefans_id}?year=before
                </p>
              )}
            </div>
            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-xs text-[#8888aa] font-bold">リンク</p>
              <Field label="公式サイト" value={form.website_url} onChange={v => setForm(f => ({ ...f, website_url: v }))} placeholder="https://..." />
              <Field label="X (Twitter)" value={form.twitter_url} onChange={v => setForm(f => ({ ...f, twitter_url: v }))} placeholder="https://x.com/..." />
              <Field label="Instagram" value={form.instagram_url} onChange={v => setForm(f => ({ ...f, instagram_url: v }))} placeholder="https://instagram.com/..." />
              <Field label="YouTube" value={form.youtube_url} onChange={v => setForm(f => ({ ...f, youtube_url: v }))} placeholder="https://youtube.com/..." />
              <Field label="TikTok" value={form.tiktok_url} onChange={v => setForm(f => ({ ...f, tiktok_url: v }))} placeholder="https://tiktok.com/@..." />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)}
                className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                キャンセル
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {cropModal?.image_url && (
        <AdminModal title="画像の位置を調整" onClose={() => setCropModal(null)}>
          <div className="space-y-5">
            <p className="text-sm font-bold text-white text-center">{cropModal.name}</p>

            {/* プレビュー */}
            <div className="flex justify-center">
              <ArtistCircleImage
                url={cropModal.image_url}
                cropX={cropX}
                cropY={cropY}
                cropScale={cropScale}
                className="w-40 h-40"
              />
            </div>

            {/* スライダー */}
            <div className="space-y-4">
              <SliderField label="左右" value={cropX} onChange={setCropX} min={0} max={100} step={1} unit="%" />
              <SliderField label="上下" value={cropY} onChange={setCropY} min={0} max={100} step={1} unit="%" />
              <SliderField label="ズーム" value={cropScale} onChange={setCropScale} min={0.5} max={3} step={0.05} />
            </div>

            <button
              onClick={() => { setCropX(50); setCropY(50); setCropScale(1) }}
              className="w-full text-xs text-[#8888aa] hover:text-white border border-white/10 py-2 rounded-xl transition-colors"
            >
              リセット
            </button>

            <div className="flex gap-3">
              <button onClick={() => setCropModal(null)}
                className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                キャンセル
              </button>
              <button onClick={handleSaveCrop} disabled={cropSaving}
                className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {cropSaving ? '保存中...' : '保存'}
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
  const cls = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
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

function SliderField({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; unit?: string
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <label className="text-xs text-[#8888aa]">{label}</label>
        <span className="text-xs text-white font-medium">
          {step < 1 ? value.toFixed(2) : value}{unit ?? ''}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-white" />
    </div>
  )
}
