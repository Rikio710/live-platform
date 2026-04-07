'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminUpdateSong, adminDeleteSong, adminDeleteSubmission } from '../actions'
import { ChevronDown, ChevronUp, Plus, Trash2, Check, X } from 'lucide-react'

type Concert = { id: string; venue_name: string; date: string }
type Profile = { username: string | null }
type Song = {
  id: string
  song_name: string
  order_num: number
  song_type: 'song' | 'mc' | 'other'
  is_encore: boolean
}
type Submission = {
  id: string
  concert_id: string
  user_id: string
  profiles: Profile | null
  votes_count: number
  created_at: string
  concerts: Concert | null
}

const SONG_TYPE_LABELS: Record<string, string> = { song: '曲', mc: 'MC', other: 'その他' }
const SONG_TYPE_COLORS: Record<string, string> = {
  song: 'bg-violet-600/30 border-violet-500/50 text-violet-300',
  mc: 'bg-blue-600/20 border-blue-500/40 text-blue-300',
  other: 'bg-white/5 border-white/10 text-[#8888aa]',
}

export default function AdminSetlistPage() {
  const supabase = createClient()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [filterConcert, setFilterConcert] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [songs, setSongs] = useState<Record<string, Song[]>>({})
  const [loadingSongs, setLoadingSongs] = useState<string | null>(null)
  const [editingSong, setEditingSong] = useState<string | null>(null)
  const [editSongForm, setEditSongForm] = useState<Omit<Song, 'id'> & { id: string }>({ id: '', song_name: '', order_num: 1, song_type: 'song', is_encore: false })
  const [addingToSubmission, setAddingToSubmission] = useState<string | null>(null)
  const [addForm, setAddForm] = useState<{ song_name: string; song_type: 'song' | 'mc' | 'other'; is_encore: boolean }>({ song_name: '', song_type: 'song', is_encore: false })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('setlist_submissions')
      .select('id, concert_id, user_id, votes_count, created_at, concerts(venue_name, date)')
      .order('created_at', { ascending: false })

    const rows = (data ?? []) as any[]
    if (rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))]
      const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
      const profileMap: Record<string, string | null> = {}
      for (const p of profilesData ?? []) profileMap[p.id] = p.username
      setSubmissions(rows.map((r: any) => ({ ...r, profiles: { username: profileMap[r.user_id] ?? null } })) as unknown as Submission[])
    } else {
      setSubmissions([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const concerts: Concert[] = Array.from(
    new Map(
      submissions
        .filter(s => s.concerts)
        .map(s => [s.concert_id, { id: s.concert_id, venue_name: s.concerts!.venue_name, date: s.concerts!.date }])
    ).values()
  )

  const filtered = filterConcert ? submissions.filter(s => s.concert_id === filterConcert) : submissions

  const loadSongs = async (submissionId: string) => {
    if (songs[submissionId]) return
    setLoadingSongs(submissionId)
    const { data } = await supabase
      .from('setlist_songs')
      .select('id, song_name, order_num, song_type, is_encore')
      .eq('submission_id', submissionId)
      .order('order_num', { ascending: true })
    setSongs(prev => ({ ...prev, [submissionId]: (data ?? []) as unknown as Song[] }))
    setLoadingSongs(null)
  }

  const toggleExpand = async (submissionId: string) => {
    if (expandedId === submissionId) {
      setExpandedId(null)
      return
    }
    setExpandedId(submissionId)
    await loadSongs(submissionId)
  }

  const handleDeleteSubmission = async (sub: Submission) => {
    const label = sub.concerts ? `${sub.concerts.venue_name} (${sub.profiles?.username ?? '匿名'})` : sub.id
    if (!confirm(`「${label}」のセトリ投稿を削除しますか？`)) return
    try {
      await adminDeleteSubmission(sub.id)
      setSubmissions(prev => prev.filter(s => s.id !== sub.id))
      if (expandedId === sub.id) setExpandedId(null)
    } catch { alert('削除に失敗しました') }
  }

  const startEditSong = (song: Song) => {
    setEditingSong(song.id)
    setEditSongForm({ ...song })
  }

  const cancelEditSong = () => { setEditingSong(null) }

  const handleSaveSong = async (submissionId: string) => {
    setSaving(true)
    try {
      await adminUpdateSong(editSongForm.id, {
        song_name: editSongForm.song_name,
        song_type: editSongForm.song_type,
        is_encore: editSongForm.is_encore,
        order_num: editSongForm.order_num,
      })
      setSongs(prev => ({
        ...prev,
        [submissionId]: (prev[submissionId] ?? []).map(s =>
          s.id === editSongForm.id ? { ...editSongForm } : s
        ).sort((a, b) => a.order_num - b.order_num),
      }))
      setEditingSong(null)
    } catch { alert('保存に失敗しました') }
    setSaving(false)
  }

  const handleDeleteSong = async (submissionId: string, songId: string, songName: string) => {
    if (!confirm(`「${songName}」を削除しますか？`)) return
    try {
      await adminDeleteSong(songId)
      setSongs(prev => ({ ...prev, [submissionId]: (prev[submissionId] ?? []).filter(s => s.id !== songId) }))
    } catch { alert('削除に失敗しました') }
  }

  const handleAddSong = async (submissionId: string) => {
    if (!addForm.song_name.trim()) return
    setSaving(true)
    const existing = songs[submissionId] ?? []
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(s => s.order_num)) : 0
    const { data, error } = await supabase
      .from('setlist_songs')
      .insert({
        submission_id: submissionId,
        song_name: addForm.song_name.trim(),
        song_type: addForm.song_type,
        is_encore: addForm.is_encore,
        order_num: maxOrder + 1,
      })
      .select('id, song_name, order_num, song_type, is_encore')
      .single()
    setSaving(false)
    if (!error && data) {
      setSongs(prev => ({ ...prev, [submissionId]: [...(prev[submissionId] ?? []), data as Song] }))
      setAddForm({ song_name: '', song_type: 'song', is_encore: false })
      setAddingToSubmission(null)
    }
  }

  const formatDate = (ts: string) => new Date(ts).toLocaleDateString('ja-JP')
  const formatTime = (ts: string) => new Date(ts).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">セトリ管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{filtered.length}件</p>
        </div>
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
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">セトリ投稿がありません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sub => {
            const isExpanded = expandedId === sub.id
            const subSongs = songs[sub.id] ?? []
            return (
              <div key={sub.id} className="glass rounded-2xl p-5 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white">
                      {sub.concerts ? `${sub.concerts.venue_name} (${formatDate(sub.concerts.date)})` : '公演不明'}
                    </p>
                    <p className="text-xs text-[#8888aa] mt-0.5">
                      @{sub.profiles?.username ?? '匿名'} · {formatTime(sub.created_at)} · 投票 {sub.votes_count}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleExpand(sub.id)}
                      className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {isExpanded ? '閉じる' : '展開'}
                    </button>
                    <button
                      onClick={() => handleDeleteSubmission(sub)}
                      className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {/* Songs */}
                {isExpanded && (
                  <div className="border-t border-white/5 pt-3 space-y-2">
                    {loadingSongs === sub.id ? (
                      <p className="text-xs text-[#8888aa]">読み込み中...</p>
                    ) : subSongs.length === 0 ? (
                      <p className="text-xs text-[#8888aa]">曲が登録されていません</p>
                    ) : (
                      subSongs.map((song) => (
                        <div key={song.id}>
                          {editingSong === song.id ? (
                            /* Edit row */
                            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                              <input
                                type="number"
                                value={editSongForm.order_num}
                                onChange={e => setEditSongForm(f => ({ ...f, order_num: Number(e.target.value) }))}
                                className="w-12 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-violet-500/50 text-center"
                              />
                              <select
                                value={editSongForm.song_type}
                                onChange={e => setEditSongForm(f => ({ ...f, song_type: e.target.value as Song['song_type'] }))}
                                className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                              >
                                <option value="song">曲</option>
                                <option value="mc">MC</option>
                                <option value="other">その他</option>
                              </select>
                              <input
                                type="text"
                                value={editSongForm.song_name}
                                onChange={e => setEditSongForm(f => ({ ...f, song_name: e.target.value }))}
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                              />
                              <label className="flex items-center gap-1 text-xs text-[#8888aa] shrink-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editSongForm.is_encore}
                                  onChange={e => setEditSongForm(f => ({ ...f, is_encore: e.target.checked }))}
                                  className="accent-violet-500"
                                />
                                EN
                              </label>
                              <button onClick={() => handleSaveSong(sub.id)} disabled={saving} className="text-violet-400 hover:text-violet-300 transition-colors p-1">
                                <Check size={14} />
                              </button>
                              <button onClick={cancelEditSong} className="text-[#8888aa] hover:text-white transition-colors p-1">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            /* Display row */
                            <div className="flex items-center gap-2 px-1 py-1.5">
                              <span className="text-[#8888aa] text-xs w-6 text-center shrink-0">{song.order_num}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SONG_TYPE_COLORS[song.song_type]}`}>
                                {SONG_TYPE_LABELS[song.song_type]}
                              </span>
                              <p className="flex-1 text-sm text-white truncate">{song.song_name}</p>
                              {song.is_encore && (
                                <span className="text-xs text-violet-400 shrink-0">EN</span>
                              )}
                              <button
                                onClick={() => startEditSong(song)}
                                className="text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-2.5 py-1 rounded-full transition-colors shrink-0"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => handleDeleteSong(sub.id, song.id, song.song_name)}
                                className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}

                    {/* Add song */}
                    {addingToSubmission === sub.id ? (
                      <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 mt-1">
                        <select
                          value={addForm.song_type}
                          onChange={e => setAddForm(f => ({ ...f, song_type: e.target.value as Song['song_type'] }))}
                          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                        >
                          <option value="song">曲</option>
                          <option value="mc">MC</option>
                          <option value="other">その他</option>
                        </select>
                        <input
                          type="text"
                          value={addForm.song_name}
                          onChange={e => setAddForm(f => ({ ...f, song_name: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddSong(sub.id)}
                          placeholder="曲名を入力"
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                        />
                        <label className="flex items-center gap-1 text-xs text-[#8888aa] shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={addForm.is_encore}
                            onChange={e => setAddForm(f => ({ ...f, is_encore: e.target.checked }))}
                            className="accent-violet-500"
                          />
                          EN
                        </label>
                        <button onClick={() => handleAddSong(sub.id)} disabled={saving} className="text-violet-400 hover:text-violet-300 transition-colors p-1">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setAddingToSubmission(null)} className="text-[#8888aa] hover:text-white transition-colors p-1">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToSubmission(sub.id)}
                        className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors mt-1"
                      >
                        <Plus size={12} />
                        曲を追加
                      </button>
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
