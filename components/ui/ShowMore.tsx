'use client'

import { useState } from 'react'

/**
 * 並べた要素を最初の initial 件だけ表示し、「ほか○組を表示」で広げる（もう一度押すと畳む）。
 * 複数出演の公演・ツアーで出演者が数十組になっても、ページが長くならないようにする（2026-10-15）
 */
export default function ShowMore({ items, initial, unit = '組', className = '', buttonClassName = '' }: {
  items: React.ReactNode[]
  initial: number
  unit?: string
  className?: string
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const rest = items.length - initial
  return (
    <div className={className}>
      {(open || rest <= 0 ? items : items.slice(0, initial))}
      {rest > 0 && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className={buttonClassName || 'text-xs text-[#8888aa] hover:text-white border border-dashed border-white/15 hover:border-white/30 rounded-full px-3 py-1.5 transition-colors'}
        >
          {open ? '閉じる' : `ほか${rest}${unit}を表示`}
        </button>
      )}
    </div>
  )
}
