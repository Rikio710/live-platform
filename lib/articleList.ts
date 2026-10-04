import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { siteUrl } from '@/lib/site'
import { ARTICLE_CATEGORIES, SUMMARY_SELECT, isArticleCategory, listPublishedArticles, type ArticleSummary } from '@/lib/articles'
import { ARTICLES_PER_PAGE } from '@/components/features/article/ArticleListView'

/**
 * 記事一覧（/articles, /articles/page/N, /articles/category/C, /articles/category/C/page/N）の共通処理。
 * ページ送りを ?page= ではなくパスにしているのは、searchParams を読むとページがキャッシュされなくなるため。
 */

const ALL_TITLE = '記事・特集 | ライブ定番曲ランキング・セトリ分析 | LiveVault'
const ALL_DESCRIPTION = 'アーティストごとのライブ定番曲ランキングなど、セトリデータをもとにしたライブの予習に役立つ記事・特集。'

export function parsePage(n: string | undefined): number | null {
  if (n === undefined) return 1
  return /^[1-9]\d*$/.test(n) ? Number(n) : null
}

export function listBasePath(category: string | null) {
  return category ? `/articles/category/${category}` : '/articles'
}

export function listMetadata(category: string | null, page: number): Metadata {
  const base = listBasePath(category)
  const url = `${siteUrl}${page > 1 ? `${base}/page/${page}` : base}`
  const suffix = page > 1 ? `（${page}ページ目）` : ''
  if (category && isArticleCategory(category)) {
    const c = ARTICLE_CATEGORIES[category]
    const title = `${c.title}一覧${suffix} | LiveVault`
    return { title, description: c.description, alternates: { canonical: url }, openGraph: { title, description: c.description, url } }
  }
  const title = page > 1 ? `${ALL_TITLE}${suffix}` : ALL_TITLE
  return { title, description: ALL_DESCRIPTION, alternates: { canonical: url }, openGraph: { title, description: ALL_DESCRIPTION, url } }
}

export async function loadList(category: string | null, page: number) {
  const supabase = createPublicClient()
  const [{ articles, total }, featuredRes] = await Promise.all([
    listPublishedArticles(supabase, { category: category ?? undefined, limit: ARTICLES_PER_PAGE, offset: (page - 1) * ARTICLES_PER_PAGE }),
    !category && page === 1
      ? supabase.from('articles').select(SUMMARY_SELECT).eq('status', 'published').eq('is_featured', true)
          .order('published_at', { ascending: false }).limit(2)
      : Promise.resolve({ data: [] }),
  ])
  return { articles, total, featured: ((featuredRes as { data: unknown }).data ?? []) as ArticleSummary[] }
}
