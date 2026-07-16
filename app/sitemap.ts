import { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()
  const baseUrl = siteUrl

  const [{ data: concerts }, { data: artists }, { data: tours }, { data: venueRows }] = await Promise.all([
    supabase.from('concerts').select('id, slug, date').order('date', { ascending: false }),
    supabase.from('artists').select('id, slug'),
    supabase.from('tours').select('id, slug'),
    supabase.from('concerts').select('venue_name').order('venue_name'),
  ])

  const venueNames = [...new Set((venueRows ?? []).map(r => r.venue_name))]

  const concertUrls: MetadataRoute.Sitemap = (concerts ?? []).map(c => ({
    url: `${baseUrl}/concerts/${c.id.slice(0, 8)}`,
    lastModified: new Date(c.date),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const now = new Date()

  const artistUrls: MetadataRoute.Sitemap = (artists ?? []).map(a => ({
    url: `${baseUrl}/artists/${a.id.slice(0, 8)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const tourUrls: MetadataRoute.Sitemap = (tours ?? []).map(t => ({
    url: `${baseUrl}/tours/${t.id.slice(0, 8)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const venueUrls: MetadataRoute.Sitemap = venueNames.map(name => ({
    url: `${baseUrl}/venues/${encodeURIComponent(name)}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/artists`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/concerts`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/venues`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/request`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    ...artistUrls,
    ...tourUrls,
    ...venueUrls,
    ...concertUrls,
  ]
}
