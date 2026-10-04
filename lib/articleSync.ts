import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import {
  STANDARD_SONGS_MIN_SETLISTS, STANDARD_SONGS_MIN_UNITS, defaultStandardSongsArticle,
} from './articles'

type Client = SupabaseClient<Database>

export type StandardSongsCandidate = {
  artistId: string
  name: string
  setlistCount: number
  unitCount: number
  hasArticle: boolean
}

/**
 * 定番曲記事の対象アーティスト = セトリあり公演が10以上 かつ ツアー・ライブが3以上。
 * service role クライアントで呼ぶこと。
 */
export async function listStandardSongsCandidates(admin: Client): Promise<StandardSongsCandidate[]> {
  const today = new Date().toISOString().split('T')[0]
  const concerts = new Map<string, Set<string>>()
  const units = new Map<string, Set<string>>()

  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('setlist_submissions')
      .select('concert_id, concerts!inner(artist_id, date, tour_id, festival_event_id)')
      .lt('concerts.date', today)
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    type Row = { concert_id: string; concerts: { artist_id: string; tour_id: string | null; festival_event_id: string | null } }
    for (const r of (data ?? []) as unknown as Row[]) {
      const a = r.concerts.artist_id
      if (!concerts.has(a)) { concerts.set(a, new Set()); units.set(a, new Set()) }
      concerts.get(a)!.add(r.concert_id)
      units.get(a)!.add(r.concerts.tour_id ?? r.concerts.festival_event_id ?? r.concert_id)
    }
    if (!data || data.length < 1000) break
  }

  const eligible = [...concerts.keys()].filter(a =>
    concerts.get(a)!.size >= STANDARD_SONGS_MIN_SETLISTS && units.get(a)!.size >= STANDARD_SONGS_MIN_UNITS)
  if (eligible.length === 0) return []

  const [{ data: existing }, { data: artists }] = await Promise.all([
    admin.from('articles').select('artist_id').eq('category', 'standard-songs'),
    admin.from('artists').select('id, name').in('id', eligible),
  ])
  const has = new Set((existing ?? []).map(e => e.artist_id))
  const nameOf = new Map((artists ?? []).map(a => [a.id, a.name]))

  return eligible
    .map(id => ({
      artistId: id,
      name: nameOf.get(id) ?? '?',
      setlistCount: concerts.get(id)!.size,
      unitCount: units.get(id)!.size,
      hasArticle: has.has(id),
    }))
    .sort((a, b) => b.setlistCount - a.setlistCount)
}

/** 毎日の自動作成で1回に公開する上限（記事が急に大量に増えないように） */
export const DAILY_ARTICLE_LIMIT = 10

/**
 * まだ記事のない対象アーティストの定番曲記事を作成して公開する。
 * 既存の記事（非公開にしたものを含む）には触らない。
 */
export async function syncStandardSongsArticles(
  admin: Client,
  opts: { limit?: number } = {},
): Promise<{ created: number; total: number }> {
  const candidates = await listStandardSongsCandidates(admin)
  // セトリの多い順に作成（limit 指定時は上位だけ）
  const missing = candidates.filter(c => !c.hasArticle).slice(0, opts.limit ?? Infinity)
  if (missing.length === 0) return { created: 0, total: candidates.length }

  const now = new Date().toISOString()
  const rows = missing.map(c => {
    const d = defaultStandardSongsArticle(c.name)
    return {
      // URL は番号（number）を使う。slug は内部の一意キー
      slug: `standard-songs-${c.artistId}`,
      category: 'standard-songs',
      type: 'data',
      artist_id: c.artistId,
      title: d.title,
      description: d.description,
      status: 'published',
      published_at: now,
    }
  })
  const { error } = await admin.from('articles').insert(rows)
  if (error) throw new Error(error.message)
  return { created: rows.length, total: candidates.length }
}
