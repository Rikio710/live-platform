import { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/mypage/', '/setup-profile/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
