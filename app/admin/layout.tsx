import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LayoutDashboard, Mic2, Route, Ticket, MessageSquare, ShoppingBag, ListMusic, Mail, MapPin, PlusCircle, UserCircle, Building2, Music2, Tent, Rss, Music } from 'lucide-react'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/')

  const NAV_GROUPS = [
    {
      label: null,
      items: [{ href: '/admin', label: 'ダッシュボード', icon: LayoutDashboard }],
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
      ],
    },
    {
      label: '取込',
      items: [
        { href: '/admin/livefans-auto', label: 'LiveFans', icon: Rss },
        { href: '/admin/spotify-import', label: 'Spotify', icon: Music2 },
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

  // モバイル用フラットリスト
  const NAV_FLAT = NAV_GROUPS.flatMap(g => g.items)

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* サイドバー (PC) */}
      <aside className="hidden sm:flex flex-col w-52 shrink-0 border-r border-white/5 bg-[#0d0d14] pt-6 px-3 overflow-y-auto">
        <nav className="space-y-4 pb-6">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="text-[10px] font-bold text-[#555566] uppercase tracking-wider px-3 mb-1">{group.label}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map(n => (
                  <Link key={n.href} href={n.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#8888aa] hover:text-white hover:bg-white/5 transition-colors">
                    <n.icon size={16} />
                    <span>{n.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-4 sm:px-8 py-6">{children}</main>

        {/* ボトムナビ (スマホ) — 横スクロール対応 */}
        <nav className="sm:hidden flex overflow-x-auto whitespace-nowrap border-t border-white/5 bg-[#0d0d14]">
          {NAV_FLAT.map(n => (
            <Link key={n.href} href={n.href}
              className="inline-flex flex-col items-center gap-1 py-3 px-4 text-[#8888aa] hover:text-white transition-colors shrink-0">
              <n.icon size={20} />
              <span className="text-[10px]">{n.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}
