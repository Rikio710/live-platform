'use client'

import { useState, useEffect } from 'react'
import AdminModal from '@/components/admin/AdminModal'
import { Trash2, Plus } from 'lucide-react'

type Artist = { id: string; name: string }
type Tour = { id: string; name: string; start_date: string | null; end_date: string | null; image_url: string | null; tour_artists: { artists: Artist | null }[]; concerts: { id: string; setlist_submissions: { count: number }[] }[] }
type Form = { artist_id: string; name: string; image_url: string }
type ConcertRow = { _id: string; venue_name: string; date: string; start_time: string; event_url?: string; additional_artists?: string[] }
type CsvTourRow = { group_url: string; tour_name: string; concert_count: number; date_from: string; date_to: string; group_id: number }
type ConcertNeed = { id: string; date: string; venue_name: string; artist_name: string; tour_name: string }
type TourConcert = { id: string; artist_id: string; tour_id: string | null; date: string; venue_name: string; start_time: string | null; setlist_submissions?: { count: number }[] }

const EMPTY: Form = { artist_id: '', name: '', image_url: '' }
let _rowId = 0
const newRow = (): ConcertRow => ({ _id: String(++_rowId), venue_name: '', date: '', start_time: '' })

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseCsvRows(text: string): CsvTourRow[] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  const idx = (key: string) => headers.indexOf(key)
  return lines.slice(1).map(l => {
    const cols = parseCSVLine(l)
    return {
      group_url: cols[idx('group_url')]?.trim() ?? '',
      tour_name: cols[idx('tour_name')]?.trim() ?? '',
      concert_count: parseInt(cols[idx('concert_count')]) || 0,
      date_from: cols[idx('date_from')]?.trim() ?? '',
      date_to: cols[idx('date_to')]?.trim() ?? '',
      group_id: parseInt(cols[idx('group_id')]) || 0,
    }
  }).filter(r => r.group_url.startsWith('http'))
}

