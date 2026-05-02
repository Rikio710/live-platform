'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Plus, Heart, MessageCircle, MoreHorizontal, Image, X, EyeOff, Eye, Trash2 } from 'lucide-react'
import { getGuestIdentity, readGuestId } from '@/lib/guestId'
import type { RealtimePostgresInsertPayload } from '@supabase/realtime-js'
import type { Tables } from '@/types/supabase'

const CATEGORIES = [
  { value: 'all', label: '全て' },
  { value: 'merch', label: '物販' },
  { value: 'question', label: '質問' },
  { value: 'trade', label: '交換' },
  { value: 'chat', label: '雑談' },
]
const POST_CATEGORIES = CATEGORIES.filter(c => c.value !== 'all')

const CAT_STYLE: Record<string, string> = {
  merch: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
  question: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
  trade: 'border-green-500/40 text-green-400 bg-green-500/10',
  chat: 'border-white/10 text-[#8888aa] bg-white/5',
}

type Post = {
  id: string
  user_id: string
  content: string
  category: string
  is_spoiler: boolean
  media_url: string | null
  media_type: 'image' | 'video' | null
  likes_count: number
  created_at: string
  guest_name?: string | null
  profiles: { username: string | null; avatar_url: string | null } | null
  myLike?: boolean
  comment_count?: number
}

type Comment = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  guest_name?: string | null
  profiles: { username: string | null; avatar_url: string | null } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'たった今'
  if (m < 60) return `${m}分前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}時間前`
  return `${Math.floor(h / 24)}日前`
}

