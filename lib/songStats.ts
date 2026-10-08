import type { SupabaseClient } from '@supabase/supabase-js'
import { computeStandardSongs, type StandardSongsData } from '@/lib/articles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>

/** 集計結果を作り直す間隔（これより古いものを月次の更新で作り直す） */
export const SONG_STATS_MAX_AGE_DAYS = 25

/**
 * 保存済みのセトリ分析（定番曲ランキング）を読む。
 * まだ集計していないアーティスト（新規追加など）は、その場で集計する（保存は月次の更新で行う）。
 */
export async function getStandardSongs(supabase: Client, artistId: string): Promise<StandardSongsData | null> {
  const { data, error } = await supabase
    .from('artist_song_stats')
    .select('data')
    .eq('artist_id', artistId)
    .maybeSingle()
  if (!error && data) return (data.data ?? null) as StandardSongsData | null
  return computeStandardSongs(supabase, artistId)
}

/** 1アーティスト分を集計して保存する（管理画面の「今すぐ再集計」・月次の更新） */
export async function refreshArtistSongStats(admin: Client, artistId: string): Promise<StandardSongsData | null> {
  const stats = await computeStandardSongs(admin, artistId)
  const { error } = await admin
    .from('artist_song_stats')
    .upsert({ artist_id: artistId, data: stats, computed_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  return stats
}

/**
 * 集計していない・古いアーティストを、時間の許す限り順に集計して保存する。
 * 1回の呼び出しは budgetMs まで。残りがあれば remaining > 0 を返すので、呼び出し側が繰り返す。
 */
export async function refreshStaleSongStats(admin: Client, budgetMs: number): Promise<{
  processed: number; withData: number; failed: string[]; remaining: number; refreshedArtistIds: string[]
}> {
  const started = Date.now()
  const cutoff = new Date(Date.now() - SONG_STATS_MAX_AGE_DAYS * 86400_000).toISOString()

  // 集計済みで新しいもの（対象外）
  const fresh = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('artist_song_stats').select('artist_id').gte('computed_at', cutoff).order('artist_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) fresh.add(r.artist_id as string)
    if (!data || data.length < 1000) break
  }
  const targets: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from('artists').select('id').order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) if (!fresh.has(r.id as string)) targets.push(r.id as string)
    if (!data || data.length < 1000) break
  }

  let processed = 0
  let withData = 0
  const failed: string[] = []
  const refreshedArtistIds: string[] = []
  for (const id of targets) {
    if (Date.now() - started > budgetMs) break
    try {
      const stats = await refreshArtistSongStats(admin, id)
      if (stats) { withData++; refreshedArtistIds.push(id) }
    } catch (e) {
      failed.push(`${id}: ${e instanceof Error ? e.message : String(e)}`)
      // 失敗したものは次の呼び出しで繰り返さないよう、今回は飛ばした扱いにする（次の月次で再挑戦）
      await admin.from('artist_song_stats').upsert({ artist_id: id, data: null, computed_at: new Date().toISOString() })
    }
    processed++
  }
  return { processed, withData, failed, remaining: targets.length - processed, refreshedArtistIds }
}
