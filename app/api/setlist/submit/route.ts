import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type SongInput = {
  name: string
  type: 'song' | 'mc' | 'other'
  encore: boolean
}

// artist_id + song_name で song を find-or-create し、song_id を返す
async function findOrCreateSong(
  admin: ReturnType<typeof createAdminClient>,
  artistId: string,
  name: string
): Promise<string | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  // まず既存を検索（大文字小文字無視）
  const { data: existing } = await admin
    .from('songs')
    .select('id')
    .eq('artist_id', artistId)
    .ilike('name', trimmed)
    .limit(1)
    .maybeSingle()

  if (existing) return existing.id

  // なければ新規作成
  const { data: created } = await admin
    .from('songs')
    .insert({ artist_id: artistId, name: trimmed })
    .select('id')
    .single()

  return created?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { concert_id, songs, spotify_url, apple_music_url, guest_user_id, guest_name } = body as {
      concert_id: string
      songs: SongInput[]
      spotify_url?: string
      apple_music_url?: string
      guest_user_id?: string
      guest_name?: string
    }

    if (!concert_id || !Array.isArray(songs)) {
      return NextResponse.json({ error: 'invalid params' }, { status: 400 })
    }

    const supabase = await createClient()
    const admin = createAdminClient()

    // ユーザー確認
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id ?? guest_user_id
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    // concert から artist_id を取得
    const { data: concert } = await admin
      .from('concerts')
      .select('artist_id')
      .eq('id', concert_id)
      .single()

    if (!concert) return NextResponse.json({ error: 'concert not found' }, { status: 404 })

    const artistId = concert.artist_id

    // setlist_submission を upsert
    const { data: subData, error: subErr } = await admin
      .from('setlist_submissions')
      .upsert({
        concert_id,
        user_id: userId,
        spotify_url: spotify_url?.trim() || null,
        apple_music_url: apple_music_url?.trim() || null,
        ...(guest_name ? { guest_name } : {}),
      }, { onConflict: 'concert_id,user_id' })
      .select('id')
      .single()

    if (subErr || !subData) {
      return NextResponse.json({ error: subErr?.message ?? 'submission failed' }, { status: 500 })
    }

    const subId = subData.id

    // 既存の曲を削除
    await admin.from('setlist_songs').delete().eq('submission_id', subId)

    // 各曲の song_id を解決してinsert
    const toInsert = songs.filter(s => s.name.trim() !== '' || s.type !== 'song')
    const inserts = await Promise.all(
      toInsert.map(async (s, i) => {
        const name = s.name.trim() || (s.type === 'mc' ? 'MC' : 'その他')
        const songId = s.type === 'song' ? await findOrCreateSong(admin, artistId, name) : null
        return {
          submission_id: subId,
          concert_id,
          user_id: userId,
          song_name: name,
          song_type: s.type,
          order_num: i + 1,
          is_encore: s.encore,
          song_id: songId,
        }
      })
    )

    const { error: songsErr } = await admin.from('setlist_songs').insert(inserts)
    if (songsErr) return NextResponse.json({ error: songsErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, submission_id: subId })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
