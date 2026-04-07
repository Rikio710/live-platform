'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-lg font-black tracking-tight gradient-text">LiveVault</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-6 text-sm text-[#8888aa]">
          <Link href="/artists"
            className={`hover:text-white transition-colors ${pathname.startsWith('/artists') ? 'text-white' : ''}`}>
            アーティスト
          </Link>
          <Link href="/mypage"
            className={`hover:text-white transition-colors ${pathname === '/mypage' ? 'text-white' : ''}`}>
            マイページ
          </Link>
          <Link href="/contact"
            className={`hover:text-white transition-colors ${pathname === '/contact' ? 'text-white' : ''}`}>
            お問い合わせ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Link
              href="/mypage"
              className="text-sm font-bold px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              マイページ
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-sm font-bold px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
