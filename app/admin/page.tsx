import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Mic2, Route, Ticket, Users, MessageSquare, CheckCircle, ShoppingBag, Mail } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const admin = createAdminClient()

  const [
    { count: artistCount },
    { count: tourCount },
    { count: concertCount },
    { count: userCount },
    { count: postCount },
    { count: attendCount },
    { count: merchCount },
    { count: contactCount },
  ] = await Promise.all([
    admin.from('artists').select('*', { count: 'exact', head: true }),
    admin.from('tours').select('*', { count: 'exact', head: true }),
    admin.from('concerts').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('board_posts').select('*', { count: 'exact', head: true }),
    admin.from('attendances').select('*', { count: 'exact', head: true }),
    admin.from('merch_catalog').select('*', { count: 'exact', head: true }),
    admin.from('contact_messages').select('*', { count: 'exact', head: true }),
  ])

  const stats = [
    { label: 'アーティスト', value: artistCount ?? 0, icon: Mic2, href: '/admin/artists' },
    { label: 'ツアー', value: tourCount ?? 0, icon: Route, href: '/admin/tours' },
    { label: '公演', value: concertCount ?? 0, icon: Ticket, href: '/admin/concerts' },
    { label: '登録ユーザー', value: userCount ?? 0, icon: Users, href: '#' },
    { label: '掲示板投稿', value: postCount ?? 0, icon: MessageSquare, href: '/admin/posts' },
    { label: '参戦登録', value: attendCount ?? 0, icon: CheckCircle, href: '#' },
    { label: 'グッズ', value: merchCount ?? 0, icon: ShoppingBag, href: '/admin/merch' },
    { label: 'お問い合わせ', value: contactCount ?? 0, icon: Mail, href: '/admin/contact' },
  ]

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-white">ダッシュボード</h1>
        <p className="text-sm text-[#8888aa] mt-1">LiveVault 管理画面</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {stats.map(s => (
          <Link key={s.label} href={s.href}
            className="glass rounded-2xl p-5 hover:border-violet-500/30 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center mb-3">
              <s.icon size={16} className="text-violet-400" />
            </div>
            <p className="text-3xl font-black text-white">{s.value.toLocaleString()}</p>
            <p className="text-xs text-[#8888aa] mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { href: '/admin/artists', label: 'アーティストを追加', icon: Mic2 },
          { href: '/admin/tours', label: 'ツアーを追加', icon: Route },
          { href: '/admin/concerts', label: '公演を追加', icon: Ticket },
          { href: '/admin/posts', label: '掲示板を管理', icon: MessageSquare },
          { href: '/admin/merch', label: 'グッズを管理', icon: ShoppingBag },
          { href: '/admin/contact', label: 'お問い合わせを確認', icon: Mail },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="flex items-center gap-3 glass rounded-2xl p-4 hover:border-violet-500/40 transition-colors text-sm font-bold text-white">
            <a.icon size={18} className="text-violet-400 shrink-0" />
            {a.label} →
          </Link>
        ))}
      </div>
    </div>
  )
}
