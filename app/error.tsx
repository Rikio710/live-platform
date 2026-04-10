'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-bold text-white">エラーが発生しました</p>
          <p className="text-sm text-[#8888aa]">
            データの読み込みに失敗しました。時間をおいて再試行してください。
          </p>
        </div>
        <button
          onClick={reset}
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-2.5 rounded-full text-sm transition-colors"
        >
          再試行
        </button>
      </div>
    </div>
  )
}
