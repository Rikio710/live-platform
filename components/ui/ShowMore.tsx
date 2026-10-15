'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

/**
 * 並べた要素を最初の initial 件だけ表示し、「ほか○組を表示」で広げる（もう一度押すと畳む）。
 * 複数出演の公演・ツアーで出演者が数十組になっても、ページが長くならないようにする（2026-10-15）
 *   inline=false（既定）: 縦に並ぶ一覧の下に、中央寄せのボタン
 *   inline=true: アーティスト名のチップ等、横に並ぶものの最後にボタンを並べる
 */
export default function ShowMore({ items, initial, unit = '組', moreLabel, inline = false, className = '', buttonClassName = '' }: {
  items: React.ReactNode[]
  initial: number
  unit?: string
  /** ボタンの文言を指定する場合（例: 「ほか85公演を表示」）。省略時は「ほか{残りの件数}{unit}を表示」 */
  moreLabel?: string
  inline?: boolean
  className?: string
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const rest = items.length - initial
  const label = open ? '閉じる' : (moreLabel ?? `ほか${rest}${unit}を表示`)
  const Icon = open ? ChevronUp : ChevronDown
  const button = rest > 0 && (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      aria-expanded={open}
      className={buttonClassName || (inline
        ? 'inline-flex items-center gap-1 text-xs text-[#b3b3b3] hover:text-white bg-white/5 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors'
        : 'inline-flex items-center gap-1.5 text-sm text-[#b3b3b3] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-5 py-2 transition-colors')}
    >
      {label}
      <Icon size={14} />
    </button>
  )
  const shown = open || rest <= 0 ? items : items.slice(0, initial)
  if (inline) {
    return <div className={className}>{shown}{button}</div>
  }
  return (
    <>
      <div className={className}>{shown}</div>
      {button && <div className="flex justify-center pt-1">{button}</div>}
    </>
  )
}
