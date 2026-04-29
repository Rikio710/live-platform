'use client'

import { useState } from 'react'
import { X, Link2, Check } from 'lucide-react'

type Song = {
  song_name: string
  song_type: string
  is_encore: boolean
}

type Props = {
  isOpen: boolean
  onClose: () => void
  url: string
  title: string      // 例: "嵐 東京ドーム 4/1"
  songs?: Song[]     // セトリシェア時のみ渡す
}

export default function ShareModal({ isOpen, onClose, url, title, songs }: Props) {
  const [copied, setCopied] = useState<'url' | 'setlist' | null>(null)

  if (!isOpen) return null

  const copyToClipboard = async (text: string, type: 'url' | 'setlist') => {
    await navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  // X (Twitter) シェアテキスト生成
  const buildXText = () => {
    if (!songs || songs.length === 0) {
      return `${title} の公演ページ #LiveVault`
    }
    const songList = songs.filter(s => s.song_type === 'song')
    // 280字制限を考慮してタイトル + 曲数 + URL
    return `【セトリ】${title}\n全${songList.length}曲 #LiveVault`
  }

  // セトリテキスト生成（クリップボードコピー用）
  const buildSetlistText = () => {
    if (!songs) return ''
    let counter = 0
    const lines: string[] = [`【セトリ】${title}`, '']
    let inEncore = false
    for (const s of songs) {
      if (s.is_encore && !inEncore) {
        inEncore = true
        lines.push('--- アンコール ---')
      }
      if (s.song_type === 'song') {
        counter++
        lines.push(`${counter}. ${s.song_name}`)
      } else {
        lines.push(`— ${s.song_name}`)
      }
    }
    lines.push('', url)
    return lines.join('\n')
  }

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildXText())}&url=${encodeURIComponent(url)}`
  const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`

  return (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* モーダル */}
      <div className="fixed inset-x-4 bottom-20 sm:inset-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[60] sm:w-80">
        <div className="bg-[#16162a] border border-white/10 rounded-2xl p-5 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">シェア</h3>
            <button onClick={onClose} className="text-[#8888aa] hover:text-white transition-colors p-1">
              <X size={16} />
            </button>
          </div>

          <div className="space-y-2">
            {/* X */}
            <a
              href={xUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="text-sm font-bold text-white">X（Twitter）でシェア</span>
            </a>

            {/* LINE */}
            <a
              href={lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#06C755] shrink-0" aria-hidden="true">
                <path d="M12 2C6.48 2 2 6.03 2 11c0 3.16 1.68 5.96 4.3 7.72V22l3.96-2.18c.56.15 1.14.23 1.74.23 5.52 0 10-4.03 10-9S17.52 2 12 2zm1.06 12.13l-2.54-2.71-4.96 2.71 5.45-5.79 2.6 2.71 4.9-2.71-5.45 5.79z" />
              </svg>
              <span className="text-sm font-bold text-white">LINEでシェア</span>
            </a>

            {/* URL コピー */}
            <button
              onClick={() => copyToClipboard(url, 'url')}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              {copied === 'url'
                ? <Check size={20} className="text-green-400 shrink-0" />
                : <Link2 size={20} className="text-[#8888aa] shrink-0" />
              }
              <span className={`text-sm font-bold transition-colors ${copied === 'url' ? 'text-green-400' : 'text-white'}`}>
                {copied === 'url' ? 'コピーしました！' : 'URLをコピー'}
              </span>
            </button>

            {/* セトリテキストコピー（セトリがある場合のみ） */}
            {songs && songs.length > 0 && (
              <button
                onClick={() => copyToClipboard(buildSetlistText(), 'setlist')}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                {copied === 'setlist'
                  ? <Check size={20} className="text-green-400 shrink-0" />
                  : <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#8888aa] shrink-0" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                }
                <span className={`text-sm font-bold transition-colors ${copied === 'setlist' ? 'text-green-400' : 'text-white'}`}>
                  {copied === 'setlist' ? 'コピーしました！' : 'セトリをテキストでコピー'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
