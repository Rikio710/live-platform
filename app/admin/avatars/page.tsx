'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Upload, Star, Trash2, Check } from 'lucide-react'

type Preset = { id: string; url: string; is_default: boolean; sort_order: number }

export default function AdminAvatarsPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [presets, setPresets] = useState<Preset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/preset-avatars')
    if (res.ok) setPresets(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) throw new Error('未ログイン')
      const filename = `presets/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error: storageErr } = await supabase.storage.from('avatars').upload(filename, file, {
        contentType: file.type, upsert: false,
      })
      if (storageErr) throw storageErr
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename)
      const res = await fetch('/api/admin/preset-avatars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicUrl }),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      const preset = await res.json()
      setPresets(prev => [...prev, preset])
      setSaved('追加しました')
      setTimeout(() => setSaved(null), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleSetDefault = async (id: string) => {
    const res = await fetch(`/api/admin/preset-avatars/${id}`, { method: 'PATCH' })
    if (res.ok) {
      setPresets(prev => prev.map(p => ({ ...p, is_default: p.id === id })))
      setSaved('デフォルトを設定しました')
      setTimeout(() => setSaved(null), 2000)
    }
  }

  const handleDelete = async (preset: Preset) => {
    if (!confirm('このプリセット画像を削除しますか？')) return
    const res = await fetch(`/api/admin/preset-avatars/${preset.id}`, { method: 'DELETE' })
    if (res.ok) setPresets(prev => prev.filter(p => p.id !== preset.id))
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">アバター管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">プリセット画像の追加・デフォルト設定</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
          <Upload size={15} />
          {uploading ? 'アップロード中...' : '画像を追加'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
      </div>

      {saved && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl px-4 py-3 text-sm">
          <Check size={14} /> {saved}
        </div>
      )}
      {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : presets.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
          プリセット画像がまだありません。画像を追加してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {presets.map(p => (
            <div key={p.id} className={`glass rounded-2xl p-3 space-y-3 ${p.is_default ? 'border-violet-500/50' : ''}`}>
              <div className="relative">
                <img src={p.url} alt="" className="w-full aspect-square object-cover rounded-xl" />
                {p.is_default && (
                  <span className="absolute top-2 left-2 bg-violet-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star size={9} fill="currentColor" /> デフォルト
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {!p.is_default && (
                  <button
                    onClick={() => handleSetDefault(p.id)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-violet-500/40 py-1.5 rounded-lg transition-colors">
                    <Star size={11} /> デフォルト
                  </button>
                )}
                <button
                  onClick={() => handleDelete(p)}
                  className="flex items-center justify-center w-8 text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-2xl p-5 space-y-2">
        <p className="text-sm font-bold text-white">デフォルト画像について</p>
        <p className="text-xs text-[#8888aa] leading-relaxed">
          「デフォルト」に設定した画像は、新規登録ユーザーのアバターとして自動で設定されます。
          ユーザーはマイページからいつでも変更できます。
        </p>
      </div>
    </div>
  )
}
