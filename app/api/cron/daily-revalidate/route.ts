import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidateConcertPages } from '@/lib/revalidatePages'

export const maxDuration = 60

// GET: 毎日 0:05（JST）に Vercel Cron から呼ばれる。昨日・今日の公演のページ（公演・ツアー・アーティスト・会場）を作り直し、
// 「今後の公演」「開催予定/終了」の表示を日付の切り替わりに合わせる（ページは7日間キャッシュしているため）。
// 直近1日に追加された公演（自動取得・管理画面）も、ツアー・アーティストページに出るように作り直す
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const jst = (d: number) => new Date(Date.now() + d * 86400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const admin = createAdminClient()
  const ids: string[] = []
  const since = new Date(Date.now() - 86400_000).toISOString()
  for (const filter of [`and(date.gte.${jst(-1)},date.lte.${jst(0)})`, `created_at.gte.${since}`]) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from('concerts').select('id').or(filter).order('id').range(from, from + 999)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      ids.push(...(data ?? []).map(c => c.id))
      if (!data || data.length < 1000) break
    }
  }
  const paths = await revalidateConcertPages(admin, ids, { related: true })
  return NextResponse.json({ concerts: ids.length, paths })
}
