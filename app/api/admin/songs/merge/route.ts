import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 })
  }

  const { canonicalId, dupIds } = await req.json() as { canonicalId: string; dupIds: string[] }
  if (!canonicalId || !dupIds?.length) {
    return NextResponse.json({ error: 'canonicalId and dupIds required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // setlist_songsのsong_idをcanonicalに付け替え
  const { data: updated } = await admin
    .from('setlist_songs')
    .update({ song_id: canonicalId })
    .in('song_id', dupIds)
    .select('id')

  // 重複songsを削除
  await admin.from('songs').delete().in('id', dupIds)

  return NextResponse.json({ updatedLinks: updated?.length ?? 0, deletedSongs: dupIds.length })
}
