'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, Plus } from 'lucide-react'

export default function AttendButton({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [attended, setAttended] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

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

  const toggle = async () => {
    if (!userId) { router.push('/login'); return }
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
        setAttended(true)
      }
      router.refresh()
    } catch {
      alert('操作に失敗しました。再試行してください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all ${
        attended
          ? 'bg-violet-600 text-white hover:bg-violet-700'
          : 'border border-violet-500/50 text-violet-300 hover:bg-violet-500/10'
      } disabled:opacity-50`}
    >
      {attended ? <Check size={15} /> : <Plus size={15} />}
      <span>{attended ? '参戦済み' : '参戦登録'}</span>
    </button>
  )
}
