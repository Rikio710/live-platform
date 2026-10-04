import Link from 'next/link'
import { BookOpen, ChevronRight } from 'lucide-react'

/** 既存ページ（公演・ツアー・アーティスト・曲）から記事への導線カード */
export default function ArticlePromoCard({
  href,
  title,
  label = 'ライブの予習に',
}: {
  href: string
  title: string
  label?: string
}) {
  return (
    <Link
      href={href}
      className="glass rounded-2xl p-4 flex items-center gap-3 hover:border-white/20 transition-all group min-w-0"
    >
      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
        <BookOpen size={18} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-[#8888aa]">{label}</p>
        <p className="text-sm font-bold text-white leading-snug line-clamp-2 break-words group-hover:text-[#b3b3b3] transition-colors">
          {title}
        </p>
      </div>
      <ChevronRight size={16} className="text-[#8888aa] shrink-0" />
    </Link>
  )
}
