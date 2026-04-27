'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminUpdateSong, adminDeleteSong, adminDeleteSubmission } from '../actions'
import { ChevronDown, ChevronUp, Plus, Trash2, Check, X, PlusCircle, Download } from 'lucide-react'
import type { LiveFansSong } from '@/app/api/admin/livefans-import/route'

type Concert = { id: string; venue_name: string; date: string; artists: { name: string } | null; tours: { name: string } | null }
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
  spotify_url: string | null
  apple_music_url: string | null
  concerts: { id: string; venue_name: string; date: string; artists: { name: string } | null } | null
}

const SONG_TYPE_LABELS: Record<string, string> = { song: '曲', mc: 'MC', other: 'その他' }
const SONG_TYPE_COLORS: Record<string, string> = {
  song: 'bg-violet-600/30 border-violet-500/50 text-violet-300',
  mc: 'bg-blue-600/20 border-blue-500/40 text-blue-300',
  other: 'bg-white/5 border-white/10 text-[#8888aa]',
}

// 一括テキストをパースして曲リストに変換
// 「アンコール」という行以降はis_encore=true
// 「MC」を含む行はsong_type='mc'
function parseBulkText(text: string): Array<{ song_name: string; song_type: 'song' | 'mc' | 'other'; is_encore: boolean }> {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '')
  const result: Array<{ song_name: string; song_type: 'song' | 'mc' | 'other'; is_encore: boolean }> = []
  let isEncore = false
  for (const line of lines) {
    if (/^(アンコール|encore|en$)/i.test(line)) {
      isEncore = true
      continue
    }
    const type: 'song' | 'mc' | 'other' = /^mc$/i.test(line) ? 'mc' : 'song'
    result.push({ song_name: line, song_type: type, is_encore: isEncore })
  }
  return result
}

