'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ThumbsUp, Trash2, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react'

type Song = {
  id: string
  song_name: string
  song_type: 'song' | 'mc' | 'other'
  order_num: number
  is_encore: boolean
}

type Submission = {
  id: string
  user_id: string
  votes_count: number
  created_at: string
  profiles: { username: string | null } | null
  songs: Song[]
}

type BulkRow = {
  type: 'song' | 'mc' | 'other'
  name: string
  encore: boolean
}

type EditRow = {
  id: string | null
  type: 'song' | 'mc' | 'other'
  name: string
  encore: boolean
}

const TYPE_LABELS: Record<string, string> = { song: '曲', mc: 'MC', other: 'その他' }
const TYPE_CYCLE: Array<'song' | 'mc' | 'other'> = ['song', 'mc', 'other']

function nextType(t: 'song' | 'mc' | 'other'): 'song' | 'mc' | 'other' {
  return TYPE_CYCLE[(TYPE_CYCLE.indexOf(t) + 1) % TYPE_CYCLE.length]
}

function emptyBulkRow(): BulkRow {
  return { type: 'song', name: '', encore: false }
}

function placeholderForType(t: 'song' | 'mc' | 'other') {
  if (t === 'mc') return 'MCトーク（任意）'
  if (t === 'other') return '演出・SE など（任意）'
  return '例: 夜に駆ける'
}

