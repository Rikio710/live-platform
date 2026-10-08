// セトリ分析（定番曲ランキング）を全アーティスト分、手元から集計して保存する（初回・GitHub Actions が使えないとき用）
// usage: npx tsx --env-file=.env.local scripts/refresh-song-stats.mts
import { createClient } from '@supabase/supabase-js'
import { refreshStaleSongStats } from '../lib/songStats'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
let total = 0, withData = 0
for (;;) {
  const r = await refreshStaleSongStats(admin, 120_000)
  total += r.processed; withData += r.withData
  for (const f of r.failed) console.log('  失敗', f)
  console.log(`[${new Date().toLocaleTimeString('ja-JP')}] 集計 ${total}件（セトリあり ${withData}件）・残り ${r.remaining}件`)
  if (r.remaining === 0) break
}
