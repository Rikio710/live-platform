import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { articleImage, articlePath, categoryLabel, displayTitle, formatJaDate, type ArticleSummary } from '@/lib/articles'

/** 記事一覧のカード（1カラム〜2カラムのグリッドで使う） */
export default function ArticleCard({ article, large = false }: { article: ArticleSummary; large?: boolean }) {
  const img = articleImage(article)
  return (
    <Link
      href={articlePath(article)}
      className="glass rounded-2xl overflow-hidden hover:border-white/20 transition-all group block min-w-0"
    >
      <div className={`relative bg-gradient-to-br from-[#282828]/60 to-[#282828]/30 ${large ? 'h-44 sm:h-60' : 'h-36'}`}>
        {img.src ? (
          <img
            src={img.src}
            alt=""
            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
            style={img.position ? { objectPosition: img.position } : undefined}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-20">
            <BookOpen size={36} className="text-white" />
          </div>
        )}
        <span className="absolute top-3 left-3 text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full">
          {categoryLabel(article.category)}
        </span>
      </div>
      <div className="p-4 space-y-1.5 min-w-0">
        <h3 className={`font-bold text-white leading-snug line-clamp-2 break-words group-hover:text-[#b3b3b3] transition-colors ${large ? 'text-base sm:text-lg' : 'text-sm'}`}>
          {displayTitle(article)}
        </h3>
        {large && article.description && (
          <p className="text-xs text-[#8888aa] leading-relaxed line-clamp-2">{article.description}</p>
        )}
        <p className="text-[11px] text-[#8888aa]">{formatJaDate(article.updated_at ?? article.published_at)} 更新</p>
      </div>
    </Link>
  )
}
