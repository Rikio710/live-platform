import { siteUrl } from '@/lib/site'
import { cachedSitemapIds } from '@/lib/sitemaps'

// サイトマップインデックス（Search Console・robots.txt に登録済みの /sitemap.xml）。
// 本体は件数が多いので /sitemaps/sitemap/{id}.xml に分割している（Google は1ファイル5万URLまで）。
// ビルド時には作らない（DB が混んでいるとデプロイが失敗するため）。番号の一覧は1時間キャッシュ
export const dynamic = 'force-dynamic'

export async function GET() {
  const ids = await cachedSitemapIds()
  const now = new Date().toISOString()
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ids.map(id => `  <sitemap><loc>${siteUrl}/sitemaps/sitemap/${id}.xml</loc><lastmod>${now}</lastmod></sitemap>`).join('\n')}
</sitemapindex>
`
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
