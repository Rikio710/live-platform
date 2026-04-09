import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import ConcertTabs from '@/components/features/concert/ConcertTabs'
import AttendButton from '@/components/features/concert/AttendButton'
import { Calendar, MapPin } from 'lucide-react'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('concerts')
    .select('venue_name, date, artists(name), tours(name)')
    .eq('id', id)
    .single()
  if (!data) return { title: '公演' }
  const d = data as any
  return {
    title: `${d.artists?.name} ${d.tours?.name} - ${d.venue_name}`,
    description: `${d.artists?.name}の公演。${new Date(data.date).toLocaleDateString('ja-JP')} ${d.venue_name}`,
  }
}

export default async function ConcertPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab = 'board' } = await searchParams
  const supabase = await createClient()

  const [{ data: concert }, { count: attendCount }] = await Promise.all([
    supabase
      .from('concerts')
      .select('*, artists(id, name, image_url), tours(id, name, image_url)')
      .eq('id', id)
      .single(),
    supabase
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('concert_id', id),
  ])

  if (!concert) notFound()

  const c = concert as any
  const dateStr = new Date(c.date).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1 flex-wrap">
        <Link href="/" className="hover:text-white transition-colors">ホーム</Link>
        <span>/</span>
        {c.artists && (
          <>
            <Link href={`/artists/${c.artists.id}`} className="hover:text-white transition-colors">{c.artists.name}</Link>
            <span>/</span>
          </>
        )}
        {c.tours && (
          <>
            <Link href={`/tours/${c.tours.id}`} className="hover:text-white transition-colors">{c.tours.name}</Link>
            <span>/</span>
          </>
        )}
        <span className="text-white">{c.venue_name}</span>
      </nav>

      {/* アートワーク + 公演情報 */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="relative h-48 sm:h-64 bg-gradient-to-br from-violet-900/60 to-pink-900/40">
          {(c.image_url || c.tours?.image_url) && (
            <img src={c.image_url || c.tours.image_url} alt="" className="w-full h-full object-cover opacity-40" />
          )}
          <div className="absolute inset-0 flex items-end p-5">
            <div className="space-y-1">
              {c.artists && (
                <Link href={`/artists/${c.artists.id}`}
                  className="text-sm text-violet-300 font-bold hover:text-violet-200 transition-colors">
                  {c.artists.name}
                </Link>
              )}
              {c.tours && (
                <p className="text-lg font-black text-white leading-tight">{c.tours.name}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-[#8888aa]">
              <Calendar size={14} className="shrink-0" />
              <span>{dateStr}</span>
              {c.start_time && <span className="text-white font-medium">{c.start_time.slice(0, 5)} 開演</span>}
            </div>
            <div className="flex items-center gap-2 text-sm text-[#8888aa]">
              <MapPin size={14} className="shrink-0" />
              <span className="text-white font-medium">{c.venue_name}</span>
            </div>
            {c.venue_address && (
              <div className="flex items-center gap-2 text-xs text-[#8888aa]">
                <span className="w-4" />
                <span>{c.venue_address}</span>
              </div>
            )}
          </div>

          {/* 参戦登録 */}
          <div className="flex items-center gap-4">
            <AttendButton concertId={id} />
            <span className="text-sm text-[#8888aa]">
              <span className="text-white font-bold">{attendCount ?? 0}</span> 人が参戦登録
            </span>
          </div>
        </div>
      </div>

      {/* タブコンテンツ */}
      <ConcertTabs concertId={id} activeTab={tab} tourId={c.tours?.id ?? null} />
    </div>
  )
}
