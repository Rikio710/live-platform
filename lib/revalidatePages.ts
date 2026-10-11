import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasNonAscii, toSlugKey } from '@/lib/slugKey'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>

/**
 * 公演ページなどは7日間キャッシュする（ボットの巡回で毎回作り直すと Vercel・Supabase の負荷が大きいため。2026-10-12）。
 * そのかわり、データが変わったときにここで該当ページをすぐ作り直す。
 *   related=true: 公演ページに加えて、ツアー・アーティスト・会場ページも作り直す（セトリ投稿・日付の切り替わり）
 */
export async function revalidateConcertPages(admin: Client, concertIds: string[], { related = false } = {}): Promise<number> {
  const ids = [...new Set(concertIds.filter(Boolean))]
  if (ids.length === 0) return 0
  const paths = new Set<string>()
  for (const id of ids) paths.add(`/concerts/${id.slice(0, 8)}`)
  if (related) {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from('concerts').select('id, artist_id, tour_id, venue_name').in('id', ids.slice(i, i + 200))
      for (const c of (data ?? []) as { artist_id: string | null; tour_id: string | null; venue_name: string | null }[]) {
        if (c.artist_id) paths.add(`/artists/${c.artist_id.slice(0, 8)}`)
        if (c.tour_id) paths.add(`/tours/${c.tour_id.slice(0, 8)}`)
        // 会場ページは middleware で内部の ASCII の形（u-…）に書き換えて表示しているので、その形で指定する
        if (c.venue_name) paths.add(`/venues/${hasNonAscii(c.venue_name) ? toSlugKey(c.venue_name) : encodeURIComponent(c.venue_name)}`)
      }
    }
  }
  for (const p of paths) revalidatePath(p)
  return paths.size
}
