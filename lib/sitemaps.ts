import { createPublicClient } from '@/lib/supabase/public'

/** Google のサイトマップは1ファイル5万URLまで。公演は余裕をもって2.5万件ずつに分ける */
export const CONCERTS_PER_SITEMAP = 25000

/**
 * サイトマップの分割（/sitemaps/sitemap/{id}.xml）
 *   0: トップ・一覧ページ・記事・ツアー・会場・フェス
 *   1: アーティスト
 *   2〜: 公演（CONCERTS_PER_SITEMAP 件ずつ）
 */
export async function sitemapIds(): Promise<number[]> {
  const { count } = await createPublicClient().from('concerts').select('id', { count: 'exact', head: true })
  const concertFiles = Math.max(1, Math.ceil((count ?? 0) / CONCERTS_PER_SITEMAP))
  return [0, 1, ...Array.from({ length: concertFiles }, (_, i) => 2 + i)]
}

/** max_rows（1000件）を超えて全件取得する */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  limit = Infinity,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await build(from, Math.min(from + 999, limit - 1))
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}
