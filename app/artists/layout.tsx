import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'アーティスト一覧 | ライブ・セトリ情報',
  description: 'ライブ・コンサートのセトリ情報・参戦記録が見られるアーティスト一覧。お気に入りのアーティストのライブ情報をチェックしよう。',
}

export default function ArtistsLayout({ children }: { children: React.ReactNode }) {
  return children
}
