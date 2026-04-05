import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { Mic2, Route } from 'lucide-react'
import FollowButton from '@/components/features/artist/FollowButton'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('artists').select('name').eq('id', id).single()
  return { title: data?.name ?? 'アーティスト' }
}

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: artist }, { data: tours }] = await Promise.all([
    supabase.from('artists').select('*').eq('id', id).single(),
    supabase.from('tours').select('id, name, start_date, end_date, image_url').eq('artist_id', id).order('start_date', { ascending: false }),
  ])

  if (!artist) notFound()

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        {artist.image_url ? (
          <img src={artist.image_url} alt={artist.name} className="w-20 h-20 rounded-2xl object-cover" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-800 to-pink-800 flex items-center justify-center">
            <Mic2 size={32} className="text-white/70" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-black text-white">{artist.name}</h1>
          {artist.description && (
            <p className="text-sm text-[#8888aa] mt-1 leading-relaxed">{artist.description}</p>
          )}
          <div className="mt-3">
            <FollowButton artistId={id} />
          </div>
        </div>
      </div>

      {/* ツアー一覧 */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white">ツアー</h2>
        {(tours ?? []).length === 0 ? (
          <p className="text-sm text-[#8888aa]">ツアー情報がありません</p>
        ) : (
          <div className="space-y-3">
            {(tours ?? []).map((t: any) => (
              <Link key={t.id} href={`/tours/${t.id}`}
                className="glass rounded-2xl p-5 flex items-center gap-4 hover:border-violet-500/40 transition-colors group">
                {t.image_url ? (
                  <img src={t.image_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-800/60 to-pink-800/60 shrink-0 flex items-center justify-center">
                    <Route size={22} className="text-white/60" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white group-hover:text-violet-300 transition-colors truncate">{t.name}</p>
                  {(t.start_date || t.end_date) && (
                    <p className="text-xs text-[#8888aa] mt-0.5">
                      {t.start_date && new Date(t.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {t.start_date && t.end_date && ' 〜 '}
                      {t.end_date && new Date(t.end_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
                <span className="text-[#8888aa] group-hover:text-violet-300 transition-colors">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
