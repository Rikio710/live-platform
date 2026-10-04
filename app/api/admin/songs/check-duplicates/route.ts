import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

function normalizeForCompare(name: string): string {
  return name
    .toLowerCase()
    // 全角英数字→半角
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    // （）内を除去
    .replace(/[（(][^）)]*[）)]/g, '')
    // feat. 以降を除去
    .replace(/feat\.?\s*.*/i, '')
    // スペース（全角含む）を除去
    .replace(/[\s\u3000\u00a0]+/g, '')
    // 記号除去（ひらがな・カタカナ・漢字・英数字以外）
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export async function GET() {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const admin = createAdminClient()

  const [songsRes, countsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('songs')
      .select('id, artist_id, name, spotify_track_id, image_url, spotify_artist_name, artists(id, name)')
      .order('name'),
    admin.from('setlist_songs').select('song_id').not('song_id', 'is', null).eq('song_type', 'song'),
  ])

  if (!songsRes.data) return NextResponse.json({ groups: [] })

  const countMap = new Map<string, number>()
  for (const row of (countsRes.data ?? []) as { song_id: string | null }[]) {
    if (row.song_id) countMap.set(row.song_id, (countMap.get(row.song_id) ?? 0) + 1)
  }

  // artist_id + 正規化名でグループ化
  const groups = new Map<string, typeof songsRes.data>()
  for (const song of songsRes.data) {
    const normalized = normalizeForCompare(song.name)
    if (!normalized) continue
    const key = `${song.artist_id}::${normalized}`
    const existing = groups.get(key)
    if (existing) existing.push(song)
    else groups.set(key, [song])
  }

  // 2件以上のグループのみ返す
  const result = [...groups.entries()]
    .filter(([, songs]) => songs.length >= 2)
    .map(([, songs]) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      artist: (songs[0] as any).artists,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      songs: songs.map((s: any) => ({
        ...(s as object),
        play_count: countMap.get(s.id) ?? 0,
      })),
    }))
    .sort((a, b) => (a.artist?.name ?? '').localeCompare(b.artist?.name ?? '', 'ja'))

  return NextResponse.json({ groups: result })
}
