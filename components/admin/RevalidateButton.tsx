'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { adminRevalidateAll } from '@/app/admin/actions'

/** 管理画面での変更をすぐ公開ページに反映する（ページは最大1時間キャッシュされるため） */
export default function RevalidateButton() {
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle')
  const run = async () => {
    setState('running')
    try {
      await adminRevalidateAll()
      setState('done')
      setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('idle')
    }
  }
  return (
    <button
      onClick={run}
      disabled={state === 'running'}
      title="管理画面での変更をすぐ公開ページに反映します（通常は最大1時間で自動反映）"
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#8888aa] hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
    >
      <RefreshCw size={16} className={state === 'running' ? 'animate-spin' : ''} />
      <span>{state === 'done' ? '反映しました' : 'サイト表示を更新'}</span>
    </button>
  )
}
