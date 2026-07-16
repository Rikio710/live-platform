import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import AttendanceHistory from '@/components/features/mypage/AttendanceHistory'
import UsernameEditor from '@/components/features/mypage/UsernameEditor'
import AvatarEditor from '@/components/features/mypage/AvatarEditor'
import LogoutButton from '@/components/LogoutButton'
import LoginEventTracker from '@/components/LoginEventTracker'
import { ArtistCircleImage } from '@/components/ArtistCircleImage'
import { Ticket, Calendar, Trophy, Mic2, Heart, PlusCircle, Lock, CalendarDays } from 'lucide-react'
import type { Tables } from '@/types/supabase'

type AttendanceWithConcert = Pick<Tables<'attendances'>, 'id' | 'created_at'> & {
  concerts: (Pick<Tables<'concerts'>, 'id' | 'slug' | 'venue_name' | 'date' | 'image_url' | 'stage_name' | 'festival_event_id'> & {
    artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url'> | null
    tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
    festival_events: (Pick<Tables<'festival_events'>, 'id' | 'name' | 'image_url'> & {
      festival_groups: Pick<Tables<'festival_groups'>, 'id' | 'name'> | null
    }) | null
  }) | null
}

type FollowWithArtist = Pick<Tables<'artist_follows'>, 'artist_id'> & {
  artists: (Pick<Tables<'artists'>, 'id' | 'slug' | 'name' | 'image_url'> & {
    image_crop_x: number | null
    image_crop_y: number | null
    image_crop_scale: number | null
  }) | null
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'マイページ',
  robots: { index: false },
}

