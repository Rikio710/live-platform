import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshStaleSongStats } from '@/lib/songStats'

export const maxDuration = 60

// GET: セトリ分析（定番曲ランキング）の月次更新。GitHub Actions（song-stats.yml）が remaining が 0 になるまで繰り返し呼ぶ
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const ok = [process.env.CRON_SECRET, process.env.CRAWL_SECRET].some(s => s && auth === `Bearer ${s}`)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await refreshStaleSongStats(createAdminClient(), 45_000)
    // 集計し直したアーティストのページ・記事は次のアクセスで作り直す
    for (const id of result.refreshedArtistIds) revalidatePath(`/artists/${id.slice(0, 8)}`)
    if (result.withData > 0) revalidatePath('/articles', 'layout')
    return NextResponse.json({ ...result, refreshedArtistIds: result.refreshedArtistIds.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
