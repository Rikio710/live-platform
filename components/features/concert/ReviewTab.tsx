'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Star, Pencil, Trash2 } from 'lucide-react'
import { getGuestIdentity, readGuestId } from '@/lib/guestId'

type Review = {
  id: string
  user_id: string
  rating: number
  comment: string | null
  created_at: string
  guest_name?: string | null
  profiles: { username: string | null; avatar_url: string | null } | null
}

function StarRating({ value, onChange, readonly = false }: {
  value: number
  onChange?: (v: number) => void
  readonly?: boolean
}) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => !readonly && setHovered(n)}
          onMouseLeave={() => !readonly && setHovered(0)}
          className={`transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <Star
            size={readonly ? 14 : 22}
            className={`transition-colors ${
              n <= (hovered || value)
                ? 'fill-yellow-400 text-yellow-400'
                : 'text-white/20'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

export default function ReviewTab({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [guestUserId, setGuestUserId] = useState<string | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [myReview, setMyReview] = useState<Review | null>(null)

  // フォーム
  const [showForm, setShowForm] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = user?.id ?? null
      const gid = !user ? readGuestId() : null
      setUserId(uid)
      setGuestUserId(gid)
      await load(uid, gid)
      setLoading(false)
    }
    init()
  }, [concertId])

  const load = async (uid: string | null, gid: string | null = null) => {
    const { data } = await supabase
      .from('concert_reviews')
      .select('id, user_id, rating, comment, created_at, guest_name')
      .eq('concert_id', concertId)
      .order('created_at', { ascending: false })

    if (!data) { setReviews([]); return }

    const userIds = [...new Set(data.map(r => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds)
    const profileMap: Record<string, { username: string | null; avatar_url: string | null }> = {}
    for (const p of profiles ?? []) profileMap[p.id] = { username: p.username, avatar_url: p.avatar_url }

    const rows = data.map(r => ({ ...r, guest_name: r.guest_name ?? null, profiles: profileMap[r.user_id] ?? null })) as Review[]
    setReviews(rows)
    setMyReview((uid ?? gid) ? (rows.find(r => r.user_id === uid || (gid !== null && r.user_id === gid)) ?? null) : null)
  }

  const handleSubmit = async () => {
    if (rating === 0) return
    setSubmitting(true)

    if (myReview && userId) {
      await supabase.from('concert_reviews').update({ rating, comment: comment.trim() || null }).eq('id', myReview.id)
    } else {
      const guestInfo = !userId ? getGuestIdentity() : null
      await fetch('/api/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review', concert_id: concertId, rating, comment: comment.trim() || null, ...(guestInfo ?? {}) }),
      })
    }

    setShowForm(false)
    setSubmitting(false)
    await load(userId, guestUserId)
  }

  const handleDelete = async () => {
    if (!myReview || (!userId && !guestUserId)) return
    if (!confirm('レビューを削除しますか？')) return
    const guestInfo = !userId && guestUserId ? { guest_user_id: guestUserId } : null
    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', table: 'concert_reviews', record_id: myReview.id, ...(guestInfo ?? {}) }),
    })
    if (!res.ok) return
    const deleted = myReview
    setMyReview(null)
    setReviews(prev => prev.filter(r => r.id !== deleted.id))
  }

  const startEdit = () => {
    if (!myReview) return
    setRating(myReview.rating)
    setComment(myReview.comment ?? '')
    setShowForm(true)
  }

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null

  if (loading) return <div className="text-center text-[#8888aa] text-sm py-6">読み込み中...</div>

  return (
    <div className="space-y-4">
      {/* 平均レーティング */}
      {reviews.length > 0 && (
        <div className="glass rounded-2xl p-5 flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-black text-white">{avgRating}</p>
            <p className="text-xs text-[#8888aa] mt-1">{reviews.length}件のレビュー</p>
          </div>
          <div className="w-px h-12 bg-white/10 shrink-0" />
          <StarRating value={Math.round(Number(avgRating))} readonly />
        </div>
      )}

      {/* 投稿ボタン */}
      {!showForm && (
        <div className="flex justify-end">
          {myReview ? (
            <div className="flex gap-2">
              {userId && (
                <button onClick={startEdit}
                  className="flex items-center gap-1.5 text-sm border border-white/10 text-[#8888aa] hover:text-white px-4 py-2 rounded-full transition-colors">
                  <Pencil size={13} />編集
                </button>
              )}
              <button onClick={handleDelete}
                className="flex items-center gap-1.5 text-sm border border-red-500/20 text-red-400 hover:bg-red-500/10 px-4 py-2 rounded-full transition-colors">
                <Trash2 size={13} />削除
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="text-sm border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 px-4 py-2 rounded-full transition-colors font-bold"
            >
              ＋ レビューを投稿
            </button>
          )}
        </div>
      )}

      {/* 投稿フォーム */}
      {showForm && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white text-sm">{myReview ? 'レビューを編集' : 'レビューを投稿'}</h3>
          <div className="space-y-1.5">
            <p className="text-xs text-[#8888aa]">評価</p>
            <StarRating value={rating} onChange={setRating} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-[#8888aa]">コメント（任意）</p>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              placeholder="ライブの感想を一言どうぞ"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSubmit} disabled={submitting || rating === 0}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
              {submitting ? '送信中...' : '投稿する'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl transition-colors text-sm">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* レビュー一覧 */}
      {reviews.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-[#8888aa] text-sm">
          まだレビューがありません
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="glass rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {r.profiles?.avatar_url ? (
                    <img src={r.profiles.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-violet-500/30 flex items-center justify-center text-[10px] font-bold text-violet-300 shrink-0">
                      {(r.guest_name ?? r.profiles?.username ?? '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-bold text-white">{r.guest_name ?? r.profiles?.username ?? '匿名'}</span>
                </div>
                <StarRating value={r.rating} readonly />
              </div>
              {r.comment && (
                <p className="text-sm text-[#ccccdd] leading-relaxed">{r.comment}</p>
              )}
              <p className="text-xs text-[#8888aa]">
                {new Date(r.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
