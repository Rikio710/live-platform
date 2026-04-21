import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { PlusCircle } from 'lucide-react'
import ArtistsSection from '@/components/ArtistsSection'
import UpcomingConcerts from '@/components/UpcomingConcerts'
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
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight">
            ライブを、もっと
            <span className="gradient-text">深く</span>。
          </h1>
          <p className="text-[#8888aa] text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
            すべてのライブ体験を、ひとつの場所に。<br />
            セトリ、掲示板、参戦記録が一つのアプリに。
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
          <div className="flex justify-center pt-2">
            <Link href="/request"
              className="flex items-center gap-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 hover:border-violet-500/50 text-violet-300 hover:text-violet-200 font-bold px-5 py-2.5 rounded-full transition-all text-sm">
              <PlusCircle size={15} />
              アーティスト・ライブ情報を追加リクエスト
            </Link>
          </div>
        </div>
      </section>

      {/* 近日公演 */}
      <section id="upcoming" className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <h2 className="text-lg font-bold text-white">近日開催の公演</h2>
        <UpcomingConcerts initialConcerts={(upcomingConcerts ?? []) as UpcomingConcert[]} />
      </section>

      {/* アーティスト */}
      {(popularArtists ?? []).length > 0 && (
        <ArtistsSection artists={popularArtists ?? []} />
      )}
    </div>
  )
}
