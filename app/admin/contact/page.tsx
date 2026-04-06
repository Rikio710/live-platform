'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronUp, Trash2, CheckCircle } from 'lucide-react'

type ContactMessage = {
  id: string
  email: string | null
  category: string | null
  message: string
  created_at: string
  is_resolved?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  feedback: '意見・要望',
  bug: 'バグ報告',
  other: 'その他',
}
const CATEGORY_COLORS: Record<string, string> = {
  feedback: 'bg-blue-500/20 text-blue-300',
  bug: 'bg-red-500/20 text-red-300',
  other: 'bg-white/10 text-[#8888aa]',
}

type FilterType = '全て' | '未対応' | '対応済み'

export default function AdminContactPage() {
  const supabase = createClient()
  const [messages, setMessages] = useState<ContactMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('全て')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Track locally resolved items in case is_resolved column doesn't exist
  const [localResolved, setLocalResolved] = useState<Set<string>>(new Set())

  const load = async () => {
    const { data } = await supabase
      .from('contact_messages')
      .select('id, email, category, message, created_at, is_resolved')
      .order('created_at', { ascending: false })
    setMessages((data ?? []) as ContactMessage[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const isResolved = (msg: ContactMessage) =>
    msg.is_resolved === true || localResolved.has(msg.id)

  const filtered = messages.filter(msg => {
    if (filter === '未対応') return !isResolved(msg)
    if (filter === '対応済み') return isResolved(msg)
    return true
  })

  const handleResolve = async (msg: ContactMessage) => {
    // Try updating the DB column; if it fails (column doesn't exist), fall back to local state
    try {
      const { error } = await supabase
        .from('contact_messages')
        .update({ is_resolved: true })
        .eq('id', msg.id)
      if (error) throw error
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_resolved: true } : m))
    } catch {
      // Column likely doesn't exist — mark locally
      setLocalResolved(prev => new Set([...prev, msg.id]))
    }
  }

  const handleDelete = async (msg: ContactMessage) => {
    if (!confirm('このお問い合わせを削除しますか？')) return
    const { error } = await supabase.from('contact_messages').delete().eq('id', msg.id)
    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== msg.id))
      setLocalResolved(prev => { const s = new Set(prev); s.delete(msg.id); return s })
    }
  }

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const catKey = (msg: ContactMessage) => msg.category ?? 'other'

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-white">お問い合わせ管理</h1>
        <p className="text-sm text-[#8888aa] mt-0.5">{filtered.length}件</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['全て', '未対応', '対応済み'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
              filter === f
                ? 'bg-violet-600 text-white'
                : 'border border-white/10 text-[#8888aa] hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">お問い合わせがありません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(msg => {
            const isExpanded = expandedId === msg.id
            const resolved = isResolved(msg)
            return (
              <div key={msg.id} className={`glass rounded-2xl p-5 space-y-2 ${resolved ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Category + email */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[catKey(msg)] ?? 'bg-white/10 text-[#8888aa]'}`}>
                        {CATEGORY_LABELS[catKey(msg)] ?? catKey(msg)}
                      </span>
                      {resolved && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 flex items-center gap-1">
                          <CheckCircle size={10} />
                          対応済み
                        </span>
                      )}
                      <span className="text-xs text-[#8888aa]">{msg.email || '未記入'}</span>
                    </div>

                    {/* Message preview or full */}
                    {isExpanded ? (
                      <p className="text-sm text-white whitespace-pre-wrap">{msg.message}</p>
                    ) : (
                      <p className="text-sm text-white line-clamp-2">{msg.message}</p>
                    )}

                    <p className="text-xs text-[#8888aa]">{formatTime(msg.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {isExpanded ? '閉じる' : '展開'}
                    </button>
                    {!resolved && (
                      <button
                        onClick={() => handleResolve(msg)}
                        className="text-xs border border-green-500/20 text-green-400 hover:bg-green-500/10 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                      >
                        <CheckCircle size={11} />
                        対応済み
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(msg)}
                      className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
