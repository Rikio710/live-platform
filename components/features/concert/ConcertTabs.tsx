'use client'

import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, ShoppingBag, Music, MapPin, Star } from 'lucide-react'
import BoardTab from './BoardTab'
import MerchTab from './MerchTab'
import SetlistTab from './SetlistTab'
import NearbyTab from './NearbyTab'
import ReviewTab from './ReviewTab'

const TABS = [
  { key: 'setlist', label: 'セトリ', icon: Music },
  { key: 'board', label: '掲示板', icon: MessageSquare },
  { key: 'review', label: 'レビュー', icon: Star },
  { key: 'merch', label: '物販', icon: ShoppingBag },
  { key: 'nearby', label: '周辺', icon: MapPin },
]

export default function ConcertTabs({
  concertId,
  activeTab,
  tourId,
  concertTitle,
  artistName,
  concertDate,
  venueName,
  initialSongCount,
}: {
  concertId: string
  activeTab: string
  tourId: string | null
  concertTitle?: string
  artistName?: string
  concertDate?: string
  venueName?: string
  initialSongCount?: number
}) {
  const router = useRouter()
  const pathname = usePathname()

  const setTab = (tab: string) => {
    router.push(`${pathname}?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="space-y-4">
      {/* タブバー */}
      <div className="flex border border-white/8 rounded-2xl p-1 bg-white/2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeTab === t.key
                ? 'bg-white text-black'
                : 'text-[#8888aa] hover:text-white'
            }`}
          >
            <t.icon size={15} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      {activeTab === 'board' && <BoardTab concertId={concertId} />}
      {activeTab === 'setlist' && <SetlistTab concertId={concertId} concertTitle={concertTitle} artistName={artistName} concertDate={concertDate} venueName={venueName} initialSongCount={initialSongCount} />}
      {activeTab === 'review' && <ReviewTab concertId={concertId} />}
      {activeTab === 'merch' && <MerchTab concertId={concertId} tourId={tourId} />}
      {activeTab === 'nearby' && <NearbyTab concertId={concertId} />}
    </div>
  )
}
