import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

type Client = SupabaseClient<Database>

/** 会場名の表記ゆれ（全角半角・空白・大小文字・末尾の「(アメリカ)」等の国名）を吸収して比較するためのキー */
export function venueKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s*\([^()]*\)\s*$/, '') // 末尾の (国名) / (都道府県)
    .replace(/[\s・()（）]+/g, '')
}

/** 同じ会場とみなせるか（キーが同じ、または一方がもう一方を含む: 「朱鷺メッセ」と「朱鷺メッセ・新潟コンベンションセンター」など） */
export function sameVenue(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = venueKey(a)
  const y = venueKey(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length >= 4 && long.includes(short)) return true
  // 前半の呼び方だけ違う（「宮城・セキスイハイムスーパーアリーナ」と「グランディ・21 セキスイハイムスーパーアリーナ」等）:
  // 後ろが8文字以上かつ短い方の6割以上一致すれば同じ会場
  let n = 0
  while (n < short.length && short[short.length - 1 - n] === long[long.length - 1 - n]) n++
  return n >= 8 && n >= short.length * 0.6
}

function sameStartTime(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true // どちらかが未設定なら同じ公演とみなす
  return a.slice(0, 5) === b.slice(0, 5)
}

/**
 * 同じアーティスト・同じ日・同じ会場・同じ開演時刻（片方未設定を含む）の既存公演を探す。
 * LiveFans の event_id だけで重複判定すると、手動登録（event_id なし）の公演と二重登録になるため、
 * 自動取り込みで公演を insert する前に必ずこれで確認する。
 * - 別の event_id が既に付いている公演は「別公演（昼夜2回公演など）」として扱い、一致させない
 */
export async function findSameConcert(
  admin: Client,
  c: { artist_id: string; date: string; venue_name: string | null; start_time?: string | null; livefans_event_id?: number | null },
): Promise<{ id: string; livefans_event_id: number | null } | null> {
  const { data } = await admin
    .from('concerts')
    .select('id, venue_name, start_time, livefans_event_id')
    .eq('artist_id', c.artist_id)
    .eq('date', c.date)
  return (data ?? []).find(e =>
    sameVenue(e.venue_name, c.venue_name) &&
    sameStartTime(e.start_time, c.start_time) &&
    (!e.livefans_event_id || !c.livefans_event_id || e.livefans_event_id === c.livefans_event_id),
  ) ?? null
}
