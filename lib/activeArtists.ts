import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'
import { fetchAllRows } from '@/lib/sitemaps'

/**
 * 公演があるアーティスト（主催 または 出演）の ID 一覧（2026-10-15）
 *   公演が1つもないアーティスト（約8割・以前の一括取り込みで名前だけ登録されたもの）は、
 *   中身のないページになるので、サイトマップとアーティスト一覧に出さない（ページは noindex）。公演が入れば自動で出る。
 *   1時間キャッシュ
 */
export const activeArtistIds = unstable_cache(async (): Promise<string[]> => {
  const supabase = createPublicClient()
  const [hosts, performers] = await Promise.all([
    fetchAllRows<{ artist_id: string | null }>((from, to) => supabase.from('concerts').select('artist_id').order('id').range(from, to)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetchAllRows<{ artist_id: string | null }>((from, to) => (supabase as any).from('concert_artists').select('artist_id').order('id').range(from, to)),
  ])
  return [...new Set([...hosts, ...performers].map(r => r.artist_id).filter((x): x is string => !!x))]
}, ['active-artist-ids-v1'], { revalidate: 3600 })