export default function AdminToursPage() {
  const [tours, setTours] = useState<Tour[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [filterArtistId, setFilterArtistId] = useState('')
  const [filterNoImage, setFilterNoImage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Tour | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [concertRows, setConcertRows] = useState<ConcertRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [groupByArtist, setGroupByArtist] = useState(false)
  const [dupModal, setDupModal] = useState(false)

  // セトリ補完
  const [fillModal, setFillModal] = useState(false)
  const [fillConcerts, setFillConcerts] = useState<ConcertNeed[]>([])
  const [fillLoading, setFillLoading] = useState(false)
  const [fillRunning, setFillRunning] = useState(false)
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number; imported: number; skipped: number; errors: number } | null>(null)

  // URLインポート
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSetlists, setImportSetlists] = useState(false)
  const [importResult, setImportResult] = useState<{ setlists_added: number } | null>(null)
  const [detectedArtists, setDetectedArtists] = useState<{ id: string | null; name: string }[]>([])

  // アーティスト複数選択
  const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([])
  const [artistSearch, setArtistSearch] = useState('')
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false)

  // 公演一覧モーダル
  const [concertsModal, setConcertsModal] = useState<Tour | null>(null)
  const [tourConcerts, setTourConcerts] = useState<TourConcert[]>([])
  const [tourConcertsLoading, setTourConcertsLoading] = useState(false)
  const [editingConcert, setEditingConcert] = useState<TourConcert | null>(null)
  const [concertEditForm, setConcertEditForm] = useState({ date: '', venue_name: '', start_time: '' })
  const [concertSaving, setConcertSaving] = useState(false)

  // CSV一括取込
  const [csvModal, setCsvModal] = useState(false)
  const [csvArtistId, setCsvArtistId] = useState('')
  const [csvRows, setCsvRows] = useState<CsvTourRow[]>([])
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set())
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState<{ done: number; total: number; current: string; errors: string[] } | null>(null)

  const load = async () => {
    try {
      const [trRes, arRes] = await Promise.all([
        fetch('/api/admin/tours'),
        fetch('/api/admin/artists'),
      ])
      if (!trRes.ok || !arRes.ok) throw new Error('fetch failed')
      const [tr, ar] = await Promise.all([trRes.json(), arRes.json()])
      setTours(tr); setArtists(ar)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openCreate = () => {
    setForm(EMPTY)
    setConcertRows([])
    setImportUrl('')
    setImportError(null)
    setImportSetlists(false)
    setDetectedArtists([])
    setSelectedArtistIds([])
    setArtistSearch('')
    setArtistDropdownOpen(false)
    setEditing(null)
    setError(null)
    setModal('create')
  }
  const openEdit = (t: Tour) => {
    const taArtistIds = (t.tour_artists ?? []).map(ta => ta.artists?.id).filter(Boolean) as string[]
    setForm({ artist_id: taArtistIds[0] ?? '', name: t.name, image_url: t.image_url ?? '' })
    setSelectedArtistIds(taArtistIds)
    setDetectedArtists([])
    setArtistSearch('')
    setArtistDropdownOpen(false)
    setEditing(t); setError(null); setModal('edit')
  }

  const handleImport = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportError(null)
    try {
      const res = await fetch('/api/admin/schedule-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setImportError(data.error ?? '取得失敗'); return }
      if (data.title) setForm(f => ({ ...f, name: f.name || data.title }))
      if (data.concerts?.length > 0) {
        setConcertRows(data.concerts.map((c: any) => ({ ...c, _id: String(++_rowId) })))
        // 出演アーティストを自動検出（大文字小文字・前後スペース無視でマッチ）
        const allNames = [...new Set<string>(data.concerts.flatMap((c: any) => c.additional_artists ?? []))]
        if (allNames.length > 0) {
          const detected = allNames.map((name: string) => ({
            name,
            id: artists.find(a => a.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null,
          }))
          setDetectedArtists(detected)
          const matchedIds = detected.filter(d => d.id).map(d => d.id!)
          if (matchedIds.length > 0) setSelectedArtistIds(matchedIds)
        }
      } else {
        setImportError('公演情報が見つかりませんでした。手動で入力してください。')
      }
    } catch {
      setImportError('ネットワークエラー')
    } finally {
      setImporting(false)
    }
  }

  const updateRow = (id: string, patch: Partial<ConcertRow>) =>
    setConcertRows(prev => prev.map(r => r._id === id ? { ...r, ...patch } : r))
  const removeRow = (id: string) =>
    setConcertRows(prev => prev.filter(r => r._id !== id))

  const handleSave = async () => {
    const isEdit = modal === 'edit' && editing
    const mainArtistId = selectedArtistIds[0]
    if (!mainArtistId) { setError('アーティストを選択してください'); return }
    if (!form.name.trim()) { setError('ツアー名は必須です'); return }
    setSaving(true); setError(null)
    try {
      const groupIdFromUrl = importUrl.match(/\/groups\/(\d+)/)?.[1]
      // 追加アーティストの名前を取得し、全公演の additional_artists にマージ
      const additionalNames = selectedArtistIds.slice(1)
        .map(id => artists.find(a => a.id === id)?.name)
        .filter(Boolean) as string[]
      const concerts = concertRows.filter(r => r.venue_name && r.date).map(r => ({
        ...r,
        additional_artists: [...new Set([...(r.additional_artists ?? []), ...additionalNames])],
      }))
      const body = isEdit
        ? { ...form, artist_id: mainArtistId, all_artist_ids: selectedArtistIds }
        : { ...form, artist_id: mainArtistId, concerts, import_setlists: importSetlists, livefans_group_id: groupIdFromUrl ? parseInt(groupIdFromUrl) : null, additional_artist_ids: selectedArtistIds.slice(1) }
      const res = await fetch(isEdit ? `/api/admin/tours/${editing.id}` : '/api/admin/tours', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '保存に失敗しました'); return }
      if (isEdit) {
        setTours(prev => prev.map(t => t.id === editing.id ? data : t))
      } else {
        if (data.setlists_added > 0) setImportResult({ setlists_added: data.setlists_added })
        await load()
      }
      setModal(null)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  const openFillModal = async () => {
    setFillModal(true)
    setFillLoading(true)
    setFillProgress(null)
    setFillConcerts([])
    try {
      const res = await fetch('/api/admin/setlist-fill')
      const data = await res.json()
      setFillConcerts(data.concerts ?? [])
    } catch {
      setFillConcerts([])
    } finally {
      setFillLoading(false)
    }
  }

  const runFill = async () => {
    if (fillConcerts.length === 0) return
    setFillRunning(true)
    let imported = 0, skipped = 0, errors = 0
    for (let i = 0; i < fillConcerts.length; i++) {
      setFillProgress({ done: i, total: fillConcerts.length, imported, skipped, errors })
      try {
        const res = await fetch('/api/admin/setlist-fill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concertId: fillConcerts[i].id }),
        })
        const data = await res.json()
        if (data.ok) imported++; else skipped++
      } catch {
        errors++
      }
      if (i < fillConcerts.length - 1) await new Promise(r => setTimeout(r, 600))
    }
    setFillProgress({ done: fillConcerts.length, total: fillConcerts.length, imported, skipped, errors })
    setFillRunning(false)
  }

  const handleCreateArtist = async (name: string) => {
    const res = await fetch('/api/admin/artists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()
    if (!res.ok) { alert('アーティスト作成に失敗しました'); return }
    setArtists(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setDetectedArtists(prev => prev.map(d => d.name === name ? { ...d, id: data.id } : d))
    setSelectedArtistIds(prev => prev.includes(data.id) ? prev : [...prev, data.id])
  }

  const handleDelete = async (t: Tour) => {
    if (!confirm(`「${t.name}」を削除しますか？関連する公演も全て削除されます。`)) return
    try {
      const res = await fetch(`/api/admin/tours/${t.id}`, { method: 'DELETE' })
      if (res.ok) setTours(prev => prev.filter(x => x.id !== t.id))
      else alert('削除に失敗しました')
    } catch {
      alert('ネットワークエラーが発生しました')
    }
  }

  const openConcertsModal = async (t: Tour) => {
    setConcertsModal(t)
    setEditingConcert(null)
    setTourConcertsLoading(true)
    setTourConcerts([])
    try {
      const res = await fetch(`/api/admin/concerts?tour_id=${t.id}`)
      if (res.ok) setTourConcerts(await res.json())
    } finally {
      setTourConcertsLoading(false)
    }
  }

  const openEditConcert = (c: TourConcert) => {
    setEditingConcert(c)
    setConcertEditForm({ date: c.date, venue_name: c.venue_name, start_time: c.start_time ?? '' })
  }

  const saveConcert = async () => {
    if (!editingConcert) return
    setConcertSaving(true)
    try {
      const res = await fetch(`/api/admin/concerts/${editingConcert.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: editingConcert.artist_id,
          tour_id: editingConcert.tour_id,
          venue_name: concertEditForm.venue_name,
          date: concertEditForm.date,
          start_time: concertEditForm.start_time || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setTourConcerts(prev => prev.map(c => c.id === editingConcert.id ? updated : c))
        setEditingConcert(null)
      }
    } finally {
      setConcertSaving(false)
    }
  }

  const deleteConcert = async (c: TourConcert) => {
    if (!confirm(`${c.date} ${c.venue_name} を削除しますか？`)) return
    const res = await fetch(`/api/admin/concerts/${c.id}`, { method: 'DELETE' })
    if (res.ok) {
      setTourConcerts(prev => prev.filter(x => x.id !== c.id))
      if (concertsModal) {
        setTours(prev => prev.map(t => t.id === concertsModal.id
          ? { ...t, concerts: t.concerts.filter(x => x.id !== c.id) }
          : t))
      }
    } else {
      alert('削除に失敗しました')
    }
  }

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCsvRows(text)
      setCsvRows(rows)
      setCsvSelected(new Set(rows.map((_, i) => i)))
      setCsvProgress(null)
    }
    reader.readAsText(file)
  }

  const handleCsvImport = async () => {
    const selectedRows = csvRows.filter((_, i) => csvSelected.has(i))
    if (!csvArtistId || selectedRows.length === 0) return
    setCsvImporting(true)
    const errors: string[] = []
    for (let i = 0; i < selectedRows.length; i++) {
      const row = selectedRows[i]
      setCsvProgress({ done: i, total: selectedRows.length, current: row.tour_name, errors: [...errors] })
      try {
        const importRes = await fetch('/api/admin/schedule-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: row.group_url }),
        })
        const importData = await importRes.json()
        if (!importRes.ok) { errors.push(`${row.tour_name.slice(0, 30)}: 公演取得失敗`); continue }
        const tourRes = await fetch('/api/admin/tours', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artist_id: csvArtistId, name: row.tour_name || importData.title, concerts: importData.concerts ?? [], import_setlists: false, livefans_group_id: row.group_id || null }),
        })
        const tourData = await tourRes.json()
        if (!tourRes.ok) { errors.push(`${row.tour_name.slice(0, 30)}: 作成失敗`); continue }
        setTours(prev => [tourData, ...prev])
      } catch {
        errors.push(`${row.tour_name.slice(0, 30)}: エラー`)
      }
    }
    setCsvProgress({ done: selectedRows.length, total: selectedRows.length, current: '', errors })
    setCsvImporting(false)
  }

  const renderTourRow = (t: Tour, showArtist: boolean) => {
    const concertCount = t.concerts?.length ?? 0
    const setlistCount = t.concerts?.reduce((sum, c) => sum + (c.setlist_submissions?.[0]?.count ?? 0), 0) ?? 0
    return (
      <div key={t.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-white truncate">{t.name}</p>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {showArtist && (
              <span className="text-xs bg-white/5 text-[#b3b3b3] px-2 py-0.5 rounded-full">
                {(t.tour_artists ?? []).map(ta => ta.artists?.name).filter(Boolean).join(' / ')}
              </span>
            )}
            <span className="text-xs text-[#8888aa]">{concertCount}公演</span>
            {setlistCount > 0 && <span className="text-xs text-[#8888aa]">セトリ{setlistCount}件</span>}
            {t.image_url
              ? <span className="text-xs text-[#8888aa]">画像あり</span>
              : <span className="text-xs text-red-400/60">画像なし</span>
            }
            {(t.start_date || t.end_date) && (
              <span className="text-xs text-[#8888aa]">
                {t.start_date && new Date(t.start_date).toLocaleDateString('ja-JP')}
                {t.start_date && t.end_date && ' 〜 '}
                {t.end_date && new Date(t.end_date).toLocaleDateString('ja-JP')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => openConcertsModal(t)}
            className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">公演</button>
          <button onClick={() => openEdit(t)}
            className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">編集</button>
          <button onClick={() => handleDelete(t)}
            className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors">削除</button>
        </div>
      </div>
    )
  }

  const filteredTours = tours
    .filter(t => !filterArtistId || (t.tour_artists ?? []).some(ta => ta.artists?.id === filterArtistId))
    .filter(t => !filterNoImage || !t.image_url)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">ツアー管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">
            {(filterArtistId || filterNoImage) ? `${filteredTours.length}件` : `全${tours.length}件`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/admin/export" download
            className="border border-white/10 text-[#8888aa] hover:text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
            エクスポート
          </a>
          <button
            onClick={() => { setCsvModal(true); setCsvRows([]); setCsvSelected(new Set()); setCsvArtistId(''); setCsvProgress(null) }}
            className="border border-white/10 text-[#8888aa] hover:text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
            CSV取込
          </button>
          <button onClick={openFillModal}
            className="border border-white/10 text-[#8888aa] hover:text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
            セトリ補完
          </button>
          <button onClick={() => setDupModal(true)}
            className="border border-white/10 text-[#8888aa] hover:text-white font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
            重複チェック
          </button>
          <button onClick={openCreate}
            className="bg-white hover:bg-[#e0e0e0] text-black font-bold text-sm px-4 py-2.5 rounded-full transition-colors">
            ＋ 追加
          </button>
        </div>
      </div>

      {importResult && importResult.setlists_added > 0 && (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">
          <p className="text-sm text-green-400 flex-1">セトリを {importResult.setlists_added}件 取込みました</p>
          <button onClick={() => setImportResult(null)} className="text-xs text-[#8888aa] hover:text-white transition-colors">✕</button>
        </div>
      )}

      {/* フィルター */}
      {!loading && !loadError && artists.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filterArtistId}
            onChange={e => setFilterArtistId(e.target.value)}
            className="w-full sm:w-64 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/30"
          >
            <option value="">すべてのアーティスト</option>
            {artists.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {!filterArtistId && (
            <button
              onClick={() => setGroupByArtist(v => !v)}
              className={`text-sm px-4 py-2.5 rounded-xl border transition-colors ${groupByArtist ? 'bg-white text-black border-white font-bold' : 'border-white/10 text-[#8888aa] hover:text-white'}`}
            >
              アーティスト別
            </button>
          )}
          <button
            onClick={() => setFilterNoImage(v => !v)}
            className={`text-sm px-4 py-2.5 rounded-xl border transition-colors ${filterNoImage ? 'bg-white text-black border-white font-bold' : 'border-white/10 text-[#8888aa] hover:text-white'}`}
          >
            画像なし
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : loadError ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-red-400 text-sm">データの読み込みに失敗しました</p>
          <button onClick={load} className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-4 py-2 rounded-full transition-colors">再試行</button>
        </div>
      ) : filteredTours.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
          {(filterArtistId || filterNoImage) ? '該当するツアーはありません' : 'ツアーがまだ登録されていません'}
        </div>
      ) : groupByArtist && !filterArtistId ? (
        <div className="space-y-4">
          {artists
            .filter(a => filteredTours.some(t => (t.tour_artists ?? []).some(ta => ta.artists?.id === a.id)))
            .map(a => {
              const artistTours = filteredTours.filter(t => (t.tour_artists ?? []).some(ta => ta.artists?.id === a.id))
              return (
                <div key={a.id}>
                  <p className="text-xs font-bold text-[#8888aa] tracking-wider px-1 pb-1.5">
                    {a.name} <span className="font-normal">({artistTours.length}件)</span>
                  </p>
                  <div className="space-y-2">
                    {artistTours.map(t => renderTourRow(t, false))}
                  </div>
                </div>
              )
            })
          }
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTours.map(t => renderTourRow(t, !filterArtistId))}
        </div>
      )}

      {concertsModal && (
        <AdminModal title={`${concertsModal.name} — 公演一覧`} onClose={() => { setConcertsModal(null); setEditingConcert(null) }}>
          {editingConcert ? (
            <div className="space-y-4">
              <button onClick={() => setEditingConcert(null)} className="text-xs text-[#8888aa] hover:text-white transition-colors">← 戻る</button>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#8888aa] mb-1 block">日付</label>
                  <input type="date" value={concertEditForm.date} onChange={e => setConcertEditForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-[#8888aa] mb-1 block">会場</label>
                  <input type="text" value={concertEditForm.venue_name} onChange={e => setConcertEditForm(f => ({ ...f, venue_name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
                </div>
                <div>
                  <label className="text-xs text-[#8888aa] mb-1 block">開始時刻</label>
                  <input type="time" value={concertEditForm.start_time} onChange={e => setConcertEditForm(f => ({ ...f, start_time: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingConcert(null)}
                  className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                  キャンセル
                </button>
                <button onClick={saveConcert} disabled={concertSaving || !concertEditForm.venue_name || !concertEditForm.date}
                  className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                  {concertSaving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {tourConcertsLoading ? (
                <p className="text-[#8888aa] text-sm text-center py-6">読み込み中...</p>
              ) : tourConcerts.length === 0 ? (
                <p className="text-[#8888aa] text-sm text-center py-6">公演が登録されていません</p>
              ) : (
                tourConcerts.map(c => (
                  <div key={c.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-mono">{c.date}</p>
                      <p className="text-xs text-[#8888aa] mt-0.5 truncate">{c.venue_name}{c.start_time && ` · ${c.start_time}`}</p>
                    </div>
                    {(c.setlist_submissions?.[0]?.count ?? 0) > 0 && (
                      <span className="flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        <span className="text-[11px] text-green-400">セトリあり</span>
                      </span>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => openEditConcert(c)}
                        className="text-xs border border-white/10 text-[#8888aa] hover:text-white px-2.5 py-1.5 rounded-full transition-colors">編集</button>
                      <button onClick={() => deleteConcert(c)}
                        className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-2.5 py-1.5 rounded-full transition-colors">削除</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </AdminModal>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <AdminModal title={modal === 'create' ? 'ツアーを追加' : 'ツアーを編集'} onClose={() => setModal(null)}>
          <div className="space-y-4">

            {/* URLインポート（新規作成のみ） */}
            {modal === 'create' && (
              <div className="space-y-2">
                <label className="text-xs text-[#8888aa] block">URLからインポート（livefans.jp など）</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleImport()}
                    placeholder="https://www.livefans.jp/groups/..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
                  />
                  <button
                    onClick={handleImport}
                    disabled={importing || !importUrl.trim()}
                    className="bg-white hover:bg-[#e0e0e0] disabled:opacity-40 text-black text-sm font-bold px-4 py-2 rounded-xl transition-colors shrink-0"
                  >
                    {importing ? '取得中...' : '取得'}
                  </button>
                </div>
                {importError && <p className="text-xs text-yellow-400">{importError}</p>}
                <div className="border-t border-white/8 pt-2" />
              </div>
            )}

            {/* 基本情報 */}
            {modal === 'create' ? (
              <div className="space-y-2">
                <label className="text-xs text-[#8888aa] block">アーティスト *</label>
                {/* 選択済みリスト */}
                {selectedArtistIds.length > 0 && (
                  <div className="border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
                    {selectedArtistIds.map((id, i) => {
                      const a = artists.find(x => x.id === id)
                      return (
                        <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.03]">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${i === 0 ? 'bg-white text-black' : 'bg-white/10 text-[#8888aa]'}`}>
                            {i === 0 ? '主催' : '出演'}
                          </span>
                          <span className="flex-1 text-sm text-white">{a?.name}</span>
                          <button type="button" onClick={() => setSelectedArtistIds(prev => prev.filter(x => x !== id))}
                            className="text-[#8888aa] hover:text-red-400 transition-colors text-xs shrink-0">削除</button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* 未登録の検出アーティスト */}
                {detectedArtists.filter(d => !d.id).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {detectedArtists.filter(d => !d.id).map(d => (
                      <div key={d.name} className="flex items-center gap-1">
                        <span className="text-xs text-[#555566] px-2.5 py-1 border border-white/10 rounded-full">{d.name}</span>
                        <button type="button" onClick={() => handleCreateArtist(d.name)}
                          className="text-[10px] text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-400/50 px-2 py-1 rounded-full transition-colors">
                          作成
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* 検索+ドロップダウン */}
                <div className="relative">
                  <input
                    type="text"
                    value={artistSearch}
                    onChange={e => { setArtistSearch(e.target.value); setArtistDropdownOpen(true) }}
                    onFocus={() => setArtistDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setArtistDropdownOpen(false), 150)}
                    placeholder="アーティストを検索して追加..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
                  />
                  {artistDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                      {artists
                        .filter(a => !selectedArtistIds.includes(a.id) && a.name.toLowerCase().includes(artistSearch.toLowerCase()))
                        .slice(0, 30)
                        .map(a => (
                          <button key={a.id} type="button"
                            onMouseDown={() => {
                              setSelectedArtistIds(prev => [...prev, a.id])
                              setArtistSearch('')
                              setArtistDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#b3b3b3] hover:bg-white/5 hover:text-white transition-colors">
                            {a.name}
                          </button>
                        ))
                      }
                      {artists.filter(a => !selectedArtistIds.includes(a.id) && a.name.toLowerCase().includes(artistSearch.toLowerCase())).length === 0 && (
                        <p className="px-4 py-3 text-xs text-[#555566]">該当なし</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs text-[#8888aa] block">アーティスト *</label>
                {/* 選択済みリスト */}
                {selectedArtistIds.length > 0 && (
                  <div className="border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
                    {selectedArtistIds.map((id, i) => {
                      const a = artists.find(x => x.id === id)
                      return (
                        <div key={id} className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.03]">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${i === 0 ? 'bg-white text-black' : 'bg-white/10 text-[#8888aa]'}`}>
                            {i === 0 ? '主催' : '出演'}
                          </span>
                          <span className="flex-1 text-sm text-white">{a?.name}</span>
                          <button type="button" onClick={() => setSelectedArtistIds(prev => prev.filter(x => x !== id))}
                            className="text-[#8888aa] hover:text-red-400 transition-colors text-xs shrink-0">削除</button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* 検索+ドロップダウン */}
                <div className="relative">
                  <input
                    type="text"
                    value={artistSearch}
                    onChange={e => { setArtistSearch(e.target.value); setArtistDropdownOpen(true) }}
                    onFocus={() => setArtistDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setArtistDropdownOpen(false), 150)}
                    placeholder="アーティストを検索して追加..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
                  />
                  {artistDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto">
                      {artists
                        .filter(a => !selectedArtistIds.includes(a.id) && a.name.toLowerCase().includes(artistSearch.toLowerCase()))
                        .slice(0, 30)
                        .map(a => (
                          <button key={a.id} type="button"
                            onMouseDown={() => {
                              setSelectedArtistIds(prev => [...prev, a.id])
                              setArtistSearch('')
                              setArtistDropdownOpen(false)
                            }}
                            className="w-full text-left px-4 py-2.5 text-sm text-[#b3b3b3] hover:bg-white/5 hover:text-white transition-colors">
                            {a.name}
                          </button>
                        ))
                      }
                      {artists.filter(a => !selectedArtistIds.includes(a.id) && a.name.toLowerCase().includes(artistSearch.toLowerCase())).length === 0 && (
                        <p className="px-4 py-3 text-xs text-[#555566]">該当なし</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            <Field label="ツアー名 *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="例: Live Tour 2026" />
            <Field label="画像URL" value={form.image_url} onChange={v => setForm(f => ({ ...f, image_url: v }))} placeholder="https://..." />

            {/* 公演リスト（新規作成のみ） */}
            {modal === 'create' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#8888aa]">公演 {concertRows.length > 0 && `（${concertRows.length}件）`}</label>
                  <button
                    onClick={() => setConcertRows(prev => [...prev, newRow()])}
                    className="flex items-center gap-1 text-xs text-[#b3b3b3] hover:text-[#b3b3b3] transition-colors"
                  >
                    <Plus size={12} />行を追加
                  </button>
                </div>
                {concertRows.length > 0 && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {concertRows.map(row => (
                      <div key={row._id} className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          value={row.venue_name}
                          onChange={e => updateRow(row._id, { venue_name: e.target.value })}
                          placeholder="会場名"
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30"
                        />
                        <input
                          type="date"
                          value={row.date}
                          onChange={e => updateRow(row._id, { date: e.target.value })}
                          className="w-32 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                        />
                        <input
                          type="time"
                          value={row.start_time.slice(0, 5)}
                          onChange={e => updateRow(row._id, { start_time: e.target.value + ':00' })}
                          className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
                        />
                        <button onClick={() => removeRow(row._id)} className="text-[#8888aa] hover:text-red-400 transition-colors shrink-0">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* セトリ同時取込オプション（過去公演 & event_url あり） */}
            {modal === 'create' && (() => {
              const today = new Date().toISOString().split('T')[0]
              const pastWithUrl = concertRows.filter(r => r.date && r.date < today && r.event_url)
              if (pastWithUrl.length === 0) return null
              return (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={importSetlists}
                    onChange={e => setImportSetlists(e.target.checked)}
                    className="accent-white w-3.5 h-3.5"
                  />
                  <span className="text-sm text-[#b3b3b3]">過去公演のセトリも同時に取込む</span>
                  <span className="text-xs text-[#8888aa]">（{pastWithUrl.length}件）</span>
                </label>
              )
            })()}

            {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModal(null)} className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">キャンセル</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                {saving ? (importSetlists ? 'ツアー保存＆セトリ取込中...' : '保存中...') : modal === 'create' && concertRows.length > 0 ? `保存（公演${concertRows.filter(r => r.venue_name && r.date).length}件）` : '保存'}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {/* CSV一括取込モーダル */}
      {csvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !csvImporting && setCsvModal(false)} />
          <div className="relative w-full max-w-2xl bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
              <h2 className="font-bold text-white text-base">CSV一括取込</h2>
              {!csvImporting && (
                <button onClick={() => setCsvModal(false)} className="text-[#8888aa] hover:text-white text-xl leading-none transition-colors">×</button>
              )}
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">

              {/* アーティスト選択 */}
              <div>
                <label className="text-xs text-[#8888aa] mb-1 block">アーティスト *</label>
                <select value={csvArtistId} onChange={e => setCsvArtistId(e.target.value)} disabled={csvImporting}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-50">
                  <option value="">選択してください</option>
                  {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* ファイル選択 */}
              {csvRows.length === 0 && !csvProgress && (
                <div>
                  <label className="text-xs text-[#8888aa] mb-2 block">CSVファイル（scrape_livefans.py の出力）</label>
                  <input type="file" accept=".csv" onChange={handleCsvFile}
                    className="w-full text-sm text-[#b3b3b3] file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-white file:text-black hover:file:bg-[#e0e0e0] file:cursor-pointer" />
                </div>
              )}

              {/* ツアー一覧（チェックボックス） */}
              {csvRows.length > 0 && !csvProgress && (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-[#b3b3b3]">{csvRows.length}件読込</span>
                    <button onClick={() => setCsvSelected(new Set(csvRows.map((_, i) => i)))}
                      className="text-xs text-[#8888aa] hover:text-white transition-colors">全選択</button>
                    <button onClick={() => setCsvSelected(new Set())}
                      className="text-xs text-[#8888aa] hover:text-white transition-colors">全解除</button>
                    {csvArtistId && (() => {
                      const artistName = artists.find(a => a.id === csvArtistId)?.name ?? ''
                      if (!artistName) return null
                      return (
                        <button
                          onClick={() => {
                            const next = new Set<number>()
                            csvRows.forEach((r, i) => { if (r.tour_name.startsWith(artistName)) next.add(i) })
                            setCsvSelected(next)
                          }}
                          className="text-xs text-[#8888aa] hover:text-white transition-colors">単独のみ</button>
                      )
                    })()}
                    <span className="ml-auto text-xs text-[#8888aa]">選択: {csvSelected.size}件</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                    {csvRows.map((row, i) => (
                      <label key={i} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] cursor-pointer">
                        <input type="checkbox" checked={csvSelected.has(i)} onChange={e => {
                          const next = new Set(csvSelected)
                          if (e.target.checked) next.add(i); else next.delete(i)
                          setCsvSelected(next)
                        }} className="accent-white shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{row.tour_name}</p>
                          <p className="text-xs text-[#8888aa]">
                            {row.date_from}{row.date_from !== row.date_to ? ` 〜 ${row.date_to}` : ''} ・ {row.concert_count}公演
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {/* 進捗 */}
              {csvProgress && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#b3b3b3]">{csvProgress.done} / {csvProgress.total}</span>
                    {!csvImporting && <span className="text-sm text-green-400">完了</span>}
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div className="bg-white h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${csvProgress.total ? Math.round(csvProgress.done / csvProgress.total * 100) : 0}%` }} />
                  </div>
                  {csvProgress.current && <p className="text-xs text-[#8888aa] truncate">処理中: {csvProgress.current}</p>}
                  {csvProgress.errors.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {csvProgress.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-400">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ボタン */}
              {!csvProgress && (
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setCsvModal(false)} disabled={csvImporting}
                    className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40">
                    キャンセル
                  </button>
                  <button onClick={handleCsvImport}
                    disabled={csvImporting || !csvArtistId || csvSelected.size === 0}
                    className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                    {csvImporting ? '取込中...' : `${csvSelected.size}件を取込`}
                  </button>
                </div>
              )}
              {csvProgress && !csvImporting && (
                <button onClick={() => setCsvModal(false)}
                  className="w-full border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                  閉じる
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {fillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !fillRunning && setFillModal(false)} />
          <div className="relative w-full max-w-2xl bg-[#12121a] border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
              <h2 className="font-bold text-white text-base">セトリ補完</h2>
              {!fillRunning && (
                <button onClick={() => setFillModal(false)} className="text-[#8888aa] hover:text-white text-xl leading-none transition-colors">×</button>
              )}
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              {fillLoading ? (
                <p className="text-sm text-[#8888aa] text-center py-6">対象公演を確認中...</p>
              ) : !fillProgress ? (
                fillConcerts.length === 0 ? (
                  <p className="text-sm text-[#8888aa] text-center py-6">補完が必要な公演はありません</p>
                ) : (
                  <>
                    <p className="text-sm text-[#b3b3b3]">
                      LiveFansのイベントページからセトリを自動取得します。<br />
                      <span className="text-[#8888aa]">対象: {fillConcerts.length}公演（セトリ未登録 ＆ LiveFans IDあり）</span>
                    </p>
                    <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                      {fillConcerts.map(c => (
                        <div key={c.id} className="px-3 py-2.5">
                          <p className="text-sm text-white">{c.artist_name} — {c.venue_name}</p>
                          <p className="text-xs text-[#8888aa]">{c.tour_name} ・ {c.date}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[#b3b3b3]">{fillProgress.done} / {fillProgress.total}</span>
                    {!fillRunning && <span className="text-sm text-green-400">完了</span>}
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1.5">
                    <div className="bg-white h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${fillProgress.total ? Math.round(fillProgress.done / fillProgress.total * 100) : 0}%` }} />
                  </div>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-400">{fillProgress.imported}件取込</span>
                    <span className="text-[#8888aa]">{fillProgress.skipped}件スキップ</span>
                    {fillProgress.errors > 0 && <span className="text-red-400">{fillProgress.errors}件エラー</span>}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                {!fillProgress ? (
                  <>
                    <button onClick={() => setFillModal(false)} disabled={fillRunning}
                      className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                      キャンセル
                    </button>
                    <button onClick={runFill} disabled={fillLoading || fillRunning || fillConcerts.length === 0}
                      className="flex-1 bg-white hover:bg-[#e0e0e0] disabled:opacity-50 text-black font-bold py-2.5 rounded-xl text-sm transition-colors">
                      {fillConcerts.length > 0 ? `${fillConcerts.length}件を補完` : '対象なし'}
                    </button>
                  </>
                ) : !fillRunning && (
                  <button onClick={() => setFillModal(false)}
                    className="w-full border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors">
                    閉じる
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {dupModal && (() => {
        const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s\u3000]+/g, '')
        const artistDups = artists
          .map(a => {
            const artistTours = tours.filter(t => (t.tour_artists ?? []).some(ta => ta.artists?.id === a.id))
            const pairs: [Tour, Tour][] = []
            for (let i = 0; i < artistTours.length; i++) {
              for (let j = i + 1; j < artistTours.length; j++) {
                const na = norm(artistTours[i].name)
                const nb = norm(artistTours[j].name)
                if (na === nb || na.includes(nb) || nb.includes(na)) {
                  pairs.push([artistTours[i], artistTours[j]])
                }
              }
            }
            return { artist: a, pairs }
          })
          .filter(x => x.pairs.length > 0)

        return (
          <AdminModal title="重複ツアーチェック" onClose={() => setDupModal(false)}>
            {artistDups.length === 0 ? (
              <p className="text-sm text-[#8888aa] text-center py-6">重複するツアーは見つかりませんでした</p>
            ) : (
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
                {artistDups.map(({ artist, pairs }) => (
                  <div key={artist.id}>
                    <p className="text-xs font-bold text-[#8888aa] tracking-wider mb-2">{artist.name}</p>
                    <div className="space-y-3">
                      {pairs.map(([a, b], i) => {
                        const countA = a.concerts?.length ?? 0
                        const countB = b.concerts?.length ?? 0
                        return (
                          <div key={i} className="bg-white/5 rounded-xl p-3 space-y-2">
                            {([a, b] as Tour[]).map(t => {
                              const count = t.concerts?.length ?? 0
                              const other = t.id === a.id ? countB : countA
                              const isLess = count < other || (count === other && !t.image_url)
                              return (
                                <div key={t.id} className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm truncate ${isLess ? 'text-[#8888aa]' : 'text-white font-bold'}`}>{t.name}</p>
                                    <p className="text-xs text-[#8888aa]">{count}公演{t.image_url ? ' ・ 画像あり' : ' ・ 画像なし'}</p>
                                  </div>
                                  <button
                                    onClick={() => handleDelete(t)}
                                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors shrink-0 ${isLess ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-white/10 text-[#8888aa] hover:text-white'}`}
                                  >
                                    削除
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminModal>
        )
      })()}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-[#8888aa] mb-1 block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-white/30" />
    </div>
  )
}
