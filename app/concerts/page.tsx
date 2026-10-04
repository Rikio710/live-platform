import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import { siteUrl } from '@/lib/site'
import ConcertList from './ConcertList'
import { CONCERT_LIST_SELECT, toConcertItem, type ConcertListRow } from './concertItem'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'ライブ・コンサート公演一覧 | LiveVault',
  description: '近日開催・過去のライブ・コンサート公演一覧。アーティストごとのセットリスト（セトリ）・参戦記録を確認できます。',
  openGraph: {
    title: 'ライブ・コンサート公演一覧 | LiveVault',
    description: '近日開催・過去のライブ・コンサート公演一覧。アーティストごとのセットリスト（セトリ）・参戦記録を確認できます。',
    url: `${siteUrl}/concerts`,
  },
}

export default async function ConcertsPage() {
  const supabase = createPublicClient()
  const today = new Date().toISOString().split('T')[0]

  // 近日公演は全件（1000件の上限を超える場合に備えて分割取得）
  const upcomingRows: ConcertListRow[] = []
  for (let from = 0; from < 5000; from += 1000) {
    const { data } = await supabase.from('concerts').select(CONCERT_LIST_SELECT).gte('date', today)
      .order('date', { ascending: true }).range(from, from + 999)
    upcomingRows.push(...((data ?? []) as unknown as ConcertListRow[]))
    if (!data || data.length < 1000) break
  }
  const { data: past } = await supabase.from('concerts').select(CONCERT_LIST_SELECT).lt('date', today)
    .order('date', { ascending: false }).limit(100)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-white">公演一覧</h1>
        <p className="text-sm text-[#8888aa]">ライブ・コンサートのセットリスト（セトリ）・参戦記録一覧</p>
      </div>
      <ConcertList upcoming={upcomingRows.map(toConcertItem)} past={((past ?? []) as unknown as ConcertListRow[]).map(toConcertItem)} />
    </div>
  )
}
