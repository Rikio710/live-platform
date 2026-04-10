import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* アーティストヘッダー */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-20 h-20 rounded-2xl shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-8 w-24 rounded-full mt-3" />
        </div>
      </div>

      {/* ツアー一覧 */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-20" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 flex items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
