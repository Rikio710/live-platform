import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* パンくず */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-28" />
      </div>

      {/* ヒーロー + 公演情報 */}
      <div className="glass rounded-2xl overflow-hidden">
        <Skeleton className="h-48 sm:h-64 rounded-none" />
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-32 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
