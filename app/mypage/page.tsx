import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import AttendanceHistory from '@/components/features/mypage/AttendanceHistory'
import UsernameEditor from '@/components/features/mypage/UsernameEditor'
import AvatarEditor from '@/components/features/mypage/AvatarEditor'
import LogoutButton from '@/components/LogoutButton'
import { Ticket, Calendar, Trophy, Mic2, Heart, PlusCircle } from 'lucide-react'
import type { Tables } from '@/types/supabase'

type AttendanceWithConcert = Pick<Tables<'attendances'>, 'id' | 'created_at'> & {
  concerts: (Pick<Tables<'concerts'>, 'id' | 'slug' | 'venue_name' | 'date' | 'image_url'> & {
    artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url'> | null
    tours: Pick<Tables<'tours'>, 'id' | 'name'> | null
  }) | null
}

type FollowWithArtist = Pick<Tables<'artist_follows'>, 'artist_id'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'slug' | 'name' | 'image_url'> | null
}

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'マイページ',
  robots: { index: false },
}

export default async function MyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: attendances } = await supabase
    .from('attendances')
    .select(`
      id, created_at,
      concerts(
        id, slug, venue_name, date, image_url,
        artists(id, name, image_url),
        tours(id, name)
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
    .select('artist_id, artists(id, slug, name, image_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const rawFollows = (followsData ?? []) as FollowWithArtist[]
  const follows = rawFollows.filter((f) => f.artists) as (FollowWithArtist & { artists: NonNullable<FollowWithArtist['artists']> })[]

  const { data: profileData } = await supabase
    .from('profiles').select('username, avatar_url').eq('id', user.id).single()

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white">マイページ</h1>
        <LogoutButton />
      </div>

      <div className="flex items-center gap-4">
        <AvatarEditor userId={user.id} initialAvatarUrl={profileData?.avatar_url ?? null} />
        <UsernameEditor initialUsername={profileData?.username ?? null} />
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '総参戦回数', value: `${totalCount}回`, icon: Ticket },
          { label: `${thisYear}年`, value: `${thisYearCount}回`, icon: Calendar },
          { label: '最多参戦', value: topArtist?.name ?? '—', icon: Trophy },
          { label: 'アーティスト', value: `${Object.keys(artistMap).length}組`, icon: Mic2 },
        ].map(s => (
          <div key={s.label} className="glass rounded-2xl p-4 text-center space-y-1">
            <div className="flex justify-center mb-1">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <s.icon size={14} className="text-violet-400" />
              </div>
            </div>
            <p className="text-xs text-[#8888aa]">{s.label}</p>
            <p className="font-black text-white text-lg leading-tight truncate">{s.value}</p>
          </div>
        ))}
      </div>

      {/* フォロー中アーティスト */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Heart size={16} className="text-pink-400" />
          <h2 className="text-base font-bold text-white">フォロー中のアーティスト</h2>
          <span className="text-xs text-[#8888aa]">{follows.length}組</span>
        </div>
        {follows.length === 0 ? (
          <div className="glass rounded-2xl p-6 text-center text-sm text-[#8888aa]">
            フォロー中のアーティストがいません
            <br />
            <Link href="/artists" className="text-violet-400 hover:text-violet-300 mt-1 inline-block">アーティスト一覧へ →</Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {follows.map((f) => (
              <Link key={f.artist_id} href={`/artists/${f.artists.slug ?? f.artists.id}`}
                className="flex items-center gap-2 glass rounded-full px-4 py-2 hover:border-pink-500/30 transition-colors text-sm font-medium">
                {f.artists.image_url ? (
                  <img src={f.artists.image_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-violet-800/60 flex items-center justify-center">
                    <Mic2 size={11} className="text-violet-400" />
                  </span>
                )}
                <span className="text-white">{f.artists.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 参戦履歴 */}
      <AttendanceHistory
        attendances={list}
        artistMap={artistMap}
        yearMap={yearMap}
      />

      {/* リクエストバナー */}
      <Link href="/request"
        className="flex items-center justify-between glass rounded-2xl px-5 py-4 hover:border-violet-500/40 transition-colors group">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
            <PlusCircle size={18} className="text-violet-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">アーティスト・ライブ情報を追加リクエスト</p>
            <p className="text-xs text-[#8888aa] mt-0.5">掲載されていない情報はリクエストで追加できます</p>
          </div>
        </div>
        <span className="text-[#8888aa] group-hover:text-violet-300 transition-colors">›</span>
      </Link>
    </div>
  )
}
