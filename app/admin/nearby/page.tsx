'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminDeleteSpot } from '../actions'
import { Utensils, Hotel, ShoppingBag, MapPin, ExternalLink, Trash2 } from 'lucide-react'

type Concert = { id: string; venue_name: string; date: string }
type Spot = {
  id: string
  user_id: string
  concert_id: string
  category: string
  name: string
  description: string | null
  address: string | null
  url: string | null
  created_at: string
  profiles: { username: string | null } | null
  concerts: Concert | null
}

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'レストラン',
  hotel: 'ホテル',
  convenience: 'コンビニ',
  other: 'その他',
}
const CATEGORY_COLORS: Record<string, string> = {
  restaurant: 'bg-orange-500/20 text-orange-300',
  hotel: 'bg-blue-500/20 text-blue-300',
  convenience: 'bg-green-500/20 text-green-300',
  other: 'bg-violet-500/20 text-violet-300',
}
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  restaurant: Utensils,
  hotel: Hotel,
  convenience: ShoppingBag,
  other: MapPin,
}

export default function AdminNearbyPage() {
  const supabase = createClient()
  const [spots, setSpots] = useState<Spot[]>([])
  const [loading, setLoading] = useState(true)
  const [filterConcert, setFilterConcert] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const load = async () => {
    const { data } = await supabase
      .from('nearby_spots')
      .select('id, user_id, concert_id, category, name, description, address, url, created_at, concerts(id, venue_name, date)')
      .order('created_at', { ascending: false })

    const rows = (data ?? []) as any[]
    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))]
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      const profileMap: Record<string, string | null> = {}
      for (const p of profilesData ?? []) profileMap[p.id] = p.username
      setSpots(rows.map((r: any) => ({ ...r, profiles: { username: profileMap[r.user_id] ?? null } })) as Spot[])
    } else {
      setSpots([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const concerts: Concert[] = Array.from(
    new Map(
      spots
        .filter(s => s.concerts)
        .map(s => [s.concert_id, { id: s.concert_id, venue_name: s.concerts!.venue_name, date: s.concerts!.date }])
    ).values()
  )

  const filtered = spots.filter(s => {
    if (filterConcert && s.concert_id !== filterConcert) return false
    if (filterCategory && s.category !== filterCategory) return false
    return true
  })

  const handleDelete = async (spot: Spot) => {
    if (!confirm(`「${spot.name}」を削除しますか？`)) return
    try {
      await adminDeleteSpot(spot.id)
      setSpots(prev => prev.filter(s => s.id !== spot.id))
    } catch { alert('削除に失敗しました') }
  }

  const formatDate = (ts: string) => new Date(ts).toLocaleDateString('ja-JP')
  const formatTime = (ts: string) => new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">周辺情報管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{filtered.length}件</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterConcert}
            onChange={e => setFilterConcert(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">全公演</option>
            {concerts.map(c => (
              <option key={c.id} value={c.id}>{c.venue_name} ({formatDate(c.date)})</option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">全カテゴリ</option>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">周辺情報がありません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(spot => {
            const Icon = CATEGORY_ICONS[spot.category] ?? MapPin
            return (
              <div key={spot.id} className="glass rounded-2xl px-5 py-4 flex items-start gap-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${CATEGORY_COLORS[spot.category] ?? 'bg-white/10 text-[#8888aa]'}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-white">{spot.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[spot.category] ?? 'bg-white/10 text-[#8888aa]'}`}>
                      {CATEGORY_LABELS[spot.category] ?? spot.category}
                    </span>
                  </div>
                  {spot.description && <p className="text-xs text-[#8888aa]">{spot.description}</p>}
                  {spot.address && (
                    <p className="text-xs text-[#8888aa] flex items-center gap-1">
                      <MapPin size={11} />
                      {spot.address}
                    </p>
                  )}
                  {spot.url && (
                    <a href={spot.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                      <ExternalLink size={11} />
                      {spot.url}
                    </a>
                  )}
                  <p className="text-xs text-[#8888aa] pt-0.5">
                    @{spot.profiles?.username ?? '匿名'} · {formatTime(spot.created_at)}
                    {spot.concerts && ` · ${spot.concerts.venue_name}`}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(spot)}
                  className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1.5"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
