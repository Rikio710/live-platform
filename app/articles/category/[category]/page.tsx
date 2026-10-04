import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ArticleListView from '@/components/features/article/ArticleListView'
import { ARTICLE_CATEGORIES, isArticleCategory } from '@/lib/articles'
import { listMetadata, loadList, parsePage } from '@/lib/articleList'

export const revalidate = 3600

type Props = { params: Promise<{ category: string; n?: string }> }

export function generateStaticParams() {
  return Object.keys(ARTICLE_CATEGORIES).map(category => ({ category }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, n } = await params
  if (!isArticleCategory(category)) return { title: '記事' }
  return listMetadata(category, parsePage(n) ?? 1)
}

export default async function ArticleCategoryPage({ params }: Props) {
  const { category, n } = await params
  const page = parsePage(n)
  if (!isArticleCategory(category) || !page) notFound()
  const { articles, total } = await loadList(category, page)
  if (page > 1 && articles.length === 0) notFound()
  const c = ARTICLE_CATEGORIES[category]
  return (
    <ArticleListView
      heading={`${c.title}一覧`}
      intro={c.description}
      activeCategory={category}
      articles={articles}
      featured={[]}
      total={total}
      page={page}
      basePath={`/articles/category/${category}`}
    />
  )
}
