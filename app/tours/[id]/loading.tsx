import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* パンくず */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-40" />
      </div>

      {/* ツアーヘッダー */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* 公演一覧 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 flex items-center gap-4">
              <div className="shrink-0 w-14 space-y-1 text-center">
                <Skeleton className="h-3 w-8 mx-auto" />
                <Skeleton className="h-7 w-8 mx-auto" />
                <Skeleton className="h-3 w-8 mx-auto" />
              </div>
              <div className="w-px h-12 bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
