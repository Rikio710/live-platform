'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mic2, Route, Ticket, CheckCircle } from 'lucide-react'

type TabType = 'artist' | 'tour' | 'concert'
type Artist = { id: string; name: string }
type Tour = { id: string; name: string; artist_id: string }

const TABS: { id: TabType; label: string; icon: React.ElementType }[] = [
  { id: 'artist', label: 'アーティスト', icon: Mic2 },
  { id: 'tour', label: 'ツアー', icon: Route },
  { id: 'concert', label: '公演', icon: Ticket },
]

export default function RequestPage() {
  const router = useRouter()
  const supabase = createClient()

  const [tab, setTab] = useState<TabType>('artist')
  const [artists, setArtists] = useState<Artist[]>([])
  const [tours, setTours] = useState<Tour[]>([])
  const [submitting, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authed, setAuthed] = useState<boolean | null>(null)

  // アーティストフォーム
  const [aName, setAName] = useState('')
  const [aImage, setAImage] = useState('')
  const [aDesc, setADesc] = useState('')
  const [aWeb, setAWeb] = useState('')
  const [aTwitter, setATwitter] = useState('')
  const [aInsta, setAInsta] = useState('')
  const [aYoutube, setAYoutube] = useState('')

  // ツアーフォーム
  const [tArtistId, setTArtistId] = useState('')
  const [tArtistFree, setTArtistFree] = useState('')
  const [tName, setTName] = useState('')
  const [tStart, setTStart] = useState('')
  const [tEnd, setTEnd] = useState('')
  const [tImage, setTImage] = useState('')

  // 公演フォーム
  const [cArtistId, setCArtistId] = useState('')
  const [cTourId, setCTourId] = useState('')
  const [cVenue, setCVenue] = useState('')
  const [cDate, setCDate] = useState('')
  const [cTime, setCTime] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setAuthed(!!user))
    supabase.from('artists').select('id, name').order('name').then(({ data }) => setArtists(data ?? []))
    supabase.from('tours').select('id, name, artist_id').order('name').then(({ data }) => setTours(data ?? []))
  }, [])

  const filteredTours = cArtistId ? tours.filter(t => t.artist_id === cArtistId) : tours

  const handleSubmit = async () => {
    setError(null)

    let payload: Record<string, string> = {}

    if (tab === 'artist') {
      if (!aName.trim()) { setError('アーティスト名は必須です'); return }
      payload = { name: aName, image_url: aImage, description: aDesc, website_url: aWeb, twitter_url: aTwitter, instagram_url: aInsta, youtube_url: aYoutube }
    } else if (tab === 'tour') {
      if (!tName.trim()) { setError('ツアー名は必須です'); return }
      if (!tArtistId && !tArtistFree.trim()) { setError('アーティストを選択または入力してください'); return }
      payload = { name: tName, artist_id: tArtistId, artist_name_free: tArtistFree, start_date: tStart, end_date: tEnd, image_url: tImage }
    } else {
      if (!cVenue.trim() || !cDate) { setError('会場と日付は必須です'); return }
      if (!cArtistId) { setError('アーティストを選択してください'); return }
      payload = { artist_id: cArtistId, tour_id: cTourId, venue_name: cVenue, date: cDate, start_time: cTime }
    }

    setSaving(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tab, payload }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '送信に失敗しました'); return }
      setDone(true)
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  if (authed === false) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-white font-bold">リクエストにはログインが必要です</p>
        <button onClick={() => router.push('/login')}
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-2.5 rounded-full text-sm transition-colors">
          ログインする
        </button>
      </div>
    )
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-5">
        <div className="flex justify-center">
          <CheckCircle size={52} className="text-violet-400" />
        </div>
        <div>
          <p className="text-white font-black text-xl">リクエストを送信しました！</p>
          <p className="text-sm text-[#8888aa] mt-2">運営が確認後、追加されます。ご協力ありがとうございます。</p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <button onClick={() => { setDone(false); setAName(''); setAImage(''); setADesc(''); setAWeb(''); setATwitter(''); setAInsta(''); setAYoutube(''); setTName(''); setTArtistId(''); setTArtistFree(''); setTStart(''); setTEnd(''); setTImage(''); setCArtistId(''); setCTourId(''); setCVenue(''); setCDate(''); setCTime('') }}
            className="border border-white/10 text-[#8888aa] hover:text-white px-5 py-2.5 rounded-full text-sm transition-colors">
            続けてリクエスト
          </button>
          <button onClick={() => router.push('/')}
            className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-5 py-2.5 rounded-full text-sm transition-colors">
            トップへ戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-xl font-black text-white">追加リクエスト</h1>
        <p className="text-sm text-[#8888aa] mt-1">登録されていないアーティスト・ツアー・公演をリクエストできます</p>
      </div>

      {/* タブ */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-colors ${
              tab === t.id ? 'bg-violet-600 text-white' : 'border border-white/10 text-[#8888aa] hover:text-white'
            }`}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* アーティストフォーム */}
      {tab === 'artist' && (
        <div className="space-y-4">
          <Field label="アーティスト名 *" value={aName} onChange={setAName} placeholder="例: Aimer" />
          <Field label="画像URL" value={aImage} onChange={setAImage} placeholder="https://..." />
          {aImage && <img src={aImage} alt="" className="w-20 h-20 rounded-xl object-cover" onError={e => (e.currentTarget.style.display = 'none')} />}
          <Field label="アーティスト紹介" value={aDesc} onChange={setADesc} placeholder="どんなアーティストか簡単に" textarea />
          <div className="border-t border-white/10 pt-4 space-y-3">
            <p className="text-xs text-[#8888aa] font-bold">公式リンク（わかる範囲でOK）</p>
            <Field label="公式サイト" value={aWeb} onChange={setAWeb} placeholder="https://..." />
            <Field label="X (Twitter)" value={aTwitter} onChange={setATwitter} placeholder="https://x.com/..." />
            <Field label="Instagram" value={aInsta} onChange={setAInsta} placeholder="https://instagram.com/..." />
            <Field label="YouTube" value={aYoutube} onChange={setAYoutube} placeholder="https://youtube.com/..." />
          </div>
        </div>
      )}

      {/* ツアーフォーム */}
      {tab === 'tour' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">アーティスト *</label>
            <select value={tArtistId} onChange={e => setTArtistId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
              <option value="">選択してください</option>
              {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              <option value="__new__">リストにない（下に入力）</option>
            </select>
          </div>
          {tArtistId === '__new__' && (
            <Field label="アーティスト名（新規）" value={tArtistFree} onChange={setTArtistFree} placeholder="例: 新しいアーティスト名" />
          )}
          <Field label="ツアー名 *" value={tName} onChange={setTName} placeholder="例: SUMMER TOUR 2025" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始日" value={tStart} onChange={setTStart} type="date" />
            <Field label="終了日" value={tEnd} onChange={setTEnd} type="date" />
          </div>
          <Field label="ビジュアル画像URL" value={tImage} onChange={setTImage} placeholder="https://..." />
          {tImage && <img src={tImage} alt="" className="w-full h-32 rounded-xl object-cover" onError={e => (e.currentTarget.style.display = 'none')} />}
        </div>
      )}

      {/* 公演フォーム */}
      {tab === 'concert' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">アーティスト *</label>
            <select value={cArtistId} onChange={e => { setCArtistId(e.target.value); setCTourId('') }}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
              <option value="">選択してください</option>
              {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#8888aa] mb-1 block">ツアー（任意）</label>
            <select value={cTourId} onChange={e => setCTourId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50">
              <option value="">ツアーなし / 不明</option>
              {filteredTours.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Field label="会場名 *" value={cVenue} onChange={setCVenue} placeholder="例: 東京ドーム" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="公演日 *" value={cDate} onChange={setCDate} type="date" />
            <Field label="開演時刻" value={cTime} onChange={setCTime} type="time" />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>}

      <button onClick={handleSubmit} disabled={submitting}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-colors">
        {submitting ? '送信中...' : 'リクエストを送信する'}
      </button>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; textarea?: boolean; type?: string
}) {
  const cls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50'
  return (
    <div>
      <label className="text-xs text-[#8888aa] mb-1 block">{label}</label>
      {textarea
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${cls} resize-none`} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      }
    </div>
  )
}
