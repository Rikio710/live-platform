import Link from 'next/link'
import ArticleCard from './ArticleCard'
import { ARTICLE_CATEGORIES, type ArticleSummary } from '@/lib/articles'

export const ARTICLES_PER_PAGE = 24

/** /articles と /articles/category/[category] 共通の一覧表示 */
export default function ArticleListView({
  heading,
  intro,
  activeCategory,
  articles,
  featured,
  total,
  page,
  basePath,
}: {
  heading: string
  intro: string
  activeCategory: string | null
  articles: ArticleSummary[]
  featured: ArticleSummary[]
  total: number
  page: number
  basePath: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE))
  const tabs = [
    { href: '/articles', label: 'すべて', active: activeCategory === null },
    ...Object.entries(ARTICLE_CATEGORIES).map(([key, c]) => ({
      href: `/articles/category/${key}`, label: c.label, active: activeCategory === key,
    })),
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-white">{heading}</h1>
        <p className="text-sm text-[#8888aa] leading-relaxed">{intro}</p>
      </div>

      {/* カテゴリ（折り返して表示：横スクロールでページ幅が崩れないように） */}
      <nav className="flex flex-wrap gap-2" aria-label="カテゴリ">
        {tabs.map(t => (
          <Link key={t.href} href={t.href}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
              t.active ? 'bg-white text-black' : 'border border-white/10 text-[#8888aa] hover:text-white'
            }`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {/* ピックアップ（1ページ目のみ） */}
      {page === 1 && featured.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-white">ピックアップ</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {featured.map(a => <ArticleCard key={a.id} article={a} large />)}
          </div>
        </section>
      )}

      {articles.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-sm text-[#8888aa]">記事はまだありません</div>
      ) : (
        <section className="space-y-3">
          {page === 1 && featured.length > 0 && <h2 className="text-sm font-bold text-white">新着記事</h2>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {articles.map(a => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 pt-2" aria-label="ページ送り">
          {page > 1 ? (
            <Link href={page === 2 ? basePath : `${basePath}/page/${page - 1}`}
              className="px-4 py-2 rounded-full border border-white/10 text-sm text-white hover:border-white/30">前へ</Link>
          ) : <span className="px-4 py-2 text-sm text-white/20">前へ</span>}
          <span className="text-sm text-[#8888aa]">{page} / {totalPages}</span>
          {page < totalPages ? (
            <Link href={`${basePath}/page/${page + 1}`}
              className="px-4 py-2 rounded-full border border-white/10 text-sm text-white hover:border-white/30">次へ</Link>
          ) : <span className="px-4 py-2 text-sm text-white/20">次へ</span>}
        </nav>
      )}
    </div>
  )
}