export default function BoardTab({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [guestUserId, setGuestUserId] = useState<string | null>(null)
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set())
  const [myUsername, setMyUsername] = useState<string | null>(null)
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Comments
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [commentInput, setCommentInput] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Post modal
  const [showModal, setShowModal] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postCategory, setPostCategory] = useState('chat')
  const [postIsSpoiler, setPostIsSpoiler] = useState(false)
  const [postMedia, setPostMedia] = useState<File | null>(null)
  const [postMediaPreview, setPostMediaPreview] = useState<string | null>(null)
  const [postMediaType, setPostMediaType] = useState<'image' | 'video' | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  // UI state
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null)
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set())
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUserId(user?.id ?? null)
        if (!user) setGuestUserId(readGuestId())

        if (user) {
          const { data: blocks } = await supabase
            .from('user_blocks').select('blocked_id').eq('blocker_id', user.id)
          if (blocks) setBlockedIds(new Set(blocks.map((b) => b.blocked_id)))

          const { data: prof } = await supabase
            .from('profiles').select('username, avatar_url').eq('id', user.id).single()
          setMyUsername(prof?.username ?? null)
          setMyAvatarUrl(prof?.avatar_url ?? null)
        }

        await loadPosts(concertId, user?.id ?? null)
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    init()

    channelRef.current = supabase
      .channel(`board-${concertId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_posts', filter: `concert_id=eq.${concertId}` },
        async (payload: RealtimePostgresInsertPayload<Tables<'board_posts'>>) => {
          const p = payload.new
          const { data: prof } = await supabase
            .from('profiles').select('username, avatar_url').eq('id', p.user_id).single()
          setPosts(prev => [{
            ...p,
            profiles: { username: prof?.username ?? null, avatar_url: prof?.avatar_url ?? null },
            myLike: false, comment_count: 0,
          } as Post, ...prev])
        }
      ).subscribe()

    return () => { channelRef.current?.unsubscribe() }
  }, [concertId])

  const loadPosts = async (cid: string, uid: string | null) => {
    const { data } = await supabase
      .from('board_posts')
      .select('id, concert_id, user_id, content, category, media_url, media_type, is_spoiler, likes_count, created_at, guest_name')
      .eq('concert_id', cid)
      .order('created_at', { ascending: false })
      .limit(100)
    if (!data || data.length === 0) { setPosts([]); return }

    // Fetch profiles separately
    const userIds = [...new Set(data.map((p) => p.user_id))]
    const { data: profilesData } = await supabase
      .from('profiles').select('id, username, avatar_url').in('id', userIds)
    const profileMap: Record<string, { username: string | null; avatar_url: string | null }> = {}
    for (const p of profilesData ?? []) profileMap[p.id] = { username: p.username, avatar_url: p.avatar_url }

    let enriched: Post[] = data.map((p) => ({
      ...p,
      is_spoiler: p.is_spoiler ?? false,
      likes_count: p.likes_count ?? 0,
      media_type: p.media_type as 'image' | 'video' | null,
      created_at: p.created_at ?? new Date().toISOString(),
      guest_name: p.guest_name ?? null,
      profiles: { username: profileMap[p.user_id]?.username ?? null, avatar_url: profileMap[p.user_id]?.avatar_url ?? null },
    }))

    if (uid) {
      const { data: likes } = await supabase
        .from('post_likes').select('post_id').eq('user_id', uid)
        .in('post_id', data.map((p) => p.id))
      const likedSet = new Set(likes?.map((l) => l.post_id) ?? [])
      enriched = enriched.map(p => ({ ...p, myLike: likedSet.has(p.id) }))
    }

    if (data.length > 0) {
      try {
        const { data: cc } = await supabase
          .from('post_comments').select('post_id')
          .in('post_id', data.map((p) => p.id))
        const countMap: Record<string, number> = {}
        for (const c of cc ?? []) countMap[c.post_id] = (countMap[c.post_id] ?? 0) + 1
        enriched = enriched.map(p => ({ ...p, comment_count: countMap[p.id] ?? 0 }))
      } catch { /* post_comments未作成の場合は無視 */ }
    }

    setPosts(enriched)
  }

  const handleLike = async (post: Post) => {
    if (userId) {
      if (post.myLike) {
        await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', userId)
        await supabase.rpc('decrement_likes', { post_id: post.id })
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myLike: false, likes_count: Math.max(0, p.likes_count - 1) } : p))
      } else {
        await supabase.from('post_likes').insert({ post_id: post.id, user_id: userId })
        await supabase.rpc('increment_likes', { post_id: post.id })
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myLike: true, likes_count: p.likes_count + 1 } : p))
      }
    } else {
      // ゲスト: セッション内でのみ追跡、DBはカウンターのみ更新
      const isLiked = likedPostIds.has(post.id)
      if (isLiked) {
        setLikedPostIds(prev => { const s = new Set(prev); s.delete(post.id); return s })
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myLike: false, likes_count: Math.max(0, p.likes_count - 1) } : p))
      } else {
        setLikedPostIds(prev => new Set([...prev, post.id]))
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, myLike: true, likes_count: p.likes_count + 1 } : p))
      }
      fetch('/api/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'like_post', post_id: post.id, action_type: isLiked ? 'unlike' : 'like' }),
      })
    }
  }

  const loadComments = async (postId: string) => {
    if (comments[postId]) return
    const { data } = await supabase
      .from('post_comments').select('id, post_id, user_id, content, created_at, guest_name')
      .eq('post_id', postId).order('created_at', { ascending: true })
    if (!data) return
    const userIds = [...new Set(data.map((c) => c.user_id))]
    const { data: profs } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
    const pm: Record<string, { username: string | null; avatar_url: string | null }> = {}
    for (const p of profs ?? []) pm[p.id] = { username: p.username, avatar_url: p.avatar_url }
    setComments(prev => ({
      ...prev,
      [postId]: data.map((c) => ({
        ...c,
        guest_name: c.guest_name ?? null,
        profiles: { username: pm[c.user_id]?.username ?? null, avatar_url: pm[c.user_id]?.avatar_url ?? null },
      })) as Comment[]
    }))
  }

  const toggleComments = async (postId: string) => {
    if (expandedPostId === postId) { setExpandedPostId(null); return }
    setExpandedPostId(postId)
    setCommentInput('')
    await loadComments(postId)
  }

  const handleComment = async (postId: string) => {
    if (!commentInput.trim()) return
    setSubmittingComment(true)
    const guestInfo = !userId ? getGuestIdentity() : null
    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'comment', post_id: postId, content: commentInput.trim(), ...(guestInfo ?? {}) }),
    })
    if (res.ok) {
      const { comment: data, displayName } = await res.json()
      if (data) {
        setComments(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), { ...data, profiles: { username: displayName ?? myUsername, avatar_url: displayName ? null : myAvatarUrl } } as Comment] }))
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: (p.comment_count ?? 0) + 1 } : p))
        setCommentInput('')
      }
    }
    setSubmittingComment(false)
  }

  const deleteRecord = async (table: string, recordId: string) => {
    const guestInfo = !userId && guestUserId ? { guest_user_id: guestUserId } : null
    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', table, record_id: recordId, ...(guestInfo ?? {}) }),
    })
    return res.ok
  }

  const handleDeletePost = async (postId: string) => {
    if (!confirm('この投稿を削除しますか？')) return
    const ok = await deleteRecord('board_posts', postId)
    if (!ok) return
    setPosts(prev => prev.filter(p => p.id !== postId))
    setOpenMenuPostId(null)
    if (expandedPostId === postId) setExpandedPostId(null)
  }

  const handleDeleteComment = async (postId: string, commentId: string) => {
    const ok = await deleteRecord('post_comments', commentId)
    if (!ok) return
    setComments(prev => ({ ...prev, [postId]: (prev[postId] ?? []).filter(c => c.id !== commentId) }))
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: Math.max(0, (p.comment_count ?? 1) - 1) } : p))
  }

  const handleReport = async (postId: string) => {
    if (!userId) { router.push('/login'); return }
    await supabase.from('post_reports').upsert({ post_id: postId, user_id: userId }, { onConflict: 'post_id,user_id' })
    setOpenMenuPostId(null)
    alert('通報しました')
  }

  const handleBlock = async (targetUserId: string) => {
    if (!userId) { router.push('/login'); return }
    await supabase.from('user_blocks').upsert({ blocker_id: userId, blocked_id: targetUserId }, { onConflict: 'blocker_id,blocked_id' })
    setBlockedIds(prev => new Set([...prev, targetUserId]))
    setOpenMenuPostId(null)
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    setPostMedia(file)
    setPostMediaType(isVideo ? 'video' : 'image')
    setPostMediaPreview(URL.createObjectURL(file))
  }

  const clearModal = () => {
    setPostContent(''); setPostCategory('chat'); setPostIsSpoiler(false)
    setPostMedia(null); setPostMediaPreview(null); setPostMediaType(null)
    setPostError(null); setShowModal(false)
  }

  const handlePost = async () => {
    if (!postContent.trim()) return
    setSubmitting(true)
    setPostError(null)

    let mediaUrl: string | null = null
    let mediaType: 'image' | 'video' | null = null

    if (postMedia && userId) {
      const ext = postMedia.name.split('.').pop()
      const filename = `${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('board-media').upload(filename, postMedia, { upsert: false })
      if (!error) {
        const { data: urlData } = supabase.storage.from('board-media').getPublicUrl(filename)
        mediaUrl = urlData.publicUrl
        mediaType = postMediaType
      }
    }

    const guestInfo = !userId ? getGuestIdentity() : null
    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'board_post',
        concert_id: concertId,
        content: postContent.trim(),
        category: postCategory,
        is_spoiler: postIsSpoiler,
        media_url: mediaUrl,
        media_type: mediaType,
        ...(guestInfo ?? {}),
      }),
    })

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: '投稿失敗' }))
      setPostError(error)
      setSubmitting(false)
      return
    }
    const { post: data, displayName } = await res.json()
    if (data) setPosts(prev => [{
      ...data,
      is_spoiler: data.is_spoiler ?? false,
      likes_count: data.likes_count ?? 0,
      media_type: data.media_type as 'image' | 'video' | null,
      created_at: data.created_at ?? new Date().toISOString(),
      profiles: { username: displayName ?? myUsername, avatar_url: displayName ? null : myAvatarUrl },
      myLike: false, comment_count: 0,
    }, ...prev])
    clearModal()
    setSubmitting(false)
  }

  const filteredPosts = posts.filter(p => {
    if (blockedIds.has(p.user_id)) return false
    if (activeCategory !== 'all' && p.category !== activeCategory) return false
    return true
  })

  return (
    <div className="space-y-4 pb-24" onClick={() => openMenuPostId && setOpenMenuPostId(null)}>
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl">✕</button>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button key={cat.value} onClick={() => setActiveCategory(cat.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors shrink-0 ${activeCategory === cat.value ? 'bg-violet-600 text-white' : 'bg-white/5 text-[#8888aa] hover:text-white'}`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Post list */}
      {loading ? (
        <div className="text-center text-[#8888aa] text-sm py-8">読み込み中...</div>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">データの読み込みに失敗しました</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center text-[#8888aa] text-sm py-8">投稿がありません</div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map(post => {
            const isSpoilerHidden = post.is_spoiler && !revealedSpoilers.has(post.id)
            const catStyle = CAT_STYLE[post.category] ?? CAT_STYLE.chat
            return (
              <div key={post.id} className="glass rounded-2xl p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    {post.profiles?.avatar_url ? (
                      <img src={post.profiles.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-violet-500/30 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
                        {(post.guest_name ?? post.profiles?.username ?? '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-bold text-white truncate">{post.guest_name ?? post.profiles?.username ?? '匿名'}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${catStyle}`}>
                      {CATEGORIES.find(c => c.value === post.category)?.label ?? post.category}
                    </span>
                    {post.is_spoiler && (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-red-500/40 text-red-400 bg-red-500/10 shrink-0">ネタバレ</span>
                    )}
                    <span className="text-xs text-[#8888aa] shrink-0">{timeAgo(post.created_at)}</span>
                  </div>
                  <div className="relative shrink-0">
                    <button onClick={e => { e.stopPropagation(); setOpenMenuPostId(openMenuPostId === post.id ? null : post.id) }}
                      className="text-[#8888aa] hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors">
                      <MoreHorizontal size={16} />
                    </button>
                    {openMenuPostId === post.id && (
                      <div className="absolute right-0 top-8 z-20 bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden shadow-xl min-w-[110px]">
                        {(post.user_id === userId || (!userId && post.user_id === guestUserId)) ? (
                          <button onClick={() => handleDeletePost(post.id)}
                            className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">削除</button>
                        ) : (
                          <>
                            <button onClick={() => handleReport(post.id)}
                              className="w-full text-left px-4 py-2.5 text-sm text-[#8888aa] hover:bg-white/5 hover:text-white transition-colors">通報</button>
                            <button onClick={() => handleBlock(post.user_id)}
                              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">ブロック</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Content */}
                {isSpoilerHidden ? (
                  <button onClick={() => setRevealedSpoilers(prev => new Set([...prev, post.id]))}
                    className="w-full flex items-center justify-center gap-2 py-4 border border-red-500/20 rounded-xl text-red-400 text-sm hover:bg-red-500/5 transition-colors">
                    <EyeOff size={14} /> ネタバレを表示する
                  </button>
                ) : (
                  <>
                    <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">{post.content}</p>
                    {post.media_url && post.media_type === 'image' && (
                      <button onClick={() => setLightboxUrl(post.media_url!)} className="block w-full">
                        <img src={post.media_url} alt="" className="w-full max-h-72 object-cover rounded-xl" />
                      </button>
                    )}
                    {post.media_url && post.media_type === 'video' && (
                      <video src={post.media_url} controls className="w-full max-h-64 rounded-xl" />
                    )}
                  </>
                )}

                {/* Actions */}
                <div className="flex items-center gap-5">
                  <button onClick={() => handleLike(post)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${post.myLike ? 'text-pink-400' : 'text-[#8888aa] hover:text-pink-400'}`}>
                    <Heart size={15} fill={post.myLike ? 'currentColor' : 'none'} />
                    {(post.likes_count ?? 0) > 0 && <span>{post.likes_count}</span>}
                  </button>
                  <button onClick={() => toggleComments(post.id)}
                    className={`flex items-center gap-1.5 text-sm transition-colors ${expandedPostId === post.id ? 'text-violet-400' : 'text-[#8888aa] hover:text-violet-400'}`}>
                    <MessageCircle size={15} />
                    {(post.comment_count ?? 0) > 0 && <span>{post.comment_count}</span>}
                  </button>
                </div>

                {/* Comments */}
                {expandedPostId === post.id && (
                  <div className="space-y-3 border-t border-white/5 pt-3">
                    {(comments[post.id] ?? []).length === 0 && (
                      <p className="text-xs text-[#8888aa]">コメントはまだありません</p>
                    )}
                    {(comments[post.id] ?? []).map(c => (
                      <div key={c.id} className="flex items-start gap-2">
                        {c.profiles?.avatar_url ? (
                          <img src={c.profiles.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs text-violet-300 shrink-0 font-bold">
                            {(c.guest_name ?? c.profiles?.username ?? '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{c.guest_name ?? c.profiles?.username ?? '匿名'}</span>
                            <span className="text-xs text-[#8888aa]">{timeAgo(c.created_at)}</span>
                          </div>
                          <p className="text-sm text-white mt-0.5 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                        </div>
                        {(c.user_id === userId || (!userId && c.user_id === guestUserId)) && (
                          <button onClick={() => handleDeleteComment(post.id, c.id)}
                            className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <input value={commentInput} onChange={e => setCommentInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(post.id) } }}
                        placeholder="コメントを入力..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50" />
                      <button onClick={() => handleComment(post.id)} disabled={submittingComment || !commentInput.trim()}
                        className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-colors">
                        送信
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Floating post button */}
      <button onClick={() => setShowModal(true)}
        className="fixed bottom-20 sm:bottom-6 right-6 z-[60] w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/30 flex items-center justify-center transition-all hover:scale-105">
        <Plus size={24} className="text-white" />
      </button>

      {/* Post modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center" onClick={clearModal}>
          <div className="w-full sm:max-w-lg bg-[#0f0f1a] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white text-base">投稿する</h3>
              <button onClick={clearModal} className="text-[#8888aa] hover:text-white transition-colors"><X size={20} /></button>
            </div>

            {/* Category selector */}
            <div className="flex gap-2 flex-wrap">
              {POST_CATEGORIES.map(cat => (
                <button key={cat.value} type="button" onClick={() => setPostCategory(cat.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${postCategory === cat.value ? 'bg-violet-600 text-white border-violet-600' : 'border-white/10 text-[#8888aa] hover:border-white/20 hover:text-white'}`}>
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Text input */}
            <textarea value={postContent} onChange={e => setPostContent(e.target.value)}
              placeholder="今どんな状況？情報を共有しよう..."
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50 resize-none" />

            {/* Media preview */}
            {postMediaPreview && (
              <div className="relative">
                {postMediaType === 'image'
                  ? <img src={postMediaPreview} alt="" className="w-full max-h-48 object-cover rounded-xl" />
                  : <video src={postMediaPreview} className="w-full max-h-48 rounded-xl" />
                }
                <button onClick={() => { setPostMedia(null); setPostMediaPreview(null); setPostMediaType(null) }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90">
                  <X size={13} />
                </button>
              </div>
            )}

            {postError && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{postError}</p>
            )}

            {/* Footer */}
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleMediaSelect} className="hidden" />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="text-[#8888aa] hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5">
                <Image size={18} />
              </button>

              {/* Spoiler toggle */}
              <button type="button" onClick={() => setPostIsSpoiler(p => !p)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${postIsSpoiler ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'border-white/10 text-[#8888aa] hover:border-white/20 hover:text-white'}`}>
                {postIsSpoiler ? <Eye size={12} /> : <EyeOff size={12} />}
                ネタバレ
              </button>

              <button onClick={handlePost} disabled={submitting || !postContent.trim()}
                className="ml-auto px-5 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-black text-sm rounded-full transition-colors">
                {submitting ? '投稿中...' : '投稿'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