export default function SetlistTab({ concertId }: { concertId: string }) {
  const supabase = createClient()
  const router = useRouter()

  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [votedSubmissionIds, setVotedSubmissionIds] = useState<Set<string>>(new Set())
  const [showOthers, setShowOthers] = useState(false)

  // New submission form
  const [showForm, setShowForm] = useState(false)
  const [inputMode, setInputMode] = useState<'text' | 'row'>('text')
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, emptyBulkRow))
  const [submitting, setSubmitting] = useState(false)

  // Edit mode
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null)
  const [editRows, setEditRows] = useState<EditRow[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
      await loadSubmissions(user?.id ?? null)
      setLoading(false)
    }
    init()
  }, [concertId])

  const loadSubmissions = async (uid: string | null) => {
    const { data: subs } = await supabase
      .from('setlist_submissions')
      .select('id, user_id, votes_count, created_at')
      .eq('concert_id', concertId)
      .order('votes_count', { ascending: false })

    if (!subs) { setSubmissions([]); return }

    // Fetch profiles separately (no direct FK between setlist_submissions and profiles)
    const userIds = [...new Set((subs as any[]).map(s => s.user_id))]
    const { data: profilesData } = await supabase.from('profiles').select('id, username').in('id', userIds)
    const profileMap: Record<string, string | null> = {}
    for (const p of profilesData ?? []) profileMap[p.id] = p.username

    const withSongs: Submission[] = await Promise.all(
      (subs as any[]).map(async (sub) => {
        const { data: songs } = await supabase
          .from('setlist_songs')
          .select('id, song_name, song_type, order_num, is_encore')
          .eq('submission_id', sub.id)
          .order('order_num', { ascending: true })
        return { ...sub, profiles: { username: profileMap[sub.user_id] ?? null }, songs: (songs ?? []) as Song[] }
      })
    )
    setSubmissions(withSongs)

    if (uid) {
      const { data: votes } = await supabase
        .from('setlist_submission_votes')
        .select('submission_id')
        .eq('user_id', uid)
      setVotedSubmissionIds(new Set((votes ?? []).map((v: any) => v.submission_id)))
    }
  }

  // ---- Bulk row helpers ----
  const updateRow = (i: number, patch: Partial<BulkRow>) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows(prev => [...prev, emptyBulkRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  // ---- Submit new submission ----
  const handleSubmit = async () => {
    if (!userId) { router.push('/login'); return }
    const toInsert = inputMode === 'text'
      ? pasteText.split('\n').map(l => l.trim()).filter(l => l !== '').map(l => ({ type: 'song' as const, name: l, encore: false }))
      : rows.map(r => ({ ...r, name: r.name.trim() || (r.type === 'mc' ? 'MC' : r.type === 'other' ? 'その他' : '') })).filter(r => r.name !== '')
    if (toInsert.length === 0) return
    setSubmitting(true)

    // Upsert submission row
    const { data: subData, error: subErr } = await supabase
      .from('setlist_submissions')
      .upsert({ concert_id: concertId, user_id: userId }, { onConflict: 'concert_id,user_id' })
      .select('id')
      .single()

    if (subErr || !subData) {
      alert(`投稿失敗: ${subErr?.message ?? '不明なエラー'}`)
      setSubmitting(false)
      return
    }
    const subId = (subData as any).id

    // Delete old songs
    await supabase.from('setlist_songs').delete().eq('submission_id', subId)

    // Insert new songs
    const inserts = toInsert.map((r, i) => ({
      submission_id: subId,
      concert_id: concertId,
      user_id: userId,
      song_name: r.name,
      song_type: r.type,
      order_num: i + 1,
      is_encore: r.encore,
    }))
    const { error: songsErr } = await supabase.from('setlist_songs').insert(inserts)
    if (songsErr) {
      alert(`曲の保存失敗: ${songsErr.message}`)
      setSubmitting(false)
      return
    }

    setRows(Array.from({ length: 5 }, emptyBulkRow))
    setPasteText('')
    setShowForm(false)
    setSubmitting(false)
    await loadSubmissions(userId)
  }

  // ---- Vote ----
  const handleVote = async (submissionId: string) => {
    if (!userId) { router.push('/login'); return }
    const hasVoted = votedSubmissionIds.has(submissionId)
    if (hasVoted) {
      await supabase.from('setlist_submission_votes').delete()
        .eq('submission_id', submissionId).eq('user_id', userId)
      setVotedSubmissionIds(prev => { const s = new Set(prev); s.delete(submissionId); return s })
      setSubmissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, votes_count: s.votes_count - 1 } : s
      ))
    } else {
      await supabase.from('setlist_submission_votes').insert({ submission_id: submissionId, user_id: userId })
      setVotedSubmissionIds(prev => new Set([...prev, submissionId]))
      setSubmissions(prev => prev.map(s =>
        s.id === submissionId ? { ...s, votes_count: s.votes_count + 1 } : s
      ))
    }
  }

  // ---- Edit helpers ----
  const startEdit = (sub: Submission) => {
    setEditingSubmissionId(sub.id)
    setEditRows(sub.songs.map(s => ({
      id: s.id,
      type: s.song_type,
      name: s.song_name,
      encore: s.is_encore,
    })))
  }

  const cancelEdit = () => { setEditingSubmissionId(null); setEditRows([]) }

  const updateEditRow = (i: number, patch: Partial<EditRow>) =>
    setEditRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  const moveEditRow = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= editRows.length) return
    setEditRows(prev => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const addEditRow = () => setEditRows(prev => [...prev, { id: null, type: 'song', name: '', encore: false }])
  const removeEditRow = (i: number) => setEditRows(prev => prev.filter((_, idx) => idx !== i))

  const handleSaveEdit = async () => {
    if (!userId || !editingSubmissionId) return
    const toSave = editRows
      .map(r => ({ ...r, name: r.name.trim() || (r.type === 'mc' ? 'MC' : r.type === 'other' ? 'その他' : '') }))
      .filter(r => r.name !== '')
    setSavingEdit(true)

    // Delete old songs
    await supabase.from('setlist_songs').delete().eq('submission_id', editingSubmissionId)

    // Insert updated songs
    const inserts = toSave.map((r, i) => ({
      submission_id: editingSubmissionId,
      concert_id: concertId,
      user_id: userId,
      song_name: r.name,
      song_type: r.type,
      order_num: i + 1,
      is_encore: r.encore,
    }))
    if (inserts.length > 0) await supabase.from('setlist_songs').insert(inserts)

    setSavingEdit(false)
    setEditingSubmissionId(null)
    setEditRows([])
    await loadSubmissions(userId)
  }

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!confirm('自分のセトリ投稿を削除しますか？')) return
    await supabase.from('setlist_submissions').delete().eq('id', submissionId).eq('user_id', userId!)
    setSubmissions(prev => prev.filter(s => s.id !== submissionId))
  }

  const mySubmission = submissions.find(s => s.user_id === userId)
  const hasMySubmission = !!mySubmission
  const topSubmission = submissions[0] ?? null
  const otherSubmissions = submissions.slice(1)

  return (
    <div className="space-y-4">
      {/* Spoiler warning */}
      {!revealed && (
        <div className="glass rounded-2xl p-5 text-center space-y-3 border border-yellow-500/20">
          <p className="text-2xl">⚠️</p>
          <p className="font-bold text-white">セットリストにはネタバレが含まれます</p>
          <p className="text-xs text-[#8888aa]">これから参加する公演がある場合は注意してください</p>
          <button
            onClick={() => setRevealed(true)}
            className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm px-6 py-2.5 rounded-full transition-colors"
          >
            セトリを表示する
          </button>
        </div>
      )}

      {revealed && (
        <>
          {loading ? (
            <div className="text-center text-[#8888aa] text-sm py-6">読み込み中...</div>
          ) : submissions.length === 0 ? (
            /* Empty state */
            <div className="glass rounded-2xl p-8 text-center space-y-3">
              <p className="text-[#8888aa] text-sm">セトリがまだ投稿されていません</p>
              <p className="text-xs text-[#8888aa]">ライブ後に投稿してみよう！</p>
              <button
                onClick={() => userId ? setShowForm(true) : router.push('/login')}
                className="bg-violet-600 hover:bg-violet-500 text-white font-bold text-sm px-6 py-2.5 rounded-full transition-colors"
              >
                投稿する
              </button>
            </div>
          ) : (
            /* Submissions list */
            <div className="space-y-4">
              {/* Top submission (expanded) */}
              {topSubmission && (
                <SubmissionCard
                  submission={topSubmission}
                  isExpanded={true}
                  voted={votedSubmissionIds.has(topSubmission.id)}
                  isOwn={topSubmission.user_id === userId}
                  isEditing={editingSubmissionId === topSubmission.id}
                  editRows={editRows}
                  savingEdit={savingEdit}
                  onVote={handleVote}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={handleSaveEdit}
                  onUpdateEditRow={updateEditRow}
                  onMoveEditRow={moveEditRow}
                  onAddEditRow={addEditRow}
                  onRemoveEditRow={removeEditRow}
                  onDelete={handleDeleteSubmission}
                />
              )}

              {/* Other submissions */}
              {otherSubmissions.length > 0 && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowOthers(prev => !prev)}
                    className="flex items-center gap-2 text-sm text-[#8888aa] hover:text-white transition-colors"
                  >
                    {showOthers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    他のセトリを見る（{otherSubmissions.length}件）
                  </button>
                  {showOthers && otherSubmissions.map(sub => (
                    <SubmissionCard
                      key={sub.id}
                      submission={sub}
                      isExpanded={false}
                      voted={votedSubmissionIds.has(sub.id)}
                      isOwn={sub.user_id === userId}
                      isEditing={editingSubmissionId === sub.id}
                      editRows={editRows}
                      savingEdit={savingEdit}
                      onVote={handleVote}
                      onStartEdit={startEdit}
                      onCancelEdit={cancelEdit}
                      onSaveEdit={handleSaveEdit}
                      onUpdateEditRow={updateEditRow}
                      onMoveEditRow={moveEditRow}
                      onAddEditRow={addEditRow}
                      onRemoveEditRow={removeEditRow}
                      onDelete={handleDeleteSubmission}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* New submission button (only if user has no submission yet) */}
          {!hasMySubmission && (
            <div className="flex justify-end">
              <button
                onClick={() => userId ? setShowForm(!showForm) : router.push('/login')}
                className="text-sm border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 px-4 py-2 rounded-full transition-colors font-bold"
              >
                ＋ セトリを投稿
              </button>
            </div>
          )}

          {/* New submission form */}
          {showForm && !hasMySubmission && (
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm">セトリを投稿</h3>
                {/* Mode toggle */}
                <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setInputMode('text')}
                    className={`px-3 py-1.5 transition-colors ${inputMode === 'text' ? 'bg-violet-600 text-white' : 'text-[#8888aa] hover:text-white'}`}
                  >
                    テキスト
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('row')}
                    className={`px-3 py-1.5 transition-colors border-l border-white/10 ${inputMode === 'row' ? 'bg-violet-600 text-white' : 'text-[#8888aa] hover:text-white'}`}
                  >
                    詳細入力
                  </button>
                </div>
              </div>

              {/* テキスト貼り付けモード */}
              {inputMode === 'text' && (
                <div className="space-y-3">
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder={'曲名を1行ずつ入力\n例:\n白日\n飛行艇\nFlash!!!'}
                    rows={10}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50 resize-none font-mono"
                  />
                  <p className="text-xs text-[#8888aa]">1行に1曲ずつ入力。種別・アンコールは投稿後に編集できます。</p>
                </div>
              )}

              {/* 詳細入力モード */}
              {inputMode === 'row' && (
                <div className="space-y-2">
                  {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {/* 種別ボタン (3択) */}
                      <div className="flex rounded-lg overflow-hidden border border-white/10 shrink-0 text-[11px] font-bold">
                        {(['song', 'mc', 'other'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateRow(i, { type: t })}
                            className={`px-2 py-1.5 transition-colors ${
                              row.type === t
                                ? t === 'song' ? 'bg-violet-600 text-white'
                                  : t === 'mc' ? 'bg-blue-600 text-white'
                                  : 'bg-white/20 text-white'
                                : 'text-[#8888aa] hover:text-white'
                            } ${t !== 'song' ? 'border-l border-white/10' : ''}`}
                          >
                            {TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={row.name}
                        onChange={e => updateRow(i, { name: e.target.value })}
                        placeholder={placeholderForType(row.type)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                      />
                      <label className="flex items-center gap-1 text-xs text-[#8888aa] shrink-0 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={row.encore}
                          onChange={e => updateRow(i, { encore: e.target.checked })}
                          className="accent-violet-500"
                        />
                        EN
                      </label>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addRow}
                    className="text-sm text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-4 py-2 rounded-xl transition-colors w-full"
                  >
                    ＋ 行を追加
                  </button>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
              >
                {submitting ? '投稿中...' : '投稿する'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---- SubmissionCard ----
function SubmissionCard({
  submission,
  isExpanded: defaultExpanded,
  voted,
  isOwn,
  isEditing,
  editRows,
  savingEdit,
  onVote,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onUpdateEditRow,
  onMoveEditRow,
  onAddEditRow,
  onRemoveEditRow,
  onDelete,
}: {
  submission: Submission
  isExpanded: boolean
  voted: boolean
  isOwn: boolean
  isEditing: boolean
  editRows: EditRow[]
  savingEdit: boolean
  onVote: (id: string) => void
  onStartEdit: (sub: Submission) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onUpdateEditRow: (i: number, patch: Partial<EditRow>) => void
  onMoveEditRow: (i: number, dir: -1 | 1) => void
  onAddEditRow: () => void
  onRemoveEditRow: (i: number) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const username = submission.profiles?.username ?? '匿名'
  const timeStr = new Date(submission.created_at).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const mainSongs = submission.songs.filter(s => !s.is_encore)
  const encoreSongs = submission.songs.filter(s => s.is_encore)

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="text-left min-w-0"
          >
            <p className="text-sm font-bold text-white truncate">{username}</p>
            <p className="text-xs text-[#8888aa]">{timeStr}</p>
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOwn && !isEditing && (
            <>
              <button
                onClick={() => onStartEdit(submission)}
                className="flex items-center gap-1 text-xs text-[#8888aa] hover:text-violet-300 border border-white/10 hover:border-violet-500/40 px-2.5 py-1.5 rounded-full transition-colors"
              >
                <Pencil size={11} />
                編集
              </button>
              <button
                onClick={() => onDelete(submission.id)}
                className="text-[#8888aa] hover:text-red-400 transition-colors p-1"
              >
                <X size={14} />
              </button>
            </>
          )}
          <button
            onClick={() => onVote(submission.id)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
              voted
                ? 'bg-violet-600 text-white'
                : 'border border-white/10 text-[#8888aa] hover:border-violet-500/40 hover:text-violet-300'
            }`}
          >
            <ThumbsUp size={12} />
            <span>{submission.votes_count}</span>
          </button>
          <button
            onClick={() => setExpanded(prev => !prev)}
            className="text-[#8888aa] hover:text-white transition-colors p-1"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Edit mode */}
      {isEditing && (
        <div className="space-y-3 pt-1">
          <div className="space-y-2">
            {editRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMoveEditRow(i, -1)}
                    disabled={i === 0}
                    className="text-[#8888aa] hover:text-white disabled:opacity-20 transition-colors leading-none"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveEditRow(i, 1)}
                    disabled={i === editRows.length - 1}
                    className="text-[#8888aa] hover:text-white disabled:opacity-20 transition-colors leading-none"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateEditRow(i, { type: nextType(row.type) })}
                  className={`shrink-0 text-xs font-bold px-3 py-2 rounded-lg border transition-colors min-w-[52px] ${
                    row.type === 'song'
                      ? 'bg-violet-600/30 border-violet-500/50 text-violet-300'
                      : row.type === 'mc'
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-white/10 text-[#8888aa]'
                  }`}
                >
                  {TYPE_LABELS[row.type]}
                </button>
                <input
                  type="text"
                  value={row.name}
                  onChange={e => onUpdateEditRow(i, { name: e.target.value })}
                  placeholder={placeholderForType(row.type)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                />
                <label className="flex items-center gap-1 text-xs text-[#8888aa] shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.encore}
                    onChange={e => onUpdateEditRow(i, { encore: e.target.checked })}
                    className="accent-violet-500"
                  />
                  EN
                </label>
                <button
                  type="button"
                  onClick={() => onRemoveEditRow(i)}
                  className="shrink-0 text-[#8888aa] hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onAddEditRow}
            className="text-sm text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-4 py-2 rounded-xl transition-colors w-full"
          >
            ＋ 行を追加
          </button>
          <div className="flex gap-2">
            <button
              onClick={onSaveEdit}
              disabled={savingEdit}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-2 rounded-xl transition-colors text-sm"
            >
              {savingEdit ? '保存中...' : '保存'}
            </button>
            <button
              onClick={onCancelEdit}
              className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2 rounded-xl transition-colors text-sm"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Song list (when expanded and not editing) */}
      {expanded && !isEditing && (
        <div className="pt-1">
          {submission.songs.length === 0 ? (
            <p className="text-xs text-[#8888aa] text-center py-2">曲が登録されていません</p>
          ) : (
            <div className="space-y-4">
              {mainSongs.length > 0 && (
                <div>
                  {encoreSongs.length > 0 && (
                    <p className="text-[10px] font-bold text-[#8888aa] uppercase tracking-widest mb-2">本編</p>
                  )}
                  <div className="divide-y divide-white/5">
                    {mainSongs.map((s, i) => (
                      <SongDisplayRow key={s.id} song={s} index={i + 1} />
                    ))}
                  </div>
                </div>
              )}
              {encoreSongs.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-px bg-white/10" />
                    <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Encore</p>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <div className="divide-y divide-white/5">
                    {encoreSongs.map((s, i) => (
                      <SongDisplayRow key={s.id} song={s} index={i + 1} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && !isEditing && submission.songs.length > 0 && (
        <button onClick={() => setExpanded(true)} className="w-full text-left space-y-0.5">
          {submission.songs.filter(s => s.song_type === 'song').slice(0, 3).map((s, i) => (
            <p key={s.id} className="text-xs text-[#8888aa] truncate">
              <span className="text-[#555577] mr-2">{i + 1}</span>{s.song_name}
            </p>
          ))}
          {submission.songs.length > 3 && (
            <p className="text-xs text-violet-400/70">… 全{submission.songs.length}曲を見る</p>
          )}
        </button>
      )}
    </div>
  )
}

// ---- SongDisplayRow ----
function SongDisplayRow({ song, index }: { song: Song; index: number }) {
  if (song.song_type === 'mc') {
    return (
      <div className="flex items-center gap-3 px-1 py-2">
        <span className="text-[#555577] text-xs w-5 text-right shrink-0">—</span>
        <span className="text-xs text-[#8888aa] italic">MC</span>
      </div>
    )
  }

  if (song.song_type === 'other') {
    return (
      <div className="flex items-center gap-3 px-1 py-2">
        <span className="text-[#555577] text-xs w-5 text-right shrink-0">—</span>
        <span className="text-xs text-[#8888aa] italic">{song.song_name}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-1 py-2.5">
      <span className="text-[#555577] text-xs w-5 text-right shrink-0 font-mono">{index}</span>
      <p className="flex-1 text-white text-sm">{song.song_name}</p>
    </div>
  )
}
