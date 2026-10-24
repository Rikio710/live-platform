import { revalidateConcertPages } from '@/lib/revalidatePages'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLivefansSetlist } from '@/lib/livefansSetlist'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const BASE = 'https://www.livefans.jp'
const MAX_PER_RUN = 10
const DELAY_MS = 400

// 失敗後の次回チェックまでの時間（時間単位）
// 1回目失敗 → 24h後 → 2回目
// 2回目失敗 → 48h後 → 3回目
// 3回目失敗 → 終了
const RETRY_HOURS = [24, 48]

// status: LiveFans の応答（HTTP ステータス。通信エラーは 0）。403 などは「セトリなし」と区別する（2026-10 拒否に気づけなかったため）
async function scrapeSetlist(eventId: number): Promise<{ songs: { song_name: string; is_encore: boolean; order_num: number }[]; status: number }> {
  const url = `${BASE}/events/${eventId}`
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.5',
  }
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { songs: [], status: res.status }
    const html = await res.text()
    const cookies = res.headers.get('set-cookie') ?? ''

    // 曲順のシャッフル（旧形式）・新形式の両方に対応した共通処理
    const songs = await parseLivefansSetlist(html, { url, cookies, headers })
    if (!songs) return { songs: [], status: res.status } // 並べ替えモードが取れず曲順を保証できない → 次回再試行
    return { songs, status: res.status }
  } catch {
    return { songs: [], status: 0 }
  }
}

export async function GET(req: NextRequest) {
  // 認証チェック（Vercel CronまたはGitHub Actionsから呼ばれる）
  const authHeader = req.headers.get('authorization')
  const crawlSecret = process.env.CRAWL_SECRET
  if (!crawlSecret || authHeader !== `Bearer ${crawlSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.CRAWL_USER_ID
  if (!userId) {
    return NextResponse.json({ error: 'CRAWL_USER_ID not configured' }, { status: 500 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // JST で今日の日付を取得
  const todayJst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    .toISOString().split('T')[0]
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0]

  // Step 1: 初回スケジューリング
  // 日付が過ぎているのに setlist_check_next_at が未設定の公演を初期化
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unscheduled } = await (admin as any)
    .from('concerts')
    .select('id, date, start_time')
    .lt('date', todayJst)
    .gte('date', tenDaysAgo)
    .eq('setlist_check_count', 0)
    .is('setlist_check_next_at', null)
    .not('livefans_event_id', 'is', null)

  for (const c of (unscheduled ?? []) as { id: string; date: string; start_time: string | null }[]) {
    let nextAt: Date
    if (c.start_time) {
      // 開演時刻 + 3時間を終演推定とし、そこから最初のクロール時刻に
      const [h, m] = c.start_time.split(':').map(Number)
      const startMs = new Date(`${c.date}T00:00:00+09:00`).getTime() + (h * 60 + m) * 60000
      nextAt = new Date(startMs + 3 * 3600000) // 開演 + 3時間
    } else {
      // 開演時刻不明: 当日 21:00 JST（= 12:00 UTC）を終演推定
      nextAt = new Date(`${c.date}T12:00:00Z`)
    }
    // 推定時刻がすでに過ぎている場合は今すぐチェック
    if (nextAt < now) nextAt = now

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('concerts')
      .update({ setlist_check_next_at: nextAt.toISOString() })
      .eq('id', c.id)
  }

  // Step 2: チェック期限が来た公演を取得
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: due } = await (admin as any)
    .from('concerts')
    .select('id, livefans_event_id, setlist_check_count')
    .not('livefans_event_id', 'is', null)
    .lte('setlist_check_next_at', now.toISOString())
    .lt('setlist_check_count', 3)
    .order('setlist_check_next_at', { ascending: true })
    .limit(MAX_PER_RUN)

  const dueList = (due ?? []) as { id: string; livefans_event_id: number; setlist_check_count: number }[]

  if (dueList.length === 0) {
    return NextResponse.json({
      ok: true,
      initialized: (unscheduled ?? []).length,
      checked: 0, found: 0, not_found: 0, skipped: 0,
    })
  }

  // すでにセトリがある公演を除外
  const ids = dueList.map(c => c.id)
  const { data: existing } = await admin.from('setlist_submissions').select('concert_id').in('concert_id', ids)
  const alreadyDone = new Set((existing ?? []).map(s => s.concert_id))

  let found = 0, not_found = 0, skipped = 0
  const foundIds: string[] = []
  const statuses: Record<string, number> = {}
  let blocked = false

  for (const concert of dueList) {
    // 既にセトリあり → キューから外す
    if (alreadyDone.has(concert.id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('concerts')
        .update({ setlist_check_count: 99, setlist_check_next_at: null })
        .eq('id', concert.id)
      skipped++
      continue
    }

    if (found + not_found > 0) await new Promise(r => setTimeout(r, DELAY_MS))

    const { songs, status } = await scrapeSetlist(concert.livefans_event_id)
    statuses[status] = (statuses[status] ?? 0) + 1

    if (status !== 200) {
      // 拒否・エラー（403・429・5xx・通信エラーなど）: 「セトリなし」と数えず、この回はここで止める（繰り返しアクセスしない）
      console.error(`[setlist-crawl] LiveFans status ${status} for event ${concert.livefans_event_id}; stopping this run`)
      blocked = true
      break
    }

    if (songs.length > 0) {
      // セトリ取得成功 → 登録してキューから外す
      const { data: sub } = await admin
        .from('setlist_submissions')
        .upsert({ concert_id: concert.id, user_id: userId }, { onConflict: 'concert_id,user_id' })
        .select('id')
        .single()

      if (sub) {
        await admin.from('setlist_songs').insert(
          songs.map(s => ({
            concert_id: concert.id,
            submission_id: sub.id,
            user_id: userId,
            song_name: s.song_name,
            song_type: 'song',
            is_encore: s.is_encore,
            order_num: s.order_num,
          }))
        )
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('concerts')
        .update({ setlist_check_count: 99, setlist_check_next_at: null })
        .eq('id', concert.id)
      foundIds.push(concert.id)
      found++
    } else {
      // セトリなし → 次回スケジュールを設定
      const newCount = concert.setlist_check_count + 1
      const nextAt = newCount < 3
        ? new Date(Date.now() + RETRY_HOURS[newCount - 1] * 3600000).toISOString()
        : null // 3回目失敗 → 終了
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('concerts')
        .update({ setlist_check_count: newCount, setlist_check_next_at: nextAt })
        .eq('id', concert.id)
      not_found++
    }
  }

  // セトリを登録した公演のページ（と、ツアー・アーティスト・会場）をすぐ作り直す
  await revalidateConcertPages(admin, foundIds, { related: true })

  return NextResponse.json({
    ok: true,
    initialized: (unscheduled ?? []).length,
    checked: found + not_found,
    found,
    not_found,
    skipped,
    statuses,
    blocked,
  })
}
