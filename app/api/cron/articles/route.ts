import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { DAILY_ARTICLE_LIMIT, syncStandardSongsArticles } from '@/lib/articleSync'

export const maxDuration = 60

// GET: Vercel Cron から毎日呼ばれる。対象になったアーティストの定番曲記事を1日最大 DAILY_ARTICLE_LIMIT 件、自動で作成・公開する
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // 自動公開は Vercel の環境変数 ARTICLE_AUTO_PUBLISH=1 のときだけ（最初の30件の様子を見てから有効化する）
  if (process.env.ARTICLE_AUTO_PUBLISH !== '1') {
    return NextResponse.json({ skipped: 'ARTICLE_AUTO_PUBLISH is not enabled' })
  }
  try {
    const result = await syncStandardSongsArticles(createAdminClient(), { limit: DAILY_ARTICLE_LIMIT })
    if (result.created > 0) {
      revalidatePath('/articles', 'layout')
      revalidatePath('/')
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
