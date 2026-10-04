import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import { Tent } from 'lucide-react'

export const metadata: Metadata = {
  title: 'フェス一覧 | LiveVault',
  description: '国内フェス・野外イベントのライブ・セットリスト情報。COUNTDOWN JAPANなどの出演アーティスト・セトリをLiveVaultで確認。',
}

export const revalidate = 3600

export default async function FestivalsPage() {
  const supabase = createPublicClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: groups } = await (supabase as any)
    .from('festival_groups')
    .select('id, name, slug, image_url, festival_events(id, start_date, end_date, concerts(id))')
    .not('name', 'is', null)
    .order('name')

  const festivals = (groups ?? []).map((g: {
    id: string; name: string; slug: string | null; image_url: string | null
    festival_events: { id: string; start_date: string; end_date: string | null; concerts: { id: string }[] }[]
  }) => {
    const events = g.festival_events ?? []
    const totalConcerts = events.reduce((s: number, e: { concerts: { id: string }[] }) => s + (e.concerts?.length ?? 0), 0)
    const years = events.map((e: { start_date: string }) => new Date(e.start_date).getFullYear()).sort((a: number, b: number) => a - b)
    const yearRange = years.length === 0 ? null : years.length === 1 ? `${years[0]}` : `${years[0]}〜${years[years.length - 1]}`
    return { ...g, events, totalConcerts, yearRange, href: `/festivals/${g.slug ?? g.id.slice(0, 8)}` }
  })

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">フェス一覧</h1>
        <p className="text-sm text-[#8888aa] mt-1">{festivals.length}件のフェス・野外イベント</p>
      </div>

      {festivals.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-[#8888aa] text-sm">
          フェス情報はまだありません
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {festivals.map((g: {
            id: string; name: string; image_url: string | null
            events: { id: string }[]; totalConcerts: number; yearRange: string | null; href: string
          }) => (
            <Link
              key={g.id}
              href={g.href}
              className="group glass rounded-2xl overflow-hidden hover:border-white/20 border border-white/8 transition-all flex gap-4 p-4 items-center"
            >
              {g.image_url ? (
                <img src={g.image_url} alt={g.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[#282828] flex items-center justify-center shrink-0">
                  <Tent size={24} className="text-[#8888aa]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate group-hover:text-white/90">{g.name}</p>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  {g.events.length}回開催
                  {g.yearRange && ` · ${g.yearRange}`}
                </p>
                {g.totalConcerts > 0 && (
                  <p className="text-xs text-[#555] mt-0.5">{g.totalConcerts}公演</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
