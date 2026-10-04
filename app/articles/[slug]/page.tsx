import { cache } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { articlePath } from '@/lib/articles'
import ArticleView, { ARTICLE_SELECT, buildArticleMetadata, type ArticleWithArtist } from '@/components/features/article/ArticleView'

// 公開記事は ISR（1時間キャッシュ）。Cookie を読むとキャッシュが効かなくなるので、
// ここでは Cookie を読まないクライアントだけを使う。下書きは /admin/articles/[id]/preview で確認する。
export const revalidate = 3600

/**
 * デプロイ時には生成せず、初回アクセス時に生成してキャッシュする（ISR）。
 * デプロイ時に全記事を並列生成すると DB の statement timeout でビルドが失敗するため。
 */
export function generateStaticParams() {
  return []
}

/** URL の値（記事番号、または旧URLの slug）から公開記事を取得 */
const getArticle = cache(async (key: string): Promise<ArticleWithArtist | null> => {
  const q = createPublicClient().from('articles').select(ARTICLE_SELECT).eq('status', 'published')
  const { data } = await (/^\d+$/.test(key) ? q.eq('number', Number(key)) : q.eq('slug', key)).maybeSingle()
  return (data as unknown as ArticleWithArtist | null) ?? null
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getArticle(decodeURIComponent(slug))
  if (!a) return { title: '記事' }
  return buildArticleMetadata(a, createPublicClient(), false)
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const key = decodeURIComponent(rawSlug)
  const a = await getArticle(key)
  if (!a) notFound()
  // 旧URL（slug）→ 番号URL
  if (!/^\d+$/.test(key)) permanentRedirect(articlePath(a))
  return <ArticleView article={a} preview={false} supabase={createPublicClient()} />
}
