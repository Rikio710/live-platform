import type { MetadataRoute } from 'next'
import { createPublicClient } from '@/lib/supabase/public'
import { siteUrl } from '@/lib/site'
import { ARTICLE_CATEGORIES } from '@/lib/articles'
import { CONCERTS_PER_SITEMAP, fetchAllRows, sitemapIds } from '@/lib/sitemaps'

// 分割サイトマップ本体。まとめ（サイトマップインデックス）は /sitemap.xml（app/sitemap.xml/route.ts）
export const revalidate = 3600

export async function generateSitemaps() {
  return (await sitemapIds()).map(id => ({ id }))
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id)
  const supabase = createPublicClient()
  const now = new Date()

  // 1: アーティスト
  if (id === 1) {
    const artists = await fetchAllRows<{ id: string }>((from, to) =>
      supabase.from('artists').select('id').order('id').range(from, to))
    return artists.map(a => ({
      url: `${siteUrl}/artists/${a.id.slice(0, 8)}`, lastModified: now, changeFrequency: 'weekly', priority: 0.7,
    }))
  }

  // 2〜: 公演（新しい順に分割）
  if (id >= 2) {
    const start = (id - 2) * CONCERTS_PER_SITEMAP
    const concerts = await fetchAllRows<{ id: string; date: string }>((from, to) =>
      supabase.from('concerts').select('id, date').order('date', { ascending: false }).order('id')
        .range(start + from, start + to), CONCERTS_PER_SITEMAP)
    return concerts.map(c => ({
      url: `${siteUrl}/concerts/${c.id.slice(0, 8)}`, lastModified: new Date(c.date), changeFrequency: 'weekly', priority: 0.8,
    }))
  }

  // 0: 固定ページ・記事・ツアー・会場・フェス
  const [tours, venueRows, festivals, { data: articles }] = await Promise.all([
    fetchAllRows<{ id: string }>((from, to) => supabase.from('tours').select('id').order('id').range(from, to)),
    fetchAllRows<{ venue_name: string }>((from, to) => supabase.from('concerts').select('venue_name').order('id').range(from, to)),
    fetchAllRows<{ id: string; slug: string | null }>((from, to) => supabase.from('festival_groups').select('id, slug').order('id').range(from, to)),
    supabase.from('articles').select('number, updated_at').eq('status', 'published'),
  ])
  const venueNames = [...new Set(venueRows.map(r => r.venue_name?.trim()).filter(Boolean))]

  const fixed: MetadataRoute.Sitemap = [
    { url: siteUrl, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/artists`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/concerts`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${siteUrl}/festivals`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/ranking`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${siteUrl}/venues`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/search`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${siteUrl}/request`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${siteUrl}/articles`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    ...Object.keys(ARTICLE_CATEGORIES).map(c => ({
      url: `${siteUrl}/articles/category/${c}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7,
    })),
  ]
  return [
    ...fixed,
    ...(articles ?? []).map(a => ({
      url: `${siteUrl}/articles/${a.number}`, lastModified: new Date(a.updated_at), changeFrequency: 'weekly' as const, priority: 0.8,
    })),
    ...tours.map(t => ({ url: `${siteUrl}/tours/${t.id.slice(0, 8)}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...festivals.map(f => ({
      url: `${siteUrl}/festivals/${f.slug ? encodeURIComponent(f.slug) : f.id.slice(0, 8)}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6,
    })),
    ...venueNames.map(name => ({
      url: `${siteUrl}/venues/${encodeURIComponent(name)}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6,
    })),
  ]
}
