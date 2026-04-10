import { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/site'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()
  const baseUrl = siteUrl

  const [{ data: concerts }, { data: artists }, { data: tours }] = await Promise.all([
    supabase.from('concerts').select('id, date').order('date', { ascending: false }),
    supabase.from('artists').select('id'),
    supabase.from('tours').select('id'),
  ])

  const concertUrls: MetadataRoute.Sitemap = (concerts ?? []).map(c => ({
    url: `${baseUrl}/concerts/${c.id}`,
    lastModified: new Date(c.date),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const artistUrls: MetadataRoute.Sitemap = (artists ?? []).map(a => ({
    url: `${baseUrl}/artists/${a.id}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const tourUrls: MetadataRoute.Sitemap = (tours ?? []).map(t => ({
    url: `${baseUrl}/tours/${t.id}`,
    changeFrequency: 'weekly',
    priority: 0.7,
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
    ...concertUrls,
  ]
}
