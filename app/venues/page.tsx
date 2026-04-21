import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Metadata } from 'next'
import { MapPin } from 'lucide-react'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'ライブ会場一覧 セトリ・公演情報',
  description: '全国のライブ・コンサート会場一覧。会場ごとのセットリスト・公演記録を確認できます。',
}

export default async function VenuesPage() {
  const supabase = await createClient()

  const { data: concerts } = await supabase
    .from('concerts')
    .select('venue_name, venue_address')
    .order('venue_name')

  // 会場ごとに集計
  const venueMap = new Map<string, { address: string | null; count: number }>()
  for (const c of concerts ?? []) {
    if (!c.venue_name) continue
    const existing = venueMap.get(c.venue_name)
    if (existing) {
      existing.count++
    } else {
      venueMap.set(c.venue_name, { address: c.venue_address ?? null, count: 1 })
    }
  }

  const venues = Array.from(venueMap.entries())
    .map(([name, { address, count }]) => ({ name, address, count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-white">ライブ会場一覧</h1>
        <p className="text-sm text-[#8888aa]">全国のライブ・コンサート会場のセトリ・公演情報</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {venues.map(v => (
          <Link
            key={v.name}
            href={`/venues/${encodeURIComponent(v.name)}`}
            className="glass rounded-2xl p-4 hover:border-violet-500/40 transition-colors group"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin size={16} className="text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-sm group-hover:text-violet-300 transition-colors leading-snug">{v.name}</p>
                {v.address && (
                  <p className="text-xs text-[#8888aa] mt-0.5 truncate">{v.address}</p>
                )}
                <p className="text-xs text-[#8888aa] mt-1">{v.count}公演</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
