import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar, MapPin, PlusCircle } from 'lucide-react'
import ArtistsSection from '@/components/ArtistsSection'
import type { Tables } from '@/types/supabase'

type UpcomingConcert = Pick<Tables<'concerts'>, 'id' | 'venue_name' | 'date' | 'start_time' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
}

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'LiveVault | ライブ・コンサートのセトリ記録・参戦管理',
  description: 'ライブ・コンサートのセットリスト記録、参戦履歴管理、リアルタイム掲示板。アーティストのライブ体験をみんなで共有するプラットフォーム。',
}

export default async function TopPage() {
  const supabase = await createClient()

  const [{ data: upcomingConcerts }, { data: popularArtists }] = await Promise.all([
    supabase
      .from('concerts')
      .select('id, venue_name, date, start_time, image_url, artists(id, name), tours(id, name, image_url)')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .limit(6),
    supabase
      .from('artists')
      .select('id, name, image_url')
      .limit(50),
  ])

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 via-transparent to-pink-900/20 pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-block bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-bold px-3 py-1 rounded-full">
            ライブ参戦体験のOS
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight">
            すべての
            <span className="gradient-text">ライブ体験</span>を
            <br className="hidden sm:block" />
            ひとつの場所に
          </h1>
          <p className="text-[#8888aa] text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            ライブ前の情報収集、当日のリアルタイム共有、<br className="hidden sm:block" />
            参戦履歴の蓄積まで一元管理。
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/mypage"
              className="bg-violet-600 hover:bg-violet-500 text-white font-bold px-6 py-3 rounded-full transition-colors text-sm">
              参戦履歴を見る
            </Link>
            <Link href="#upcoming"
              className="border border-white/10 hover:border-white/20 text-white font-bold px-6 py-3 rounded-full transition-colors text-sm">
              近日公演を見る
            </Link>
          </div>
          <div className="flex justify-center pt-1">
            <Link href="/request"
              className="flex items-center gap-2 text-[#8888aa] hover:text-violet-300 text-xs transition-colors group">
              <PlusCircle size={13} className="group-hover:text-violet-400 transition-colors" />
              アーティスト・ライブ情報を追加リクエスト
              <span className="opacity-60">›</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 近日公演 */}
      <section id="upcoming" className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <h2 className="text-lg font-bold text-white">近日開催の公演</h2>
        {(upcomingConcerts ?? []).length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">
            現在登録されている公演はありません
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(upcomingConcerts ?? [] as UpcomingConcert[]).map((c) => (
              <Link key={c.id} href={`/concerts/${c.id}`}
                className="glass rounded-2xl overflow-hidden hover:border-violet-500/40 transition-all group">
                <div className="h-36 bg-gradient-to-br from-violet-900/50 to-pink-900/30 relative">
                  {(c.image_url || c.tours?.image_url) && (
                    <img src={c.image_url ?? c.tours?.image_url ?? undefined} alt="" className="w-full h-full object-cover opacity-50 group-hover:opacity-60 transition-opacity" />
                  )}
                  <div className="absolute inset-0 flex items-end p-3">
                    <div>
                      <p className="text-xs text-violet-300 font-bold">{c.artists?.name}</p>
                      <p className="text-sm font-bold text-white leading-tight">{c.tours?.name}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <p className="text-xs text-[#8888aa] flex items-center gap-1">
                    <Calendar size={11} className="shrink-0" />
                    {new Date(c.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                    {c.start_time && ` ${c.start_time.slice(0, 5)}〜`}
                  </p>
                  <p className="text-sm font-medium text-white truncate flex items-center gap-1">
                    <MapPin size={11} className="shrink-0 text-[#8888aa]" />
                    {c.venue_name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* アーティスト */}
      {(popularArtists ?? []).length > 0 && (
        <ArtistsSection artists={popularArtists ?? []} />
      )}
    </div>
  )
}
