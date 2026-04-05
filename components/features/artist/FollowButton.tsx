'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'

export default function FollowButton({ artistId }: { artistId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('artist_follows')
        .select('id')
        .eq('artist_id', artistId)
        .eq('user_id', user.id)
        .maybeSingle()
      setFollowing(!!data)
      setLoading(false)
    }
    init()
  }, [artistId])

  const toggle = async () => {
    if (!userId) { router.push('/login'); return }
    setLoading(true)
    if (following) {
      await supabase.from('artist_follows').delete()
        .eq('artist_id', artistId).eq('user_id', userId)
      setFollowing(false)
    } else {
      await supabase.from('artist_follows').insert({ artist_id: artistId, user_id: userId })
      setFollowing(true)
    }
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all disabled:opacity-50 ${
        following
          ? 'bg-pink-600/20 border border-pink-500/40 text-pink-400 hover:bg-pink-600/30'
          : 'border border-white/15 text-[#8888aa] hover:text-white hover:border-white/30'
      }`}
    >
      <Heart size={14} className={following ? 'fill-pink-400' : ''} />
      {following ? 'フォロー中' : 'フォロー'}
    </button>
  )
}
