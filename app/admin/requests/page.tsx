'use client'

import { useState, useEffect } from 'react'
import { Mic2, Route, Ticket, CheckCircle, XCircle, Clock } from 'lucide-react'

type RequestType = 'artist' | 'tour' | 'concert'
type RequestStatus = 'pending' | 'approved' | 'rejected'

type Request = {
  id: string
  type: RequestType
  status: RequestStatus
  payload: Record<string, string>
  submitted_by: string | null
  admin_note: string | null
  created_at: string
}

const TYPE_LABEL: Record<RequestType, string> = { artist: 'アーティスト', tour: 'ツアー', concert: '公演' }
const TYPE_ICON: Record<RequestType, React.ElementType> = { artist: Mic2, tour: Route, concert: Ticket }
const STATUS_FILTER = ['all', 'pending', 'approved', 'rejected'] as const

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<typeof STATUS_FILTER[number]>('pending')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/admin/requests')
      if (!res.ok) throw new Error()
      setRequests(await res.json())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const handle = async (id: string, status: 'approved' | 'rejected') => {
    setProcessing(id)
    try {
      const res = await fetch(`/api/admin/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? '処理に失敗しました'); return }
      setRequests(prev => prev.map(r => r.id === id ? data : r))
      setExpanded(null)
    } catch {
      alert('ネットワークエラーが発生しました')
    } finally {
      setProcessing(null)
    }
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            追加リクエスト
            {pendingCount > 0 && (
              <span className="text-xs bg-violet-600 text-white font-bold px-2.5 py-1 rounded-full">{pendingCount}</span>
            )}
          </h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{requests.length}件</p>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTER.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
              filter === s ? 'bg-violet-600 text-white' : 'border border-white/10 text-[#8888aa] hover:text-white'
            }`}>
            {s === 'all' ? 'すべて' : s === 'pending' ? '審査中' : s === 'approved' ? '承認済み' : '却下'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">読み込みに失敗しました</p>
          <button onClick={load} className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-4 py-2 rounded-full transition-colors">再試行</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">リクエストがありません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const Icon = TYPE_ICON[r.type]
            const isOpen = expanded === r.id
            const title = r.payload.name || r.payload.venue_name || '—'
            return (
              <div key={r.id} className="glass rounded-2xl overflow-hidden">
                <button className="w-full px-5 py-4 flex items-center gap-4 text-left" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <div className="w-9 h-9 rounded-xl bg-violet-800/50 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs border border-white/10 text-[#8888aa] px-2 py-0.5 rounded-full">{TYPE_LABEL[r.type]}</span>
                      <p className="font-bold text-white truncate">{title}</p>
                    </div>
                    <p className="text-xs text-[#8888aa] mt-0.5">
                      {new Date(r.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </button>

                {isOpen && (
                  <div className="border-t border-white/5 px-5 py-4 space-y-4">
                    {/* ペイロード表示 */}
                    <div className="bg-white/3 rounded-xl p-4 space-y-2">
                      {Object.entries(r.payload).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} className="flex gap-3 text-sm">
                          <span className="text-[#8888aa] w-32 shrink-0 text-xs">{k}</span>
                          <span className="text-white break-all">{v}</span>
                        </div>
                      ))}
                    </div>

                    {r.status === 'pending' && (
                      <div className="flex gap-3">
                        <button
                          onClick={() => handle(r.id, 'approved')}
                          disabled={processing === r.id}
                          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors">
                          <CheckCircle size={15} />
                          {processing === r.id ? '処理中...' : '承認して登録'}
                        </button>
                        <button
                          onClick={() => handle(r.id, 'rejected')}
                          disabled={processing === r.id}
                          className="flex items-center gap-2 border border-red-500/20 text-red-400 hover:bg-red-500/10 text-sm px-5 py-2.5 rounded-xl transition-colors">
                          <XCircle size={15} />
                          却下
                        </button>
                      </div>
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

function StatusBadge({ status }: { status: RequestStatus }) {
  if (status === 'pending') return (
    <span className="flex items-center gap-1 text-xs text-yellow-400 border border-yellow-400/20 px-2.5 py-1 rounded-full shrink-0">
      <Clock size={11} /> 審査中
    </span>
  )
  if (status === 'approved') return (
    <span className="flex items-center gap-1 text-xs text-green-400 border border-green-400/20 px-2.5 py-1 rounded-full shrink-0">
      <CheckCircle size={11} /> 承認済み
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-red-400 border border-red-400/20 px-2.5 py-1 rounded-full shrink-0">
      <XCircle size={11} /> 却下
    </span>
  )
}
