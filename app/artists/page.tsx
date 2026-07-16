import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()
  const { data: artists } = await supabase
    .from('artists')
    .select('id, slug, name, image_url, description')
    .order('name')

  return <ArtistList artists={artists ?? []} />
}
