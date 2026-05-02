'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Utensils, Hotel, ShoppingBag, MapPin, ExternalLink, Trash2 } from 'lucide-react'
import type { Tables } from '@/types/supabase'

type Category = 'restaurant' | 'hotel' | 'convenience' | 'other'

type Spot = {
  id: string
  user_id: string
  category: Category
  name: string
  description: string | null
  address: string | null
  url: string | null
  created_at: string | null
  profiles: { username: string | null } | null
}

const CATEGORY_LABELS: Record<Category, string> = {
  restaurant: 'レストラン',
  hotel: 'ホテル',
  convenience: 'コンビニ',
  other: 'その他',
}

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  restaurant: Utensils,
  hotel: Hotel,
  convenience: ShoppingBag,
  other: MapPin,
}

const CATEGORY_COLORS: Record<Category, string> = {
  restaurant: 'text-orange-400 bg-orange-500/10',
  hotel: 'text-blue-400 bg-blue-500/10',
  convenience: 'text-green-400 bg-green-500/10',
  other: 'text-violet-400 bg-violet-500/10',
}

const ALL_CATEGORIES: Array<Category | 'all'> = ['all', 'restaurant', 'hotel', 'convenience', 'other']

export default function NearbyTab({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [spots, setSpots] = useState<Spot[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [myUsername, setMyUsername] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [category, setCategory] = useState<Category>('restaurant')
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formUrl, setFormUrl] = useState('')

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const uid = user?.id ?? null
        setUserId(uid)

        if (uid) {
          const { data: profile } = await supabase.from('profiles').select('username').eq('id', uid).single()
          setMyUsername(profile?.username ?? null)
        }

        const { data, error } = await supabase
          .from('nearby_spots')
          .select('id, category, name, description, address, url, created_at, user_id')
          .eq('concert_id', concertId)
          .order('created_at', { ascending: false })

        if (error) throw error

        type NearbySpotRow = Pick<Tables<'nearby_spots'>, 'id' | 'category' | 'name' | 'description' | 'address' | 'url' | 'created_at' | 'user_id'>
        const rows: NearbySpotRow[] = data ?? []
        if (rows.length > 0) {
          const userIds = [...new Set(rows.map((r) => r.user_id))]
          const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
          const profileMap: Record<string, string | null> = {}
          for (const p of profilesData ?? []) profileMap[p.id] = p.username
          setSpots(rows.map((r) => ({ ...r, category: r.category as Category, profiles: { username: profileMap[r.user_id] ?? null } })))
        } else {
          setSpots([])
        }
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [concertId])

  const handleSubmit = async () => {
    if (!formName.trim()) return
    setSubmitting(true)

    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'nearby_spot',
        concert_id: concertId,
        category,
        name: formName.trim(),
        description: formDesc.trim() || null,
        address: formAddress.trim() || null,
        url: formUrl.trim() || null,
      }),
    })

    if (!res.ok) {
      alert('追加失敗しました')
      setSubmitting(false)
      return
    }
    const { spot: data, isGuest } = await res.json()
    if (data) setSpots(prev => [{ ...data, category: data.category as Category, profiles: { username: isGuest ? 'ゲスト' : myUsername } }, ...prev])
    setFormName('')
    setFormDesc('')
    setFormAddress('')
    setFormUrl('')
    setCategory('restaurant')
    setShowForm(false)
    setSubmitting(false)
  }

  const handleDeleteSpot = async (spotId: string) => {
    if (!confirm('このスポットを削除しますか？')) return
    await supabase.from('nearby_spots').delete().eq('id', spotId).eq('user_id', userId!)
    setSpots(prev => prev.filter(s => s.id !== spotId))
  }

  const filtered = activeFilter === 'all' ? spots : spots.filter(s => s.category === activeFilter)

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {ALL_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
              activeFilter === cat
                ? 'bg-violet-600 text-white border-violet-600'
                : 'border-white/10 text-[#8888aa] hover:border-white/20 hover:text-white'
            }`}
          >
            {cat === 'all' ? '全て' : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 px-4 py-2 rounded-full transition-colors font-bold"
        >
          ＋ スポットを追加
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="font-bold text-white text-sm">周辺スポットを追加</h3>

          <div>
            <label className="text-xs text-[#8888aa] mb-2 block">カテゴリ *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['restaurant', 'hotel', 'convenience', 'other'] as Category[]).map(cat => {
                const Icon = CATEGORY_ICONS[cat]
                return (
                  <button key={cat} type="button" onClick={() => setCategory(cat)}
                    className={`flex items-center gap-2 py-2 px-3 rounded-xl border text-sm font-medium transition-colors ${
                      category === cat
                        ? 'bg-violet-600/30 border-violet-500/50 text-violet-300'
                        : 'border-white/10 text-[#8888aa] hover:border-white/20'
                    }`}>
                    <Icon size={14} />
                    {CATEGORY_LABELS[cat]}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">名前 *</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="例: 松屋 有明店"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">説明（任意）</label>
            <input
              type="text"
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder="例: 会場から徒歩5分、24時間営業"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">住所（任意）</label>
            <input
              type="text"
              value={formAddress}
              onChange={e => setFormAddress(e.target.value)}
              placeholder="例: 東京都江東区有明3-1-2"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">URL（任意）</label>
            <input
              type="text"
              value={formUrl}
              onChange={e => setFormUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !formName.trim()}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
          >
            {submitting ? '追加中...' : '追加する'}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center text-[#8888aa] text-sm py-6">読み込み中...</div>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">データの読み込みに失敗しました</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center space-y-2">
          <p className="text-[#8888aa] text-sm">周辺スポットがまだ投稿されていません</p>
          <p className="text-xs text-[#8888aa]">ランチやホテルなどおすすめの場所を共有しよう</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(spot => {
            const Icon = CATEGORY_ICONS[spot.category]
            const colorClass = CATEGORY_COLORS[spot.category]
            return (
              <div key={spot.id} className="glass rounded-2xl px-4 py-4 space-y-2">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white text-sm">{spot.name}</p>
                      <span className="text-xs text-[#8888aa] border border-white/10 px-2 py-0.5 rounded-full">
                        {CATEGORY_LABELS[spot.category]}
                      </span>
                    </div>
                    {spot.description && (
                      <p className="text-xs text-[#8888aa] mt-1 leading-relaxed">{spot.description}</p>
                    )}
                    {spot.address && (
                      <p className="text-xs text-[#8888aa] mt-1 flex items-center gap-1">
                        <MapPin size={11} className="shrink-0" />
                        {spot.address}
                      </p>
                    )}
                    {spot.url && (
                      <a href={spot.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 mt-1 transition-colors">
                        <ExternalLink size={11} />
                        リンクを開く
                      </a>
                    )}
                    <p className="text-xs text-[#8888aa] mt-1">
                      {spot.profiles?.username ?? '匿名'} ・{' '}
                      {spot.created_at && new Date(spot.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {spot.user_id === userId && (
                    <button onClick={() => handleDeleteSpot(spot.id)}
                      className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1 self-start">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
