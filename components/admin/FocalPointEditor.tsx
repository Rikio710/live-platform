'use client'

import { useState, useRef, useCallback } from 'react'

type Artist = {
  id: string
  name: string
  image_url: string
  image_crop_x: number | null
  image_crop_y: number | null
  image_crop_scale: number | null
}

export default function FocalPointEditor({ artist }: { artist: Artist }) {
  const [x, setX] = useState(artist.image_crop_x ?? 50)
  const [y, setY] = useState(artist.image_crop_y ?? 50)
  const [scale, setScale] = useState(artist.image_crop_scale ?? 1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const nx = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)))
    const ny = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)))
    setX(nx)
    setY(ny)
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true
    containerRef.current?.setPointerCapture(e.pointerId)
    updateFromPointer(e.clientX, e.clientY)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    updateFromPointer(e.clientX, e.clientY)
  }
  const handlePointerUp = () => { dragging.current = false }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    const res = await fetch(`/api/admin/artists/${artist.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_crop_x: x, image_crop_y: y, image_crop_scale: scale }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      const err = await res.json().catch(() => ({}))
      setSaveError(err.error ?? `エラー (${res.status})`)
    }
  }

  const pos = `${x}% ${y}%`
  const bgSize = `${scale * 100}%`

  return (
    <div className="space-y-5 p-4">
      {/* エディタ + プレビュー：PC は横並び */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* 左：編集エリア */}
        <div className="flex-1 space-y-3">
          <p className="text-xs font-bold text-[#8888aa] uppercase tracking-wider">焦点を設定（タップ・ドラッグ）</p>
          <div
            ref={containerRef}
            className="relative w-full rounded-xl overflow-hidden cursor-crosshair select-none touch-none bg-[#282828]"
            style={{ aspectRatio: '4/3' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              src={artist.image_url}
              alt={artist.name}
              className="w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: pos }}
              draggable={false}
            />
            {/* グリッド */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '33.33% 33.33%',
              }}
            />
            {/* 焦点インジケーター */}
            <div
              className="absolute pointer-events-none"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}
            >
              <div className="relative w-8 h-8">
                <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg bg-black/20" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white" style={{ transform: 'translateY(-0.5px)' }} />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white" style={{ transform: 'translateX(-0.5px)' }} />
              </div>
            </div>
          </div>

          {/* ズームスライダー */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-xs text-[#8888aa]">ズーム（丸アイコン用）</p>
              <span className="text-xs text-white font-mono">{scale.toFixed(1)}×</span>
            </div>
            <input
              type="range" min={1} max={3} step={0.1}
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-white text-black text-sm font-bold transition-colors disabled:opacity-50 hover:bg-[#e0e0e0]"
          >
            {saved ? '保存しました ✓' : saving ? '保存中...' : '保存'}
          </button>
          {saveError && (
            <p className="text-xs text-red-400 text-center">{saveError}</p>
          )}
        </div>

        {/* 右：プレビュー */}
        <div className="lg:w-64 space-y-5">
          {/* SP プレビュー */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#8888aa] uppercase tracking-wider flex items-center gap-2">
              <span className="bg-white/10 text-[10px] px-1.5 py-0.5 rounded">SP</span> プレビュー
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 text-center">
                {/* 丸 - フォロー一覧 */}
                <div className="w-12 h-12 rounded-full overflow-hidden mx-auto"
                  style={{ backgroundImage: `url(${artist.image_url})`, backgroundSize: bgSize, backgroundPosition: pos, backgroundRepeat: 'no-repeat' }}
                />
                <p className="text-[9px] text-[#555577]">フォロー</p>
              </div>
              <div className="space-y-1.5 text-center">
                {/* 正方形 - カード */}
                <img src={artist.image_url} alt=""
                  className="w-12 h-12 rounded-xl object-cover mx-auto"
                  style={{ objectPosition: pos }} />
                <p className="text-[9px] text-[#555577]">カード</p>
              </div>
              <div className="space-y-1.5 text-center">
                {/* 丸大 - アーティストページ */}
                <div className="w-12 h-12 rounded-full overflow-hidden mx-auto"
                  style={{ backgroundImage: `url(${artist.image_url})`, backgroundSize: bgSize, backgroundPosition: pos, backgroundRepeat: 'no-repeat' }}
                />
                <p className="text-[9px] text-[#555577]">アーティスト</p>
              </div>
            </div>
            {/* 横長 - ホーム */}
            <div className="space-y-1.5">
              <img src={artist.image_url} alt=""
                className="w-full h-20 rounded-xl object-cover"
                style={{ objectPosition: pos }} />
              <p className="text-[9px] text-[#555577] text-center">ホーム横長カード</p>
            </div>
          </div>

          {/* PC プレビュー */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-[#8888aa] uppercase tracking-wider flex items-center gap-2">
              <span className="bg-white/10 text-[10px] px-1.5 py-0.5 rounded">PC</span> プレビュー
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 text-center">
                {/* 丸 大 */}
                <div className="w-16 h-16 rounded-full overflow-hidden mx-auto"
                  style={{ backgroundImage: `url(${artist.image_url})`, backgroundSize: bgSize, backgroundPosition: pos, backgroundRepeat: 'no-repeat' }}
                />
                <p className="text-[9px] text-[#555577]">フォロー</p>
              </div>
              <div className="space-y-1.5 text-center">
                {/* 正方形 */}
                <img src={artist.image_url} alt=""
                  className="w-16 h-16 rounded-xl object-cover mx-auto"
                  style={{ objectPosition: pos }} />
                <p className="text-[9px] text-[#555577]">アーティスト</p>
              </div>
            </div>
            {/* アーティストページ横長 */}
            <div className="space-y-1.5">
              <img src={artist.image_url} alt=""
                className="w-full h-28 rounded-xl object-cover"
                style={{ objectPosition: pos }} />
              <p className="text-[9px] text-[#555577] text-center">アーティストページ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
