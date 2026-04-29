'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Cropper from 'react-easy-crop'
import { createClient } from '@/lib/supabase/client'
import { Camera, Upload, Check, X } from 'lucide-react'

interface Area { x: number; y: number; width: number; height: number }

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const size = Math.min(pixelCrop.width, pixelCrop.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, size, size, 0, 0, size, size)
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.9))
}

interface Props {
  userId: string
  initialAvatarUrl: string | null
}

export default function AvatarEditor({ userId, initialAvatarUrl }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'upload' | 'preset'>('preset')
  const [presets, setPresets] = useState<{ id: string; url: string; is_default: boolean }[]>([])
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      fetch('/api/admin/preset-avatars').then(r => r.json()).then(setPresets).catch(() => {})
    }
  }, [open])

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setImageSrc(reader.result as string); setTab('upload') }
    reader.readAsDataURL(file)
  }

  const handleUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setSaving(true); setError(null)
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const path = `users/${userId}/avatar.jpg`
      const { error: storageErr } = await supabase.storage.from('avatars').upload(path, blob, {
        contentType: 'image/jpeg', upsert: true,
      })
      if (storageErr) throw storageErr
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      await saveAvatar(url)
    } catch {
      setError('アップロードに失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const handleSelectPreset = async (url: string) => {
    setSaving(true); setError(null)
    try { await saveAvatar(url) }
    catch { setError('保存に失敗しました') }
    finally { setSaving(false) }
  }

  const saveAvatar = async (url: string) => {
    const res = await fetch('/api/profile/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: url }),
    })
    if (!res.ok) throw new Error('保存失敗')
    setAvatarUrl(url)
    setOpen(false)
    setImageSrc(null)
  }

  return (
    <>
      {/* アバター表示 + 変更ボタン */}
      <button onClick={() => setOpen(true)} className="relative group shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-800 to-pink-800 flex items-center justify-center">
            <span className="text-2xl font-black text-white">?</span>
          </div>
        )}
        <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={20} className="text-white" />
        </div>
      </button>

      {/* モーダル */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70" onClick={() => { setOpen(false); setImageSrc(null) }}>
          <div className="bg-[#13131f] border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">アバターを変更</h2>
              <button onClick={() => { setOpen(false); setImageSrc(null) }} className="text-[#8888aa] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* タブ */}
            <div className="flex rounded-xl bg-white/5 p-1 gap-1">
              {(['preset', 'upload'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 text-sm font-bold py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-violet-600 text-white' : 'text-[#8888aa] hover:text-white'}`}>
                  {t === 'preset' ? 'プリセットから選ぶ' : 'ライブラリから選ぶ'}
                </button>
              ))}
            </div>

            {tab === 'preset' && (
              <div>
                {presets.length === 0 ? (
                  <p className="text-sm text-[#8888aa] text-center py-4">プリセット画像がまだありません</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {presets.map(p => (
                      <button key={p.id} onClick={() => handleSelectPreset(p.url)} disabled={saving}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-colors hover:border-violet-500 ${avatarUrl === p.url ? 'border-violet-500' : 'border-transparent'}`}>
                        <img src={p.url} alt="" className="w-full h-full object-cover" />
                        {avatarUrl === p.url && (
                          <div className="absolute inset-0 bg-violet-600/40 flex items-center justify-center">
                            <Check size={16} className="text-white" />
                          </div>
                        )}
                        {p.is_default && (
                          <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-white py-0.5">デフォルト</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'upload' && (
              <div className="space-y-3">
                {!imageSrc ? (
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full border-2 border-dashed border-white/15 rounded-xl py-8 flex flex-col items-center gap-2 text-[#8888aa] hover:border-violet-500/40 hover:text-white transition-colors">
                    <Upload size={20} />
                    <span className="text-sm">画像を選択</span>
                    <span className="text-xs opacity-60">JPG / PNG / WebP</span>
                  </button>
                ) : (
                  <>
                    <div className="relative w-full h-52 rounded-xl overflow-hidden bg-black">
                      <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#8888aa]">ズーム</span>
                      <input type="range" min={1} max={3} step={0.05} value={zoom}
                        onChange={e => setZoom(Number(e.target.value))} className="flex-1 accent-violet-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setImageSrc(null)}
                        className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2 rounded-xl text-sm transition-colors">
                        やり直す
                      </button>
                      <button onClick={handleUpload} disabled={saving}
                        className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm transition-colors">
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  )
}
