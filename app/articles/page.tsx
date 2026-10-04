import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ArticleListView from '@/components/features/article/ArticleListView'
import { listMetadata, loadList, parsePage } from '@/lib/articleList'

export const revalidate = 3600

type Props = { params: Promise<{ n?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return listMetadata(null, parsePage((await params).n) ?? 1)
}

export default async function ArticlesPage({ params }: Props) {
  const page = parsePage((await params).n)
  if (!page) notFound()
  const { articles, total, featured } = await loadList(null, page)
  if (page > 1 && articles.length === 0) notFound()
  return (
    <ArticleListView
      heading="記事・特集"
      intro="セトリデータをもとに、ライブの予習に役立つ記事をお届けします。"
      activeCategory={null}
      articles={articles}
      featured={featured}
      total={total}
      page={page}
      basePath="/articles"
    />
  )
}
