import { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// AI の学習・回答用クローラー（ページを大量に読むがサイトへの集客にならない。サーバー・DB の負荷と費用のもと）
const AI_CRAWLERS = [
  'GPTBot', 'ChatGPT-User', 'CCBot', 'ClaudeBot', 'anthropic-ai', 'Claude-Web',
  'Google-Extended', 'Applebot-Extended', 'PerplexityBot', 'YouBot', 'cohere-ai',
  'Bytespider', 'Amazonbot', 'meta-externalagent', 'FacebookBot', 'Diffbot',
  'ImagesiftBot', 'Omgilibot', 'DataForSeoBot',
]

// SEO 分析ツールなどのクローラー（同上。Google・Bing などの検索エンジンは許可したまま）
const SEO_TOOL_CRAWLERS = [
  'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot', 'BLEXBot', 'serpstatbot', 'barkrowler',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AI・SEO ツールのクローラーは全拒否
      ...[...AI_CRAWLERS, ...SEO_TOOL_CRAWLERS].map(userAgent => ({ userAgent, disallow: '/' })),
      // 通常クローラーは管理・APIページのみ拒否
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/mypage/', '/setup-profile/', '/login'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
