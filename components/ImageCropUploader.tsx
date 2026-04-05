'use client'

import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { createClient } from '@/lib/supabase/client'
import { Upload, Crop, Check, X } from 'lucide-react'

interface Area {
  x: number; y: number; width: number; height: number
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = imageSrc
  })
  const canvas = document.createElement('canvas')
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height)
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.9))
}

interface Props {
  onUpload: (url: string) => void
  onCancel: () => void
}

export default function ImageCropUploader({ onUpload, onCancel }: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setUploading(true)
    setError(null)
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const filename = `merch-${Date.now()}.jpg`
      const { error: err } = await supabase.storage
        .from('merch-images')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: false })
      if (err) throw err
      const { data } = supabase.storage.from('merch-images').getPublicUrl(filename)
      onUpload(data.publicUrl)
    } catch {
      setError('アップロードに失敗しました')
    } finally {
      setUploading(false)
    }
  }

  if (!imageSrc) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-white/15 rounded-xl py-6 flex flex-col items-center gap-2 text-[#8888aa] hover:border-violet-500/40 hover:text-white transition-colors"
        >
          <Upload size={20} />
          <span className="text-sm">画像ファイルを選択</span>
          <span className="text-xs opacity-60">JPG / PNG / WebP（最大5MB）</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <button type="button" onClick={onCancel} className="text-xs text-[#8888aa] hover:text-white transition-colors">
          URLで指定する →
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative w-full h-56 rounded-xl overflow-hidden bg-black">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#8888aa]">ズーム</span>
        <input
          type="range" min={1} max={3} step={0.05}
          value={zoom} onChange={e => setZoom(Number(e.target.value))}
          className="flex-1 accent-violet-500"
        />
      </div>
      <p className="text-xs text-[#8888aa]">切り取りたい範囲をドラッグで調整</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => { setImageSrc(null); onCancel() }}
          className="flex-1 flex items-center justify-center gap-1 border border-white/10 text-[#8888aa] hover:text-white py-2 rounded-xl text-sm transition-colors">
          <X size={14} /> キャンセル
        </button>
        <button type="button" onClick={handleUpload} disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-sm transition-colors">
          <Check size={14} /> {uploading ? 'アップロード中...' : 'この範囲で確定'}
        </button>
      </div>
    </div>
  )
}
