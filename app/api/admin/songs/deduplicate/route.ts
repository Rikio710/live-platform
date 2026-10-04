import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function POST() {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1. 全データを並列取得
  const [songsRes, countsRes, unlinkedRes] = await Promise.all([
    admin.from('songs').select('id, artist_id, name, spotify_track_id'),
    admin.from('setlist_songs').select('song_id').not('song_id', 'is', null).eq('song_type', 'song'),
    admin.from('setlist_songs').select('id, song_name, concert_id').is('song_id', null).eq('song_type', 'song'),
  ])

  const allSongs = songsRes.data
  if (!allSongs) return NextResponse.json({ error: 'Failed to fetch songs' }, { status: 500 })

  // 2. 演奏回数マップ
  const countMap = new Map<string, number>()
  for (const row of (countsRes.data ?? []) as { song_id: string | null }[]) {
    if (row.song_id) countMap.set(row.song_id, (countMap.get(row.song_id) ?? 0) + 1)
  }

  // 3. artist_id + 正規化曲名でグループ化
  const groups = new Map<string, typeof allSongs>()
  for (const song of allSongs) {
    const key = `${song.artist_id}::${song.name.toLowerCase().trim()}`
    const existing = groups.get(key)
    if (existing) existing.push(song)
    else groups.set(key, [song])
  }

  let mergedGroups = 0
  let deletedSongs = 0
  let updatedLinks = 0

  // 4. 重複グループを処理（canonical → dupIdsをまとめて一括update/delete）
  // canonical→dupIds のマップを作成
  const canonicalToDupIds = new Map<string, string[]>()

  for (const [, group] of groups) {
    if (group.length < 2) continue

    const sorted = [...group].sort((a, b) => {
      if (a.spotify_track_id && !b.spotify_track_id) return -1
      if (!a.spotify_track_id && b.spotify_track_id) return 1
      return (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0)
    })
    const canonical = sorted[0]
    const dupIds = sorted.slice(1).map(s => s.id)
    canonicalToDupIds.set(canonical.id, dupIds)
    mergedGroups++
    deletedSongs += dupIds.length
  }

  // 全dupIdのセット
  const allDupIds = [...canonicalToDupIds.values()].flat()

  if (allDupIds.length > 0) {
    // setlist_songsをcanonicalに付け替え（canonical単位で並列実行）
    const updatePromises = [...canonicalToDupIds.entries()].map(async ([canonicalId, dupIds]) => {
      const { data } = await admin
        .from('setlist_songs')
        .update({ song_id: canonicalId })
        .in('song_id', dupIds)
        .select('id')
      updatedLinks += data?.length ?? 0
    })
    await Promise.all(updatePromises)

    // 重複songsを一括削除
    await admin.from('songs').delete().in('id', allDupIds)
  }

  // 5. song_id=null のsetlist_songsをマッチング・一括更新
  const unlinkedRows = (unlinkedRes.data ?? []) as { id: string; song_name: string; concert_id: string }[]

  if (unlinkedRows.length > 0) {
    const concertIds = [...new Set(unlinkedRows.map(r => r.concert_id).filter(Boolean))]

    const [concertsRes, latestSongsRes] = await Promise.all([
      admin.from('concerts').select('id, artist_id').in('id', concertIds),
      admin.from('songs').select('id, artist_id, name'),
    ])

    const concertArtistMap = new Map<string, string>()
    for (const c of (concertsRes.data ?? []) as { id: string; artist_id: string }[]) {
      concertArtistMap.set(c.id, c.artist_id)
    }

    const songsByArtist = new Map<string, { id: string; name: string }[]>()
    for (const s of (latestSongsRes.data ?? []) as { id: string; artist_id: string; name: string }[]) {
      const arr = songsByArtist.get(s.artist_id) ?? []
      arr.push({ id: s.id, name: s.name })
      songsByArtist.set(s.artist_id, arr)
    }

    // song_id → [setlist_songs.id] のマップを作成
    const toLink = new Map<string, string[]>()
    // (artistId::normalizedName) → { artistId, name, rowIds }
    const toCreate = new Map<string, { artistId: string; name: string; rowIds: string[] }>()

    for (const row of unlinkedRows) {
      if (!row.concert_id || !row.song_name) continue
      const artistId = concertArtistMap.get(row.concert_id)
      if (!artistId) continue

      const normalizedName = row.song_name.toLowerCase().trim()
      const artistSongs = songsByArtist.get(artistId) ?? []
      const match = artistSongs.find(s => s.name.toLowerCase().trim() === normalizedName)

      if (match) {
        const ids = toLink.get(match.id) ?? []
        ids.push(row.id)
        toLink.set(match.id, ids)
      } else {
        const key = `${artistId}::${normalizedName}`
        const existing = toCreate.get(key)
        if (existing) {
          existing.rowIds.push(row.id)
        } else {
          toCreate.set(key, { artistId, name: row.song_name, rowIds: [row.id] })
        }
      }
    }

    // マッチした曲を一括update（song_id単位で並列）
    const linkPromises = [...toLink.entries()].map(async ([songId, rowIds]) => {
      const { data } = await admin
        .from('setlist_songs')
        .update({ song_id: songId })
        .in('id', rowIds)
        .select('id')
      updatedLinks += data?.length ?? 0
    })
    await Promise.all(linkPromises)

    // 新規作成が必要な曲（song単位で直列、作成後にまとめてupdate）
    for (const [, { artistId, name, rowIds }] of toCreate) {
      const { data: newSong } = await admin
        .from('songs')
        .insert({ artist_id: artistId, name })
        .select('id')
        .single()
      if (newSong) {
        const { data } = await admin
          .from('setlist_songs')
          .update({ song_id: newSong.id })
          .in('id', rowIds)
          .select('id')
        updatedLinks += data?.length ?? 0
        const arr = songsByArtist.get(artistId) ?? []
        arr.push({ id: newSong.id, name })
        songsByArtist.set(artistId, arr)
      }
    }
  }

  return NextResponse.json({ mergedGroups, deletedSongs, updatedLinks })
}
