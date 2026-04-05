'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Post = {
  id: string
  content: string
  is_spoiler: boolean
  likes_count: number
  created_at: string
  profiles: { username: string | null } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}時間前`
  return new Date(dateStr).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
}

function PostCard({ post, onLike, onReport }: {
  post: Post
  onLike: (id: string) => void
  onReport: (id: string) => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [liked, setLiked] = useState(false)

  const handleLike = () => {
    setLiked(!liked)
    onLike(post.id)
  }

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-800/60 flex items-center justify-center text-xs font-bold text-violet-300">
            {(post.profiles?.username ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <span className="text-xs text-[#8888aa]">{post.profiles?.username ?? '匿名'}</span>
          {post.is_spoiler && (
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/20 rounded-full px-1.5 py-0.5">
              ネタバレ
            </span>
          )}
        </div>
        <span className="text-xs text-[#8888aa]">{timeAgo(post.created_at)}</span>
      </div>

      <div className={`relative ${post.is_spoiler && !revealed ? 'spoiler-blur' : ''}`}>
        <p className="text-sm text-white leading-relaxed">{post.content}</p>
      </div>

      {post.is_spoiler && !revealed && (
        <button
          onClick={() => setRevealed(true)}
          className="text-xs text-violet-400 hover:text-violet-300 underline"
        >
          ⚠ ネタバレを表示する
        </button>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'text-pink-400' : 'text-[#8888aa] hover:text-pink-400'}`}
        >
          <span>{liked ? '♥' : '♡'}</span>
          <span>{post.likes_count + (liked ? 1 : 0)}</span>
        </button>
        <button
          onClick={() => onReport(post.id)}
          className="text-xs text-[#8888aa] hover:text-red-400 transition-colors ml-auto"
        >
          通報
        </button>
      </div>
    </div>
  )
}

export default function BoardTab({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [isSpoiler, setIsSpoiler] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const { data } = await supabase
        .from('board_posts')
        .select('id, content, is_spoiler, likes_count, created_at, profiles(username)')
        .eq('concert_id', concertId)
        .order('created_at', { ascending: false })
        .limit(50)
      setPosts((data as any) ?? [])
      setLoading(false)
    }
    init()

    // Realtime subscription
    channelRef.current = supabase
      .channel(`board-${concertId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_posts', filter: `concert_id=eq.${concertId}` },
        async (payload: any) => {
          const { data } = await supabase
            .from('board_posts')
            .select('id, content, is_spoiler, likes_count, created_at, profiles(username)')
            .eq('id', payload.new.id)
            .single()
          if (data) setPosts(prev => [data as any, ...prev])
        }
      )
      .subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [concertId])

  const handleSubmit = async () => {
    if (!content.trim()) return
    if (!userId) { router.push('/login'); return }
    setSubmitting(true)
    await supabase.from('board_posts').insert({
      concert_id: concertId,
      user_id: userId,
      content: content.trim(),
      is_spoiler: isSpoiler,
    })
    setContent('')
    setIsSpoiler(false)
    setSubmitting(false)
  }

  const handleLike = async (postId: string) => {
    if (!userId) return
    await fetch(`/api/board-posts/${postId}/like`, { method: 'POST' })
  }

  const handleReport = async (postId: string) => {
    if (!userId) { router.push('/login'); return }
    if (confirm('この投稿を通報しますか？')) {
      await fetch(`/api/board-posts/${postId}/report`, { method: 'POST' })
      alert('通報しました')
    }
  }

  return (
    <div className="space-y-4">
      {/* 投稿フォーム */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={userId ? '今どんな状況？情報を共有しよう...' : 'ログインして投稿する'}
          disabled={!userId}
          rows={2}
          className="w-full bg-transparent text-sm text-white placeholder-[#8888aa] resize-none focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-[#8888aa] cursor-pointer">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={e => setIsSpoiler(e.target.checked)}
              className="accent-violet-500"
            />
            ネタバレあり
          </label>
          <button
            onClick={handleSubmit}
            disabled={submitting || !content.trim() || !userId}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-full transition-colors"
          >
            {submitting ? '投稿中...' : '投稿'}
          </button>
        </div>
      </div>

      {/* 投稿一覧 */}
      {loading ? (
        <div className="text-center text-[#8888aa] text-sm py-6">読み込み中...</div>
      ) : posts.length === 0 ? (
        <div className="text-center text-[#8888aa] text-sm py-8">まだ投稿がありません。最初の投稿者になろう！</div>
      ) : (
        <div className="space-y-3">
          {posts.map(p => (
            <PostCard key={p.id} post={p} onLike={handleLike} onReport={handleReport} />
          ))}
        </div>
      )}
    </div>
  )
}
