import type { Tables } from '@/types/supabase'
import type { ConcertItem } from './ConcertList'

export const CONCERT_LIST_SELECT = 'id, artist_id, date, start_time, venue_name, image_url, artists(id, name, image_url, image_crop_x, image_crop_y), tours(id, name, image_url), setlist_submissions(id)'

export type ConcertListRow = Pick<Tables<'concerts'>, 'id' | 'artist_id' | 'date' | 'start_time' | 'venue_name' | 'image_url'> & {
  artists: Pick<Tables<'artists'>, 'id' | 'name' | 'image_url' | 'image_crop_x' | 'image_crop_y'> | null
  tours: Pick<Tables<'tours'>, 'id' | 'name' | 'image_url'> | null
  setlist_submissions: { id: string }[]
}

export function toConcertItem(c: ConcertListRow): ConcertItem {
  return {
    id: c.id,
    artistId: c.artist_id,
    date: c.date,
    startTime: c.start_time,
    venueName: c.venue_name,
    artistName: c.artists?.name ?? null,
    tourName: c.tours?.name ?? null,
    image: c.image_url ?? c.tours?.image_url ?? c.artists?.image_url ?? null,
    imagePosition: !c.image_url && !c.tours?.image_url && c.artists
      ? `${c.artists.image_crop_x ?? 50}% ${c.artists.image_crop_y ?? 50}%`
      : null,
    hasSetlist: c.setlist_submissions.length > 0,
  }
}