export default function AdminSetlistPage() {
  const supabase = createClient()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [allConcerts, setAllConcerts] = useState<Concert[]>([])
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
  const [editingUrlsId, setEditingUrlsId] = useState<string | null>(null)
  const [urlForm, setUrlForm] = useState({ spotify: '', apple: '' })

  // 新規セトリ作成
  const [showCreate, setShowCreate] = useState(false)
  const [createConcertId, setCreateConcertId] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [creating, setCreating] = useState(false)

  // LiveFansインポート
  const [showLiveFans, setShowLiveFans] = useState(false)
  const [liveFansUrl, setLiveFansUrl] = useState('')
  const [liveFansSongs, setLiveFansSongs] = useState<LiveFansSong[] | null>(null)
  const [liveFansTitle, setLiveFansTitle] = useState('')
  const [liveFansConcertId, setLiveFansConcertId] = useState('')
  const [liveFansArtistFilter, setLiveFansArtistFilter] = useState('')
  const [liveFansTourFilter, setLiveFansTourFilter] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const loadConcerts = async () => {
    const { data } = await supabase
      .from('concerts')
      .select('id, venue_name, date, artists(name), tours(name)')
      .order('date', { ascending: false })
      .limit(200)
    setAllConcerts((data ?? []) as unknown as Concert[])
  }

  const load = async () => {
    const { data } = await supabase
      .from('setlist_submissions')
      .select('id, concert_id, user_id, votes_count, created_at, spotify_url, apple_music_url, concerts(venue_name, date, artists(name))')
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

  useEffect(() => { load(); loadConcerts() }, [])

  const handleCreate = async () => {
    if (!createConcertId || !bulkText.trim()) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data: sub, error } = await supabase
      .from('setlist_submissions')
      .insert({ concert_id: createConcertId, user_id: user.id, votes_count: 0 })
      .select('id')
      .single()

    if (error || !sub) { alert('作成に失敗しました'); setCreating(false); return }

    const parsed = parseBulkText(bulkText)
    const songRows = parsed.map((s, i) => ({
      submission_id: sub.id,
      concert_id: createConcertId,
      user_id: user.id,
      song_name: s.song_name,
      song_type: s.song_type,
      is_encore: s.is_encore,
      order_num: i + 1,
    }))

    if (songRows.length > 0) {
      await supabase.from('setlist_songs').insert(songRows)
    }

    setBulkText('')
    setCreateConcertId('')
    setShowCreate(false)
    setCreating(false)
    await load()
  }

  const concerts = Array.from(
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
    const submission = submissions.find(s => s.id === submissionId)
    if (!submission) return
    setSaving(true)
    const existing = songs[submissionId] ?? []
    const maxOrder = existing.length > 0 ? Math.max(...existing.map(s => s.order_num)) : 0
    const { data, error } = await supabase
      .from('setlist_songs')
      .insert({
        submission_id: submissionId,
        concert_id: submission.concert_id,
        user_id: submission.user_id,
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

  const startEditUrls = (sub: Submission) => {
    setEditingUrlsId(sub.id)
    setUrlForm({ spotify: sub.spotify_url ?? '', apple: sub.apple_music_url ?? '' })
  }

  const handleSaveUrls = async (subId: string) => {
    setSaving(true)
    await supabase.from('setlist_submissions').update({
      spotify_url: urlForm.spotify.trim() || null,
      apple_music_url: urlForm.apple.trim() || null,
    }).eq('id', subId)
    setSubmissions(prev => prev.map(s => s.id === subId
      ? { ...s, spotify_url: urlForm.spotify.trim() || null, apple_music_url: urlForm.apple.trim() || null }
      : s
    ))
    setEditingUrlsId(null)
    setSaving(false)
  }

  const handleFetchLiveFans = async () => {
    if (!liveFansUrl.trim()) return
    setFetching(true)
    setFetchError(null)
    setLiveFansSongs(null)
    try {
      const res = await fetch('/api/admin/livefans-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: liveFansUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setFetchError(data.error ?? '取得失敗'); return }
      setLiveFansSongs(data.songs)
      setLiveFansTitle(data.eventTitle ?? '')
    } catch { setFetchError('通信エラーが発生しました') }
    finally { setFetching(false) }
  }

  const handleImportLiveFans = async () => {
    if (!liveFansConcertId || !liveFansSongs || liveFansSongs.length === 0) return
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setImporting(false); return }

    const { data: sub, error } = await supabase
      .from('setlist_submissions')
      .insert({ concert_id: liveFansConcertId, user_id: user.id, votes_count: 0 })
      .select('id').single()

    if (error || !sub) { alert('セトリ作成に失敗しました'); setImporting(false); return }

    const rows = liveFansSongs.map(s => ({
      submission_id: sub.id,
      concert_id: liveFansConcertId,
      user_id: user.id,
      song_name: s.song_name,
      song_type: s.song_type,
      is_encore: s.is_encore,
      order_num: s.order_num,
    }))
    await supabase.from('setlist_songs').insert(rows)

    setShowLiveFans(false)
    setLiveFansUrl('')
    setLiveFansSongs(null)
    setLiveFansConcertId('')
    setLiveFansArtistFilter('')
    setLiveFansTourFilter('')
    setImporting(false)
    await load()
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
        <div className="flex items-center gap-2 flex-wrap">
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
          <button
            onClick={() => { setShowLiveFans(v => !v); setShowCreate(false) }}
            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-full transition-colors"
          >
            <Download size={15} />
            LiveFansから取込
          </button>
          <button
            onClick={() => { setShowCreate(v => !v); setShowLiveFans(false) }}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold px-4 py-2 rounded-full transition-colors"
          >
            <PlusCircle size={15} />
            セトリを新規作成
          </button>
        </div>
      </div>

      {/* LiveFansインポートパネル */}
      {showLiveFans && (
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white">LiveFansからセトリを取込</h2>
          <div className="flex gap-2">
            <input
              type="url"
              value={liveFansUrl}
              onChange={e => { setLiveFansUrl(e.target.value); setLiveFansSongs(null); setFetchError(null) }}
              placeholder="https://www.livefans.jp/events/1920263"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-green-500/50"
            />
            <button
              onClick={handleFetchLiveFans}
              disabled={fetching || !liveFansUrl.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors shrink-0"
            >
              {fetching ? '取得中...' : '取得'}
            </button>
          </div>

          {fetchError && <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{fetchError}</p>}

          {liveFansSongs && (
            <div className="space-y-4">
              {liveFansTitle && <p className="text-xs text-[#8888aa]">取得元: {liveFansTitle}</p>}
              <p className="text-xs text-green-400">{liveFansSongs.length}曲を取得（アンコール: {liveFansSongs.filter(s => s.is_encore).length}曲）</p>

              {/* プレビュー */}
              <div className="bg-white/3 rounded-xl p-3 max-h-64 overflow-y-auto space-y-1">
                {liveFansSongs.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-[#8888aa] w-5 text-right shrink-0">{s.order_num}</span>
                    {s.is_encore && <span className="text-violet-400 shrink-0">EN</span>}
                    {s.song_type === 'other' && <span className="text-[#8888aa] shrink-0">///</span>}
                    {s.song_type === 'mc' && <span className="text-blue-400 shrink-0">MC</span>}
                    <span className="text-white">{s.song_name}</span>
                    {s.memo && <span className="text-[#8888aa]">— {s.memo}</span>}
                  </div>
                ))}
              </div>

              {/* 公演選択（3段階） */}
              <div className="space-y-2">
                <label className="text-xs text-[#8888aa]">登録する公演を選択</label>
                {/* Step 1: アーティスト */}
                <select
                  value={liveFansArtistFilter}
                  onChange={e => { setLiveFansArtistFilter(e.target.value); setLiveFansTourFilter(''); setLiveFansConcertId('') }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                >
                  <option value="">① アーティストを選択...</option>
                  {[...new Map(allConcerts.filter(c => c.artists).map(c => [c.artists!.name, c.artists!.name])).values()].sort().map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {/* Step 2: ツアー */}
                {liveFansArtistFilter && (() => {
                  const tours = [...new Map(
                    allConcerts
                      .filter(c => c.artists?.name === liveFansArtistFilter && c.tours)
                      .map(c => [c.tours!.name, c.tours!.name])
                  ).values()].sort()
                  return tours.length > 0 ? (
                    <select
                      value={liveFansTourFilter}
                      onChange={e => { setLiveFansTourFilter(e.target.value); setLiveFansConcertId('') }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                    >
                      <option value="">② ツアーを選択...</option>
                      {tours.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  ) : null
                })()}
                {/* Step 3: 公演 */}
                {liveFansArtistFilter && (() => {
                  const filtered = allConcerts.filter(c =>
                    c.artists?.name === liveFansArtistFilter &&
                    (!liveFansTourFilter || c.tours?.name === liveFansTourFilter)
                  )
                  return filtered.length > 0 ? (
                    <select
                      value={liveFansConcertId}
                      onChange={e => setLiveFansConcertId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50"
                    >
                      <option value="">③ 公演を選択...</option>
                      {filtered.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.venue_name}（{formatDate(c.date)}）{c.tours?.name ? ` — ${c.tours.name}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : null
                })()}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleImportLiveFans}
                  disabled={importing || !liveFansConcertId}
                  className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-bold text-sm px-6 py-2.5 rounded-full transition-colors"
                >
                  {importing ? 'インポート中...' : 'DBに登録する'}
                </button>
                <button
                  onClick={() => { setShowLiveFans(false); setLiveFansUrl(''); setLiveFansSongs(null); setLiveFansConcertId(''); setLiveFansArtistFilter(''); setLiveFansTourFilter('') }}
                  className="border border-white/10 text-[#8888aa] hover:text-white text-sm px-6 py-2.5 rounded-full transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 新規セトリ作成パネル */}
      {showCreate && (
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white">新規セトリ一括入力</h2>

          <div className="space-y-1.5">
            <label className="text-xs text-[#8888aa]">公演</label>
            <select
              value={createConcertId}
              onChange={e => setCreateConcertId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
            >
              <option value="">公演を選択...</option>
              {allConcerts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.artists?.name} / {c.tours?.name ?? '-'} / {c.venue_name} ({formatDate(c.date)})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[#8888aa]">
              曲リスト（1行1曲 ／ 「アンコール」でアンコール区切り ／ 「MC」でMC）
            </label>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              rows={12}
              placeholder={`例:\n夜に駆ける\n猫\nハルジオン\nMC\nセプテンバーさん\nアンコール\npositiv`}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50 resize-none font-mono"
            />
            {bulkText.trim() && (
              <p className="text-xs text-[#8888aa]">
                {parseBulkText(bulkText).length}曲を認識
                （アンコール: {parseBulkText(bulkText).filter(s => s.is_encore).length}曲）
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !createConcertId || !bulkText.trim()}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-sm px-6 py-2.5 rounded-full transition-colors"
            >
              {creating ? '作成中...' : '作成する'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setBulkText(''); setCreateConcertId('') }}
              className="border border-white/10 text-[#8888aa] hover:text-white text-sm px-6 py-2.5 rounded-full transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

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
                      {sub.concerts ? `${sub.concerts.artists?.name ?? ''} ${sub.concerts.venue_name} (${formatDate(sub.concerts.date)})` : '公演不明'}
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

                    {/* プレイリストURL */}
                    <div className="border-t border-white/5 pt-3 mt-2">
                      {editingUrlsId === sub.id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#1DB954] w-20 shrink-0">Spotify</span>
                            <input type="url" value={urlForm.spotify} onChange={e => setUrlForm(f => ({ ...f, spotify: e.target.value }))}
                              placeholder="https://open.spotify.com/playlist/..."
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-[#1DB954]/50" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#fc3c44] w-20 shrink-0">Apple Music</span>
                            <input type="url" value={urlForm.apple} onChange={e => setUrlForm(f => ({ ...f, apple: e.target.value }))}
                              placeholder="https://music.apple.com/jp/playlist/..."
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-[#fc3c44]/50" />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveUrls(sub.id)} disabled={saving}
                              className="text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-full transition-colors">
                              保存
                            </button>
                            <button onClick={() => setEditingUrlsId(null)}
                              className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-4 py-1.5 rounded-full transition-colors">
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                          {sub.spotify_url
                            ? <a href={sub.spotify_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1DB954] hover:underline truncate max-w-[180px]">Spotify ✓</a>
                            : <span className="text-xs text-[#8888aa]">Spotifyなし</span>
                          }
                          {sub.apple_music_url
                            ? <a href={sub.apple_music_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#fc3c44] hover:underline truncate max-w-[180px]">Apple Music ✓</a>
                            : <span className="text-xs text-[#8888aa]">Apple Musicなし</span>
                          }
                          <button onClick={() => startEditUrls(sub)}
                            className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1 rounded-full transition-colors">
                            リンクを編集
                          </button>
                        </div>
                      )}
                    </div>

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
