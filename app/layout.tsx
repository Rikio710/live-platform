import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Link from 'next/link'

export const metadata: Metadata = {
  title: {
    default: 'LiveVault | ライブ参戦体験のOS',
    template: '%s | LiveVault',
  },
  description: 'ライブ前の情報収集・当日のリアルタイム共有・参戦履歴の蓄積。アーティストのライブ体験を一元管理するプラットフォーム。',
  keywords: ['ライブ', 'コンサート', 'セトリ', '参戦', '物販', '掲示板'],
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'LiveVault',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/5 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-8 text-center text-xs text-[#8888aa] space-y-3">
            <div className="flex justify-center gap-4">
              <Link href="/contact" className="hover:text-white transition-colors">お問い合わせ</Link>
            </div>
            <p>© 2026 LiveVault — ライブ参戦体験のOS</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
