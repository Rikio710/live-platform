import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'
const BASE = 'https://www.livefans.jp'
const BATCH = 15

type ScrapedEvent = {
  livefans_event_id: number
  event_name: string
  event_date: string
  venue_name: string
}

async function scrapeArtistEvents(livefansId: number): Promise<ScrapedEvent[]> {
  const results = new Map<number, ScrapedEvent>()

  for (const path of [`/artists/future/${livefansId}`, `/artists/past/${livefansId}`]) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en' },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) continue

      const html = await res.text()
      const $ = cheerio.load(html)

      $('a[href*="/events/"]').each((_, el) => {
        const href = $(el).attr('href') ?? ''
        const match = href.match(/\/events\/(\d+)/)
        if (!match) return
        const eventId = parseInt(match[1])
        if (results.has(eventId)) return

        const container = $(el).closest('tr, li, article, .event, [class*="live"], [class*="event"], [class*="schedule"]')
        const text = container.length ? container.text() : $(el).parent().parent().text()

        const dateMatch = text.match(/(\d{4})\/(\d{2})\/(\d{2})/)
        if (!dateMatch) return
        const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`

        // 会場: ＠ または @ の後
        const venueMatch = text.match(/[＠@]\s*([^（(（\n）)]{2,50})/)
        const venue = venueMatch?.[1]?.trim().replace(/\s*[(（（][^)））]*[)））].*$/, '').trim() ?? ''

        // イベント名: 見出し要素 or リンクテキスト
        const name =
          (container.length ? container.find('h2, h3, h4, .title, .name').first().text().trim() : '') ||
          $(el).text().trim() ||
          venue

        if (date) {
          results.set(eventId, {
            livefans_event_id: eventId,
            event_name: name,
            event_date: date,
            venue_name: venue,
          })
        }
      })
    } catch {
      continue
    }
  }

  return [...results.values()]
}

async function runCrawl(artistIds?: string[]): Promise<NextResponse> {
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lfQuery = (admin as any)
    .from('artist_livefans_ids')
    .select('artist_id, livefans_id')
  if (artistIds?.length) lfQuery = lfQuery.in('artist_id', artistIds)
  const { data: lfEntries, error } = await lfQuery.limit(BATCH)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!lfEntries?.length) return NextResponse.json({ added: 0, crawled: 0, message: '対象アーティストなし' })

  // artist_id → livefans_ids マップ（1アーティストに複数IDあり得る）
  const artistLivefansMap = new Map<string, number[]>()
  for (const e of lfEntries as { artist_id: string; livefans_id: number }[]) {
    if (!artistLivefansMap.has(e.artist_id)) artistLivefansMap.set(e.artist_id, [])
    artistLivefansMap.get(e.artist_id)!.push(e.livefans_id)
  }
  const allArtistIds = [...artistLivefansMap.keys()]

  const { data: existingConcerts } = await admin
    .from('concerts')
    .select('artist_id, date')
    .in('artist_id', allArtistIds)

  const seen = new Set((existingConcerts ?? []).map(c => `${c.artist_id}:${c.date}`))

  const { data: existingQueue } = await admin
    .from('crawl_queue')
    .select('artist_id, event_date, livefans_event_id')
    .in('artist_id', allArtistIds)
    .neq('status', 'rejected')

  for (const q of existingQueue ?? []) {
    seen.add(`${q.artist_id}:${q.event_date}`)
  }
  const seenLivefansIds = new Set((existingQueue ?? []).map(q => q.livefans_event_id).filter(Boolean))

  const queueItems: object[] = []

  for (const [artistId, livefansIds] of artistLivefansMap) {
    for (const livefansId of livefansIds) {
      const events = await scrapeArtistEvents(livefansId)

      for (const ev of events) {
        if (seenLivefansIds.has(ev.livefans_event_id)) continue
        const key = `${artistId}:${ev.event_date}`
        if (seen.has(key)) continue
        seen.add(key)
        seenLivefansIds.add(ev.livefans_event_id)

        queueItems.push({
          artist_id: artistId,
          livefans_event_id: ev.livefans_event_id,
          event_name: ev.event_name,
          event_date: ev.event_date,
          venue_name: ev.venue_name,
          status: 'pending',
        })
      }

      await new Promise(r => setTimeout(r, 400))
    }
  }

  if (queueItems.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await admin.from('crawl_queue').upsert(queueItems as any, {
      onConflict: 'livefans_event_id',
      ignoreDuplicates: true,
    })
  }

  return NextResponse.json({
    added: queueItems.length,
    crawled: allArtistIds.length,
    message: `${allArtistIds.length}アーティストをクロール。${queueItems.length}件の新着を発見。`,
  })
}

// 管理画面からの手動実行
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json().catch(() => ({}))
    return runCrawl(body.artist_ids)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// Vercel Cron からの自動実行
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runCrawl()
}
