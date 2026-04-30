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

  const concertUrls: MetadataRoute.Sitemap = (concerts ?? []).filter(c => c.slug).map(c => ({
    url: `${baseUrl}/concerts/${c.slug}`,
    lastModified: new Date(c.date),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const artistUrls: MetadataRoute.Sitemap = (artists ?? []).filter(a => a.slug).map(a => ({
    url: `${baseUrl}/artists/${a.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const tourUrls: MetadataRoute.Sitemap = (tours ?? []).filter(t => t.slug).map(t => ({
    url: `${baseUrl}/tours/${t.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const venueUrls: MetadataRoute.Sitemap = venueNames.map(name => ({
    url: `${baseUrl}/venues/${encodeURIComponent(name)}`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [
    {
      url: baseUrl,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/artists`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...artistUrls,
    ...tourUrls,
    ...venueUrls,
    ...concertUrls,
  ]
}
