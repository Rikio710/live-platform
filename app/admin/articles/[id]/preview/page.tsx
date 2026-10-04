import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import ArticleView, { ARTICLE_SELECT, type ArticleWithArtist } from '@/components/features/article/ArticleView'

// 下書きを含む記事のプレビュー（管理者のみ。/admin 配下なので layout でログイン・管理者チェック済み）
export const metadata: Metadata = { title: '記事プレビュー', robots: { index: false, follow: false } }

export default async function ArticlePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  const { data } = await admin.from('articles').select(ARTICLE_SELECT).eq('id', id).maybeSingle()
  if (!data) notFound()
  return <ArticleView article={data as unknown as ArticleWithArtist} preview supabase={admin} />
}
