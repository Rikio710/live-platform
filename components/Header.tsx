'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Home, Music2, User, CalendarDays } from 'lucide-react'

export default function Header() {
  const pathname = usePathname()
  const supabase = createClient()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setLoggedIn(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setLoggedIn(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  const mypageHref = loggedIn ? '/mypage' : '/login'

  const NAV = [
    { href: '/', label: 'ホーム', icon: Home, active: pathname === '/' },
    { href: '/artists', label: 'アーティスト', icon: Music2, active: pathname.startsWith('/artists') },
    { href: '/concerts', label: '公演', icon: CalendarDays, active: pathname.startsWith('/concerts') },
    { href: '/venues', label: '会場', icon: Home, active: pathname.startsWith('/venues') },
    { href: mypageHref, label: 'マイページ', icon: User, active: pathname === '/mypage' },
  ]

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#121212]">
        {/* 1段目: ロゴ + ログイン */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-black tracking-tight text-white">LiveVault</span>
            </Link>
            <Link
              href={mypageHref}
              className="text-sm font-bold px-4 py-2 rounded-full bg-white hover:bg-[#e0e0e0] text-black transition-colors shrink-0"
            >
              {loggedIn ? 'マイページ' : 'ログイン'}
            </Link>
          </div>
        </div>

        {/* 2段目: ナビゲーションバー */}
        <div className="hidden sm:block border-b border-white/5 overflow-x-auto scrollbar-none">
          <nav className="flex items-center max-w-5xl mx-auto px-4">
            {NAV.map(n => (
              <Link key={n.href} href={n.href}
                className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  n.active
                    ? 'border-white text-white'
                    : 'border-transparent text-[#8888aa] hover:text-white'
                }`}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* スマホ ボトムナビ */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/10 bg-[#121212]">
        {NAV.map(n => {
          const Icon = n.icon
          return (
            <Link key={n.href} href={n.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${n.active ? 'text-white' : 'text-[#8888aa] hover:text-white'}`}>
              <Icon size={20} />
              <span className="text-[10px] font-medium">{n.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
