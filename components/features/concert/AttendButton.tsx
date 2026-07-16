'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { gtagEvent } from '@/lib/gtag'

export default function AttendButton({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [attended, setAttended] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('attendances')
        .select('id')
        .eq('concert_id', concertId)
        .eq('user_id', user.id)
        .maybeSingle()
      setAttended(!!data)
      setLoading(false)
    }
    init()
  }, [concertId])

  const openPrompt = () => {
    setShowPrompt(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
  }

  const closePrompt = () => {
    setVisible(false)
    setTimeout(() => setShowPrompt(false), 200)
  }

  const toggle = async () => {
    if (!userId) {
      gtagEvent('attended_click', { login_status: 'guest' })
      openPrompt()
      return
    }
    setLoading(true)
    try {
      if (attended) {
        const { error } = await supabase.from('attendances').delete()
          .eq('concert_id', concertId).eq('user_id', userId)
        if (error) throw error
        setAttended(false)
      } else {
        const { error } = await supabase.from('attendances').insert({ concert_id: concertId, user_id: userId })
        if (error) throw error
        gtagEvent('attended_click', { login_status: 'member' })
        setAttended(true)
      }
      router.refresh()
    } catch {
      alert('操作に失敗しました。再試行してください。')
    } finally {
      setLoading(false)
    }
  }

  const modal = showPrompt ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: `rgba(0,0,0,${visible ? 0.7 : 0})`,
        backdropFilter: `blur(${visible ? 8 : 0}px)`,
        transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
      }}
      onClick={closePrompt}
    >
      <div
        className="relative bg-[#12121a] border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(12px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={closePrompt}
          className="absolute top-4 right-4 text-[#8888aa] hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="mb-6">
          <h2 className="text-lg font-black text-white mb-1">参戦を記録しますか？</h2>
          <p className="text-sm text-[#8888aa] leading-relaxed">
            無料アカウントを作ると、参戦記録の保存・セトリ投稿・他のユーザーとの交流ができます。
          </p>
        </div>

        <div className="space-y-2">
          <Link
            href="/login"
            className="block w-full bg-white text-black text-sm font-bold py-3 rounded-full text-center hover:bg-[#e0e0e0] transition-colors"
          >
            アカウント登録 / ログイン
          </Link>
          <button
            onClick={closePrompt}
            className="block w-full text-[#8888aa] hover:text-white text-sm py-2 transition-colors"
          >
            今はしない
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        onClick={toggle}
        disabled={loading}
        className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all ${
          attended
            ? 'bg-white text-black hover:bg-[#e0e0e0]'
            : 'border border-white/30 text-[#b3b3b3] hover:bg-white/5'
        } disabled:opacity-50`}
      >
        {attended ? <Check size={15} /> : <Plus size={15} />}
        <span>{attended ? '参戦済み' : '参戦登録'}</span>
      </button>

      {mounted && createPortal(modal, document.body)}
    </>
  )
}
