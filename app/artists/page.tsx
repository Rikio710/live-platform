import { fetchAllRows } from '@/lib/sitemaps'
import { activeArtistIds } from '@/lib/activeArtists'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import { siteUrl } from '@/lib/site'
import ArtistList from './ArtistList'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'アーティスト一覧 セトリ・ライブ情報 | LiveVault',
  description: '乃木坂46・Mr.Children・back numberなど人気アーティストのライブセットリスト・公演記録一覧。',
  openGraph: {
    title: 'アーティスト一覧 セトリ・ライブ情報 | LiveVault',
    description: '乃木坂46・Mr.Children・back numberなど人気アーティストのライブセットリスト・公演記録一覧。',
    url: `${siteUrl}/artists`,
  },
}

export default async function ArtistsPage() {
  const supabase = createPublicClient()
  const [raw, tourRows, active] = await Promise.all([
    fetchAllRows<{ id: string; slug: string | null; name: string; image_url: string | null; image_crop_x: number | null; image_crop_y: number | null; description: string | null }>((from, to) =>
      supabase.from('artists').select('id, slug, name, image_url, image_crop_x, image_crop_y, description')
        .not('image_url', 'is', null).neq('image_url', '').order('id').range(from, to)),
    fetchAllRows<{ artist_id: string | null }>((from, to) => supabase.from('tours').select('artist_id').order('id').range(from, to)),
    activeArtistIds(),
  ])
  // 公演が1つもないアーティストは一覧に出さない（公演が入れば自動で出る）
  const activeSet = new Set(active)

  const tourCountMap = new Map<string, number>()
  for (const t of tourRows ?? []) {
    if (t.artist_id) tourCountMap.set(t.artist_id, (tourCountMap.get(t.artist_id) ?? 0) + 1)
  }

  const artists = raw
    .filter(a => activeSet.has(a.id))
    .map(a => ({ ...a, tour_count: tourCountMap.get(a.id) ?? 0 }))
    .sort((a, b) => b.tour_count - a.tour_count)

  return <ArtistList artists={artists} />
}
