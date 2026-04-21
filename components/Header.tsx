'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Home, Music2, User, MapPin } from 'lucide-react'

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
    { href: '/venues', label: '会場', icon: MapPin, active: pathname.startsWith('/venues') },
    { href: mypageHref, label: 'マイページ', icon: User, active: pathname === '/mypage' },
  ]

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg font-black tracking-tight gradient-text">LiveVault</span>
          </Link>

          {/* PC ナビ */}
          <nav className="hidden sm:flex items-center gap-6 text-sm text-[#8888aa]">
            {NAV.map(n => (
              <Link key={n.href} href={n.href}
                className={`hover:text-white transition-colors ${n.active ? 'text-white' : ''}`}>
                {n.label}
              </Link>
            ))}
          </nav>

          {/* PC ログイン/マイページボタン */}
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href={mypageHref}
              className="text-sm font-bold px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              {loggedIn ? 'マイページ' : 'ログイン'}
            </Link>
          </div>
        </div>
      </header>

      {/* スマホ ボトムナビ */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/5 bg-[#0a0a0f]/95 backdrop-blur-xl">
        {NAV.map(n => {
          const Icon = n.icon
          return (
            <Link key={n.href} href={n.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${n.active ? 'text-violet-400' : 'text-[#8888aa] hover:text-white'}`}>
              <Icon size={20} />
              <span className="text-[10px] font-medium">{n.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
