import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Google のサイトマップは1ファイル5万URLまで。公演は1万件ずつに分ける
 * （Vercel のデータキャッシュは1件2MBまでなので、1ファイルの中身をキャッシュできる大きさにする）
 */
export const CONCERTS_PER_SITEMAP = 10000

/**
 * 用意しておくサイトマップの番号（ビルド時に DB を読まずに決める。公演 30万件ぶん）。
 * データがない番号は空のサイトマップになり、まとめ（/sitemap.xml）には載せない。
 * ※ ビルド時に DB を読むと、DB が混んでいるときにデプロイが失敗するため（2026-10-12）
 */
export const SITEMAP_FILE_IDS = Array.from({ length: 32 }, (_, i) => i)

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
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  limit = Infinity,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await build(from, Math.min(from + 999, limit - 1))
    if (error?.code === 'PGRST103') break // 件数を超えた範囲（データのないサイトマップ番号）
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

/** まとめ（/sitemap.xml）に載せる番号。1時間キャッシュ */
export const cachedSitemapIds = unstable_cache(sitemapIds, ['sitemap-ids-v2'], { revalidate: 3600 })
