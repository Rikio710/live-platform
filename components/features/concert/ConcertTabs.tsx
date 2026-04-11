'use client'

import { useRouter, usePathname } from 'next/navigation'
import { MessageSquare, ShoppingBag, Music, MapPin } from 'lucide-react'
import BoardTab from './BoardTab'
import MerchTab from './MerchTab'
import SetlistTab from './SetlistTab'
import NearbyTab from './NearbyTab'

const TABS = [
  { key: 'board', label: '掲示板', icon: MessageSquare },
  { key: 'merch', label: '物販', icon: ShoppingBag },
  { key: 'setlist', label: 'セトリ', icon: Music },
  { key: 'nearby', label: '周辺', icon: MapPin },
]

export default function ConcertTabs({
  concertId,
  activeTab,
  tourId,
  spotifyUrl,
  appleMusicUrl,
}: {
  concertId: string
  activeTab: string
  tourId: string | null
  spotifyUrl: string | null
  appleMusicUrl: string | null
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
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === t.key
                ? 'bg-violet-600 text-white'
                : 'text-[#8888aa] hover:text-white'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      {activeTab === 'board' && <BoardTab concertId={concertId} />}
      {activeTab === 'merch' && <MerchTab concertId={concertId} tourId={tourId} />}
      {activeTab === 'setlist' && <SetlistTab concertId={concertId} spotifyUrl={spotifyUrl} appleMusicUrl={appleMusicUrl} />}
      {activeTab === 'nearby' && <NearbyTab concertId={concertId} />}
    </div>
  )
}
