'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminDeletePost, adminDeleteComment } from '../actions'
import { ChevronDown, ChevronUp, ThumbsUp, Trash2 } from 'lucide-react'

type Concert = { venue_name: string; date: string }
type Profile = { username: string | null }
type Post = {
  id: string
  concert_id: string | null
  concert: Concert | null
  user_id: string
  profiles: Profile | null
  content: string
  category: string | null
  is_spoiler: boolean
  created_at: string
  likes_count: number
}
type Comment = {
  id: string
  post_id: string
  user_id: string
  profiles: Profile | null
  content: string
  created_at: string
}

const CATEGORY_LABELS: Record<string, string> = {
  merch: '物販',
  question: '質問',
  exchange: '交換',
  chat: '雑談',
}
const CATEGORY_COLORS: Record<string, string> = {
  merch: 'bg-pink-500/20 text-pink-300',
  question: 'bg-blue-500/20 text-blue-300',
  exchange: 'bg-green-500/20 text-green-300',
  chat: 'bg-violet-500/20 text-violet-300',
}
const TABS = ['全て', '物販', '質問', '交換', '雑談']
const TAB_KEYS: Record<string, string> = { '物販': 'merch', '質問': 'question', '交換': 'exchange', '雑談': 'chat' }

export default function AdminPostsPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('全て')
  const [expandedPost, setExpandedPost] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [loadingComments, setLoadingComments] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('board_posts')
      .select('id, concert_id, concert:concerts(venue_name, date), user_id, content, category, is_spoiler, created_at, likes_count')
      .order('created_at', { ascending: false })

    const rows = (data ?? []) as any[]
    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))]
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      const profileMap: Record<string, string | null> = {}
      for (const p of profilesData ?? []) profileMap[p.id] = p.username
      setPosts(rows.map((r: any) => ({ ...r, profiles: { username: profileMap[r.user_id] ?? null } })) as unknown as Post[])
    } else {
      setPosts([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDeletePost = async (post: Post) => {
    const label = post.concert?.venue_name ?? '投稿'
    if (!confirm(`「${label}」の投稿を削除しますか？`)) return
    try {
      await adminDeletePost(post.id)
      setPosts(prev => prev.filter(p => p.id !== post.id))
      if (expandedPost === post.id) setExpandedPost(null)
    } catch { alert('削除に失敗しました') }
  }

  const handleDeleteComment = async (postId: string, commentId: string) => {
    if (!confirm('このコメントを削除しますか？')) return
    try {
      await adminDeleteComment(commentId)
      setComments(prev => ({
        ...prev,
        [postId]: (prev[postId] ?? []).filter(c => c.id !== commentId),
      }))
    } catch { alert('削除に失敗しました') }
  }

  const toggleExpand = async (postId: string) => {
    if (expandedPost === postId) {
      setExpandedPost(null)
      return
    }
    setExpandedPost(postId)
    if (comments[postId]) return
    setLoadingComments(postId)
    const { data } = await supabase
      .from('post_comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    const rows = (data ?? []) as any[]
    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))]
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      const profileMap: Record<string, string | null> = {}
      for (const p of profilesData ?? []) profileMap[p.id] = p.username
      setComments(prev => ({ ...prev, [postId]: rows.map((r: any) => ({ ...r, profiles: { username: profileMap[r.user_id] ?? null } })) as unknown as Comment[] }))
    } else {
      setComments(prev => ({ ...prev, [postId]: [] }))
    }
    setLoadingComments(null)
  }

  const filtered = posts.filter(p => {
    const matchTab = activeTab === '全て' || (p.category ?? 'chat') === TAB_KEYS[activeTab]
    const concertName = p.concert?.venue_name ?? ''
    const matchSearch = !search || concertName.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const catKey = (p: Post) => p.category ?? 'chat'

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-white">掲示板管理</h1>
        <p className="text-sm text-[#8888aa] mt-0.5">{filtered.length}件</p>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="公演名で検索..."
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
      />

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
              activeTab === tab
                ? 'bg-violet-600 text-white'
                : 'border border-white/10 text-[#8888aa] hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">投稿がありません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(post => {
            const isExpanded = expandedPost === post.id
            const postComments = comments[post.id] ?? []
            return (
              <div key={post.id} className="glass rounded-2xl p-5 space-y-3">
                {/* Post header */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[catKey(post)] ?? 'bg-white/10 text-[#8888aa]'}`}>
                        {CATEGORY_LABELS[catKey(post)] ?? catKey(post)}
                      </span>
                      {post.is_spoiler && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300">ネタバレ</span>
                      )}
                      {post.concert && (
                        <span className="text-xs text-[#8888aa]">
                          {post.concert.venue_name} ({new Date(post.concert.date).toLocaleDateString('ja-JP')})
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-3 text-xs text-[#8888aa]">
                      <span>@{post.profiles?.username ?? '匿名'}</span>
                      <span>{formatTime(post.created_at)}</span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp size={11} />
                        {post.likes_count}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleExpand(post.id)}
                      className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      コメント
                    </button>
                    <button
                      onClick={() => handleDeletePost(post)}
                      className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {/* Comments */}
                {isExpanded && (
                  <div className="border-t border-white/5 pt-3 space-y-2">
                    {loadingComments === post.id ? (
                      <p className="text-xs text-[#8888aa]">読み込み中...</p>
                    ) : postComments.length === 0 ? (
                      <p className="text-xs text-[#8888aa]">コメントはありません</p>
                    ) : (
                      postComments.map(comment => (
                        <div key={comment.id} className="flex items-start gap-2 bg-white/3 rounded-xl px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white">{comment.content}</p>
                            <p className="text-xs text-[#8888aa] mt-0.5">
                              @{comment.profiles?.username ?? '匿名'} · {formatTime(comment.created_at)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteComment(post.id, comment.id)}
                            className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
