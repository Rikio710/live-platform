'use client'

import Link from 'next/link'
import RevalidateButton from './RevalidateButton'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Menu, X, LayoutDashboard, Ticket, ListMusic, Music,
  Mic2, Route, Tent, Building2, Rss, Music2,
  MessageSquare, ShoppingBag, PlusCircle, Mail, UserCircle, MapPin, FileText,
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: null,
    items: [{ href: '/admin', label: 'ダッシュボード', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'コンテンツ',
    items: [
      { href: '/admin/artists', label: 'アーティスト', icon: Mic2 },
      { href: '/admin/tours', label: 'ツアー', icon: Route },
      { href: '/admin/concerts', label: '公演', icon: Ticket },
      { href: '/admin/festivals', label: 'フェス', icon: Tent },
      { href: '/admin/venues', label: '会場', icon: Building2 },
      { href: '/admin/setlist', label: 'セトリ', icon: ListMusic },
      { href: '/admin/songs', label: '曲管理', icon: Music },
      { href: '/admin/articles', label: '記事', icon: FileText },
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

export default function AdminHamburger() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 text-[#b3b3b3] hover:text-white transition-colors"
        aria-label="メニューを開く"
      >
        <Menu size={22} />
      </button>

      {open && (
        <>
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/60 z-50"
            onClick={() => setOpen(false)}
          />
          {/* ドロワー（右から） */}
          <div className="fixed top-0 right-0 bottom-0 w-72 bg-[#0d0d14] z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 h-14 border-b border-white/5 shrink-0">
              <p className="text-sm font-bold text-white">管理メニュー</p>
              <button onClick={() => setOpen(false)} className="text-[#8888aa] p-1">
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
              {NAV_GROUPS.map((group, gi) => (
                <div key={gi}>
                  {group.label && (
                    <p className="text-[10px] font-bold text-[#555566] uppercase tracking-wider px-3 mb-1">
                      {group.label}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {group.items.map(n => {
                      const active = isActive(n.href, (n as any).exact)
                      return (
                        <Link
                          key={n.href}
                          href={n.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                            active
                              ? 'bg-white/10 text-white'
                              : 'text-[#8888aa] hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <n.icon size={16} />
                          <span>{n.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="border-t border-white/5 pt-3 mt-3">
                <RevalidateButton />
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  )
}
