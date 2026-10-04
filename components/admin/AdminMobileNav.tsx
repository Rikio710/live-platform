'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Ticket, ListMusic, Music, MoreHorizontal, X,
  Mic2, Route, Tent, Building2, Rss, Music2,
  MessageSquare, ShoppingBag, PlusCircle, Mail, UserCircle, MapPin,
} from 'lucide-react'

const BOTTOM = [
  { href: '/admin', label: 'ホーム', icon: LayoutDashboard, exact: true },
  { href: '/admin/concerts', label: '公演', icon: Ticket },
  { href: '/admin/setlist', label: 'セトリ', icon: ListMusic },
  { href: '/admin/songs', label: '曲管理', icon: Music },
]

const DRAWER_GROUPS = [
  {
    label: 'コンテンツ',
    items: [
      { href: '/admin/artists', label: 'アーティスト', icon: Mic2 },
      { href: '/admin/tours', label: 'ツアー', icon: Route },
      { href: '/admin/festivals', label: 'フェス', icon: Tent },
      { href: '/admin/venues', label: '会場', icon: Building2 },
    ],
  },
  {
    label: '取込',
    items: [
      { href: '/admin/livefans-auto', label: 'LiveFans自動取込', icon: Rss },
      { href: '/admin/spotify-import', label: 'Spotify取込', icon: Music2 },
    ],
  },
  {
    label: 'コミュニティ',
    items: [
      { href: '/admin/posts', label: '掲示板', icon: MessageSquare },
      { href: '/admin/merch', label: 'グッズ', icon: ShoppingBag },
      { href: '/admin/requests', label: 'リクエスト', icon: PlusCircle },
      { href: '/admin/contact', label: 'お問い合わせ', icon: Mail },
    ],
  },
  {
    label: '設定',
    items: [
      { href: '/admin/avatars', label: 'アバター', icon: UserCircle },
      { href: '/admin/nearby', label: '周辺情報', icon: MapPin },
    ],
  },
]

export default function AdminMobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <>
      {/* ボトムバー */}
      <nav className="sm:hidden flex border-t border-white/5 bg-[#0d0d14]">
        {BOTTOM.map(n => {
          const active = isActive(n.href, n.exact)
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${active ? 'text-white' : 'text-[#8888aa]'}`}
            >
              <n.icon size={20} />
              <span className="text-[10px]">{n.label}</span>
            </Link>
          )
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex flex-col items-center gap-1 py-3 text-[#8888aa] active:text-white transition-colors"
        >
          <MoreHorizontal size={20} />
          <span className="text-[10px]">もっと見る</span>
        </button>
      </nav>

      {/* ドロワー */}
      {open && (
        <>
          {/* オーバーレイ */}
          <div
            className="sm:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => setOpen(false)}
          />
          {/* シート */}
          <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d14] border-t border-white/10 rounded-t-2xl max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <p className="text-sm font-bold text-white">メニュー</p>
              <button onClick={() => setOpen(false)} className="text-[#8888aa] p-1">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 py-3 space-y-5 pb-8">
              {DRAWER_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold text-[#555566] uppercase tracking-wider mb-2 px-1">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map(item => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors ${active ? 'bg-white/10 text-white' : 'bg-white/5 text-[#b3b3b3]'}`}
                        >
                          <item.icon size={16} className="shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
