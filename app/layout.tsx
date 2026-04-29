import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Link from 'next/link'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  verification: {
    google: '-QtOy-pHHDZ0vVAnzSfRrAS6BoX55q59eR1rZAzyedU',
  },
  title: {
    default: 'LiveVault | ライブ参戦・セトリ記録サービス',
    template: '%s | LiveVault',
  },
  description: 'ライブのセトリ記録・参戦履歴管理・リアルタイム掲示板。アーティストのコンサート情報を共有・保存できる参戦体験プラットフォーム。',
  keywords: ['セトリ', 'ライブ', 'コンサート', '参戦', '参戦記録', 'セットリスト', '公演', 'ライブレポ'],
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'LiveVault',
    title: 'LiveVault | ライブ参戦・セトリ記録サービス',
    description: 'ライブのセトリ記録・参戦履歴管理・リアルタイム掲示板。アーティストのコンサート情報を共有・保存できる参戦体験プラットフォーム。',
    url: 'https://livevault.jp',
    images: [{ url: 'https://livevault.jp/opengraph-image', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LiveVault | ライブ参戦・セトリ記録サービス',
    description: 'ライブのセトリ記録・参戦履歴管理・リアルタイム掲示板。',
    images: ['https://livevault.jp/opengraph-image'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] flex flex-col">
        <Header />
        <main className="flex-1 pb-16 sm:pb-0">{children}</main>
        <footer className="border-t border-white/5 mt-16 pb-16 sm:pb-0">
          <div className="max-w-5xl mx-auto px-4 py-8 text-center text-xs text-[#8888aa] space-y-3">
            <div className="flex justify-center gap-4">
              <Link href="/contact" className="hover:text-white transition-colors">お問い合わせ</Link>
            </div>
            <p>© 2026 LiveVault — ライブ参戦体験のOS</p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  )
}
