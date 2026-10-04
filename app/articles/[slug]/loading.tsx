import { Skeleton } from '@/components/ui/Skeleton'

// 記事ページを開くまでの間に表示（タップしてすぐ画面が切り替わるように）
export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <Skeleton className="h-3 w-40" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  )
}
