import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'

type ConcertRow = { venue_name: string; date: string; start_time: string }

function parseTableRows($: cheerio.CheerioAPI, selector: string): ConcertRow[] {
  const concerts: ConcertRow[] = []
  $(selector).each((_, row) => {
    const tds = $(row).find('td').toArray()
    if (tds.length < 3) return

    // セル0: 日付
    const dateText = $(tds[0]).text().trim()
    const dm = dateText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dm) return
    const date = `${dm[1]}-${dm[2]}-${dm[3]}`

    // セル1: 開演時間
    const timeText = $(tds[1]).text().trim()
    const tm = timeText.match(/^(\d{1,2}):(\d{2})$/)
    if (!tm) return
    const time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`

    // セル2: 会場名（都道府県サフィックスを除去）
    const venueRaw = $(tds[2]).text().trim()
    const venue = venueRaw
      .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
      .trim()

    if (venue && venue.length > 0 && venue.length <= 60) {
      concerts.push({ venue_name: venue, date, start_time: time })
    }
  })
  return concerts
}

function parseFromHtml(html: string): { title: string; concerts: ConcertRow[] } {
  const $ = cheerio.load(html)
  $('script, style').remove()

  // タイトル: livefans は h3 にツアー名、title タグに "アーティスト名 -ツアー名 | サイト名" 形式
  const h3 = $('h3').first().text().trim()
  const pageTitle = $('title').text()
  const titleFromTag = pageTitle.replace(/\s*\|.*$/, '').replace(/^[^-－]+-\s*/, '').trim()
  const title = h3 || titleFromTag || pageTitle.split(/[-|]/)[0].trim()

  // Strategy 1: 「公演日」「開演」ヘッダーを持つテーブルを特定
  let scheduleSelector = 'table tr'
  $('table').each((_, table) => {
    const headerText = $(table).find('th').text()
    if (headerText.includes('公演日') || headerText.includes('開演')) {
      // このテーブルのtrのみを対象にするためselectorを上書き
      const tableId = `livevault-schedule-${Math.random().toString(36).slice(2)}`
      $(table).attr('id', tableId)
      scheduleSelector = `#${tableId} tr`
      return false
    }
  })

  let concerts = parseTableRows($, scheduleSelector)

  // Strategy 2: text fallback（1行に日付・時刻・会場が含まれるケース）
  const lines = $.text()
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const dm = line.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dm) continue

    const date = `${dm[1]}-${dm[2]}-${dm[3]}`
    // 時刻は同じ行か直後の行から
    const ctx = [line, lines[i + 1] ?? ''].join(' ')
    const tm = ctx.match(/\b(\d{1,2}):(\d{2})\b/)
    if (!tm) continue

    const time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
    const venue = ctx
      .replace(/\d{4}\/\d{2}\/\d{2}/, '')
      .replace(/[（(][月火水木金土日・祝]+[）)]/g, '')
      .replace(/\b\d{1,2}:\d{2}\b/g, '')
      .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
      .replace(/[|｜\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (venue && venue.length > 1 && venue.length <= 60) {
      concerts.push({ venue_name: venue, date, start_time: time })
    }
  }

  return { title, concerts }
}

export async function POST(req: NextRequest) {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await req.json()
  if (!url?.startsWith('http')) {
    return NextResponse.json({ error: '有効なURLを入力してください' }, { status: 400 })
  }

  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e: any) {
    return NextResponse.json({ error: `取得失敗: ${e.message}` }, { status: 502 })
  }

  const { title, concerts } = parseFromHtml(html)
  return NextResponse.json({ title, concerts })
}
