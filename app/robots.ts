import { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// AIクローラー（CPU消費するがSEO価値なし）
const AI_CRAWLERS = [
  'GPTBot', 'ChatGPT-User', 'CCBot', 'anthropic-ai', 'Claude-Web',
  'Googlebot-Extended', 'PerplexityBot', 'YouBot', 'cohere-ai',
  'Bytespider', 'FacebookBot', 'Applebot-Extended', 'DataForSeoBot',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AIクローラーは全拒否
      ...AI_CRAWLERS.map(userAgent => ({ userAgent, disallow: '/' })),
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
