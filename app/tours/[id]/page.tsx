import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Calendar } from 'lucide-react'
import type { Tables } from '@/types/supabase'

type TourWithArtist = Tables<'tours'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url'> | null
}

type TourConcert = Pick<Tables<'concerts'>, 'id' | 'venue_name' | 'venue_address' | 'date' | 'start_time' | 'image_url'>

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('tours').select('name, artists(name)').eq('id', id).single()
  if (!data) return { title: 'ツアー' }
  const metaTour = data as { name: string; artists: Pick<Tables<'artists'>, 'name'> | null }
  const artistName = metaTour.artists?.name ?? ''
  return {
    title: `${artistName} ${data.name} セトリ・ライブレポ`,
    description: `${artistName}「${data.name}」の公演一覧・セットリスト・参戦記録。各会場のセトリや参戦者のリアルな情報を確認できます。`,
  }
}

export default async function TourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: tourRaw }, { data: concerts }] = await Promise.all([
    supabase.from('tours').select('*, artists(id, name, image_url)').eq('id', id).single(),
    supabase
      .from('concerts')
      .select('id, venue_name, venue_address, date, start_time, image_url')
      .eq('tour_id', id)
      .order('date', { ascending: true }),
  ])

  if (!tourRaw) notFound()

  const tour = tourRaw as TourWithArtist
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1">
        <Link href="/" className="hover:text-white transition-colors">ホーム</Link>
        <span>/</span>
        {tour.artists && (
          <>
            <Link href={`/artists/${tour.artists.id}`} className="hover:text-white transition-colors">
              {tour.artists.name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-white">{tour.name}</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        {tour.artists && (
          <Link href={`/artists/${tour.artists.id}`}
            className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200 transition-colors">
            {tour.artists.image_url && (
              <img src={tour.artists.image_url} alt="" className="w-5 h-5 rounded-full object-cover" />
            )}
            {tour.artists.name}
          </Link>
        )}
        <h1 className="text-2xl font-black text-white">{tour.name}</h1>
        {(tour.start_date || tour.end_date) && (
          <p className="text-sm text-[#8888aa] flex items-center gap-1.5">
            <Calendar size={13} className="shrink-0" />
            {tour.start_date && new Date(tour.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            {tour.start_date && tour.end_date && ' 〜 '}
            {tour.end_date && new Date(tour.end_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>

      {/* 公演一覧 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">公演一覧</h2>
          <span className="text-sm text-[#8888aa]">{(concerts ?? []).length}公演</span>
        </div>

        {(concerts ?? []).length === 0 ? (
          <p className="text-sm text-[#8888aa]">公演情報がありません</p>
        ) : (
          <div className="space-y-3">
            {(concerts ?? [] as TourConcert[]).map((c) => {
              const isPast = c.date < today
              return (
                <Link key={c.id} href={`/concerts/${c.id}`}
                  className={`glass rounded-2xl p-5 flex items-center gap-4 hover:border-violet-500/40 transition-colors group ${isPast ? 'opacity-60' : ''}`}>
                  <div className="shrink-0 text-center w-14">
                    <p className="text-xs text-[#8888aa]">
                      {new Date(c.date).toLocaleDateString('ja-JP', { month: 'short' })}
                    </p>
                    <p className="text-2xl font-black text-white">
                      {new Date(c.date).toLocaleDateString('ja-JP', { day: 'numeric' }).replace('日', '')}
                    </p>
                    <p className="text-xs text-[#8888aa]">
                      {new Date(c.date).toLocaleDateString('ja-JP', { weekday: 'short' })}
                    </p>
                  </div>
                  <div className="w-px h-12 bg-white/10 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate">
                      {c.venue_name}
                    </p>
                    {c.venue_address && (
                      <p className="text-xs text-[#8888aa] mt-0.5 truncate">{c.venue_address}</p>
                    )}
                    {c.start_time && (
                      <p className="text-xs text-[#8888aa] mt-0.5">開演 {c.start_time.slice(0, 5)}</p>
                    )}
                  </div>
                  {isPast && (
                    <span className="text-xs text-[#8888aa] shrink-0 border border-white/10 rounded-full px-2 py-0.5">終了</span>
                  )}
                  <span className="text-[#8888aa] group-hover:text-violet-300 transition-colors shrink-0">›</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
