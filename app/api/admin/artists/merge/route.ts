import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { main_artist_id, duplicate_artist_id } = await req.json()
    if (!main_artist_id || !duplicate_artist_id) {
      return NextResponse.json({ error: 'main_artist_id と duplicate_artist_id が必要です' }, { status: 400 })
    }
    if (main_artist_id === duplicate_artist_id) {
      return NextResponse.json({ error: '同じアーティストは指定できません' }, { status: 400 })
    }

    const admin = createAdminClient()
    const log: string[] = []

    // アーティスト存在確認
    const { data: main } = await admin.from('artists').select('id, name').eq('id', main_artist_id).single()
    const { data: dup } = await admin.from('artists').select('id, name').eq('id', duplicate_artist_id).single()
    if (!main || !dup) return NextResponse.json({ error: 'アーティストが見つかりません' }, { status: 400 })

    log.push(`「${dup.name}」→「${main.name}」にマージ開始`)

    // 1. artist_livefans_ids を移動（livefans_id UNIQUE 制約に注意）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mainLfIds } = await (admin as any)
      .from('artist_livefans_ids').select('livefans_id').eq('artist_id', main_artist_id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dupLfIds } = await (admin as any)
      .from('artist_livefans_ids').select('id, livefans_id').eq('artist_id', duplicate_artist_id)
    const mainLfSet = new Set((mainLfIds ?? []).map((r: { livefans_id: number }) => r.livefans_id))
    let lfMoved = 0
    for (const row of dupLfIds ?? []) {
      if (mainLfSet.has(row.livefans_id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('artist_livefans_ids').delete().eq('id', row.id)
        log.push(`  livefans_id:${row.livefans_id} → main側に既存のため削除`)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('artist_livefans_ids').update({ artist_id: main_artist_id }).eq('id', row.id)
        log.push(`  livefans_id:${row.livefans_id} → main側に移動`)
        lfMoved++
      }
    }

    // 2. tour_artists（UNIQUE: tour_id, artist_id）
    // main が既に持っているツアーを取得し、conflict する行を先に削除
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mainTours } = await (admin as any)
      .from('tour_artists').select('tour_id').eq('artist_id', main_artist_id)
    const mainTourSet = new Set((mainTours ?? []).map((r: { tour_id: string }) => r.tour_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dupTours } = await (admin as any)
      .from('tour_artists').select('tour_id').eq('artist_id', duplicate_artist_id)
    for (const r of dupTours ?? []) {
      if (mainTourSet.has(r.tour_id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('tour_artists')
          .delete().eq('tour_id', r.tour_id).eq('artist_id', duplicate_artist_id)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('tour_artists')
      .update({ artist_id: main_artist_id }).eq('artist_id', duplicate_artist_id)
    log.push(`  tour_artists: ${dupTours?.length ?? 0}件処理`)

    // 3. concert_artists（UNIQUE: concert_id, artist_id）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mainConcerts } = await (admin as any)
      .from('concert_artists').select('concert_id').eq('artist_id', main_artist_id)
    const mainConcertSet = new Set((mainConcerts ?? []).map((r: { concert_id: string }) => r.concert_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dupConcerts } = await (admin as any)
      .from('concert_artists').select('concert_id').eq('artist_id', duplicate_artist_id)
    for (const r of dupConcerts ?? []) {
      if (mainConcertSet.has(r.concert_id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('concert_artists')
          .delete().eq('concert_id', r.concert_id).eq('artist_id', duplicate_artist_id)
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('concert_artists')
      .update({ artist_id: main_artist_id }).eq('artist_id', duplicate_artist_id)
    log.push(`  concert_artists: ${dupConcerts?.length ?? 0}件処理`)

    // 4. concerts（artist_id）
    const { data: movedConcerts } = await admin.from('concerts')
      .update({ artist_id: main_artist_id }).eq('artist_id', duplicate_artist_id).select('id')
    log.push(`  concerts: ${movedConcerts?.length ?? 0}件移動`)

    // 5. tours（artist_id）
    const { data: movedTours } = await admin.from('tours')
      .update({ artist_id: main_artist_id }).eq('artist_id', duplicate_artist_id).select('id')
    log.push(`  tours: ${movedTours?.length ?? 0}件移動`)

    // 6. setlist_submissions（concert_id 経由なので直接の artist_id はない）

    // 7. 重複アーティストを削除
    const { error: delErr } = await admin.from('artists').delete().eq('id', duplicate_artist_id)
    if (delErr) return NextResponse.json({ error: `削除失敗: ${delErr.message}`, log }, { status: 500 })
    log.push(`  「${dup.name}」を削除`)

    return NextResponse.json({
      ok: true,
      log,
      moved: {
        livefans_ids: lfMoved,
        concerts: movedConcerts?.length ?? 0,
        tours: movedTours?.length ?? 0,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