export default async function MyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* プレビューヘッダー */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-white">マイページ</h1>
        </div>

        {/* ログインCTA */}
        <div className="glass rounded-2xl p-6 border border-white/20 space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
            <Lock size={22} className="text-[#b3b3b3]" />
          </div>
          <div>
            <p className="font-black text-white text-lg">ログインして記録をはじめよう</p>
            <p className="text-sm text-[#8888aa] mt-1">参戦履歴・フォロー・セトリ投稿などの機能はログインが必要です</p>
          </div>
          <div className="flex justify-center gap-3">
            <Link href="/login" className="bg-white hover:bg-[#e0e0e0] text-black font-bold px-6 py-2.5 rounded-full text-sm transition-colors">
              ログイン / 新規登録
            </Link>
          </div>
        </div>

        {/* プレビュー：統計カード */}
        <div className="space-y-3">
          <p className="text-xs text-[#8888aa] font-bold uppercase tracking-wider">プレビュー</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 opacity-40 pointer-events-none select-none">
            {[
              { label: '総参戦回数', value: '??回', icon: Ticket },
              { label: '2026年', value: '??回', icon: Calendar },
              { label: '最多参戦', value: '——', icon: Trophy },
              { label: 'アーティスト', value: '??組', icon: Mic2 },
            ].map(s => (
              <div key={s.label} className="glass rounded-2xl p-4 text-center space-y-1">
                <div className="flex justify-center mb-1">
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
                    <s.icon size={14} className="text-[#b3b3b3]" />
                  </div>
                </div>
                <p className="text-xs text-[#8888aa]">{s.label}</p>
                <p className="font-black text-white text-lg leading-tight">{s.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* プレビュー：フォロー */}
        <div className="space-y-3 opacity-40 pointer-events-none select-none">
          <div className="flex items-center gap-2">
            <Heart size={16} className="text-pink-400" />
            <p className="text-base font-bold text-white">フォロー中のアーティスト</p>
          </div>
          <div className="glass rounded-2xl p-6 text-center text-sm text-[#8888aa]">
            ログインするとフォロー機能が使えます
          </div>
        </div>

        {/* プレビュー：参戦履歴 */}
        <div className="space-y-3 opacity-40 pointer-events-none select-none">
          <p className="text-base font-bold text-white">参戦履歴</p>
          <div className="glass rounded-2xl p-6 text-center text-sm text-[#8888aa]">
            ログインすると参戦したライブの記録が残せます
          </div>
        </div>
      </div>
    )
  }

  const { data: attendances } = await supabase
    .from('attendances')
    .select(`
      id, created_at,
      concerts(
        id, slug, venue_name, date, image_url, stage_name, festival_event_id,
        artists(id, name, image_url),
        tours(id, name, image_url),
        festival_events(id, name, image_url, festival_groups(id, name))
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const rawAttendances = (attendances ?? []) as AttendanceWithConcert[]
  const list = rawAttendances.filter((a) => a.concerts) as (AttendanceWithConcert & { concerts: NonNullable<AttendanceWithConcert['concerts']> })[]

  // 統計
  const totalCount = list.length
  const artistMap: Record<string, { name: string; count: number; image_url: string | null }> = {}
  const yearMap: Record<string, number> = {}

  for (const a of list) {
    const artistId = a.concerts.artists?.id
    const artistName = a.concerts.artists?.name ?? '不明'
    if (artistId) {
      if (!artistMap[artistId]) artistMap[artistId] = { name: artistName, count: 0, image_url: a.concerts.artists?.image_url ?? null }
      artistMap[artistId].count++
    }
    const year = new Date(a.concerts.date).getFullYear().toString()
    yearMap[year] = (yearMap[year] ?? 0) + 1
  }

  const topArtist = Object.values(artistMap).sort((a, b) => b.count - a.count)[0]
  const thisYear = new Date().getFullYear().toString()
  const thisYearCount = yearMap[thisYear] ?? 0

  const { data: followsData } = await supabase
    .from('artist_follows')
    .select('artist_id, artists(id, slug, name, image_url, image_crop_x, image_crop_y, image_crop_scale)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const rawFollows = (followsData ?? []) as unknown as FollowWithArtist[]
  const follows = rawFollows.filter((f) => f.artists) as (FollowWithArtist & { artists: NonNullable<FollowWithArtist['artists']> })[]

  const { data: profileData } = await supabase
    .from('profiles').select('username, avatar_url').eq('id', user.id).single()

  // フォロー中アーティストの今後の公演
  const today = new Date().toISOString().split('T')[0]
  const followedArtistIds = rawFollows.map(f => f.artist_id).filter(Boolean)
  const { data: upcomingForFollows } = followedArtistIds.length > 0
    ? await supabase
        .from('concerts')
        .select('id, venue_name, date, artists(id, name)')
        .in('artist_id', followedArtistIds)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(10)
    : { data: [] }

  return (
    <div className="max-w-5xl mx-auto pb-8 space-y-6">
      <Suspense fallback={null}><LoginEventTracker /></Suspense>

      {/* ===== プロフィールヘッダー ===== */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <AvatarEditor userId={user.id} initialAvatarUrl={profileData?.avatar_url ?? null} />
          <LogoutButton />
        </div>
        <UsernameEditor initialUsername={profileData?.username ?? null} />
        <p className="text-sm text-[#8888aa] mt-0.5">
          参戦 <span className="text-white font-semibold">{totalCount}</span>回
          {Object.keys(artistMap).length > 0 && (
            <> · <span className="text-white font-semibold">{Object.keys(artistMap).length}</span>組</>
          )}
        </p>
      </div>

      {/* ===== 統計 ===== */}
      <div className="px-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '総参戦回数', big: String(totalCount), unit: '回', icon: Ticket },
            { label: `${thisYear}年`, big: String(thisYearCount), unit: '回', icon: Calendar },
            { label: '最多参戦', big: topArtist?.name ?? '—', unit: '', icon: Trophy },
            { label: 'アーティスト', big: String(Object.keys(artistMap).length), unit: '組', icon: Mic2 },
          ].map(s => (
            <div key={s.label} className="glass rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                  <s.icon size={13} className="text-[#b3b3b3]" />
                </div>
                <p className="text-xs text-[#8888aa] truncate">{s.label}</p>
              </div>
              <p className="font-black text-white text-2xl leading-none truncate">
                {s.big}
                {s.unit && <span className="text-sm font-medium text-[#8888aa] ml-0.5">{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ===== アーティスト別参戦回数 ===== */}
      {Object.keys(artistMap).length > 0 && (
        <section className="px-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-[#b3b3b3]" />
            <h2 className="text-sm font-bold text-white">アーティスト別参戦回数</h2>
          </div>
          <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
            {Object.entries(artistMap)
              .sort((a, b) => b[1].count - a[1].count)
              .slice(0, 5)
              .map(([id, { name, count, image_url }], i) => (
                <Link key={id} href={`/artists/${id.slice(0, 8)}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group">
                  <span className="text-xs text-[#8888aa] w-4 shrink-0 font-mono">{i + 1}</span>
                  {image_url
                    ? <img src={image_url} alt={name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    : <div className="w-7 h-7 rounded-full bg-white/10 shrink-0 flex items-center justify-center"><Mic2 size={12} className="text-white/40" /></div>
                  }
                  <span className="flex-1 text-sm text-white group-hover:text-[#b3b3b3] transition-colors truncate">{name}</span>
                  <span className="text-sm font-bold text-white shrink-0">{count}<span className="text-xs text-[#8888aa] font-normal ml-0.5">回</span></span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {/* ===== 参戦履歴 ===== */}
      <section className="px-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ticket size={15} className="text-[#b3b3b3]" />
          <h2 className="text-sm font-bold text-white">参戦履歴</h2>
        </div>
        <AttendanceHistory attendances={list} artistMap={artistMap} yearMap={yearMap} />
      </section>

      {/* ===== フォロー中アーティスト ===== */}
      <section className="space-y-3 px-4">
        <div className="flex items-center gap-2">
          <Heart size={15} className="text-pink-400" />
          <h2 className="text-sm font-bold text-white">フォロー中のアーティスト</h2>
          {follows.length > 0 && <span className="text-xs text-[#8888aa]">{follows.length}組</span>}
        </div>
        {follows.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-[#8888aa]">
            フォロー中のアーティストがいません
            <br />
            <Link href="/artists" className="text-[#b3b3b3] hover:text-[#b3b3b3] mt-1 inline-block">アーティスト一覧へ →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-4">
            {follows.map((f) => (
              <Link key={f.artist_id} href={`/artists/${f.artists.id.slice(0, 8)}`}
                className="flex flex-col items-center gap-2 group">
                {f.artists.image_url ? (
                  <ArtistCircleImage
                    url={f.artists.image_url}
                    name={f.artists.name}
                    cropX={f.artists.image_crop_x}
                    cropY={f.artists.image_crop_y}
                    cropScale={f.artists.image_crop_scale}
                    className="w-full aspect-square"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-full bg-[#333333] flex items-center justify-center">
                    <Mic2 size={20} className="text-[#b3b3b3]" />
                  </div>
                )}
                <span className="text-xs text-[#ccccdd] text-center line-clamp-2 w-full leading-tight">{f.artists.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ===== フォロー中アーティストの今後の公演 ===== */}
      {(upcomingForFollows ?? []).length > 0 && (
        <section className="px-4 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-[#b3b3b3]" />
            <h2 className="text-sm font-bold text-white">フォロー中アーティストの今後の公演</h2>
          </div>
          <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
            {(upcomingForFollows as any[]).map(c => (
              <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors group">
                <div className="flex-1 min-w-0">
                  {c.artists?.name && <p className="text-xs text-[#b3b3b3]">{c.artists.name}</p>}
                  <p className="text-sm text-white group-hover:text-[#b3b3b3] transition-colors truncate">{c.venue_name}</p>
                </div>
                <span className="text-xs text-[#8888aa] shrink-0">{c.date}</span>
                <span className="text-[#8888aa] group-hover:text-[#b3b3b3] shrink-0">›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ===== リクエスト ===== */}
      <div className="px-4">
        <Link href="/request"
          className="flex items-center justify-between glass rounded-2xl px-5 py-4 hover:border-white/20 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              <PlusCircle size={18} className="text-[#b3b3b3]" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">アーティスト・ライブ情報を追加リクエスト</p>
              <p className="text-xs text-[#8888aa] mt-0.5">掲載されていない情報はリクエストで追加できます</p>
            </div>
          </div>
          <span className="text-[#8888aa] group-hover:text-[#b3b3b3] transition-colors">›</span>
        </Link>
      </div>
    </div>
  )
}
