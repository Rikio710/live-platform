import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'

type ConcertRow = { venue_name: string; date: string; start_time: string }

function parseTableRows($: cheerio.CheerioAPI, selector: string): ConcertRow[] {
  const concerts: ConcertRow[] = []
  $(selector).each((_, row) => {
    const cells = $(row)
      .find('td')
      .toArray()
      .map(td => $(td).text().trim())
    if (cells.length < 2) return

    let date: string | null = null
    let time: string | null = null
    let venue: string | null = null

    for (const cell of cells) {
      if (!date) {
        const dm = cell.match(/(\d{4})\/(\d{2})\/(\d{2})/)
        if (dm) date = `${dm[1]}-${dm[2]}-${dm[3]}`
      }
      if (!time) {
        const tm = cell.match(/^(\d{1,2}):(\d{2})$/)
        if (tm) time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
      }
    }

    if (!date || !time) return

    for (let i = cells.length - 1; i >= 0; i--) {
      const raw = cells[i]
      if (raw.match(/^\d{4}\//) || raw.match(/^\d{1,2}:\d{2}$/) || raw.length < 2) continue
      const cleaned = raw
        .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
        .trim()
      if (cleaned) { venue = cleaned; break }
    }

    // 会場名が長すぎる場合はレビュー本文などの誤検出として除外
    if (venue && venue.length <= 60) concerts.push({ venue_name: venue, date, start_time: time })
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

  // Strategy 2: text fallback
  const lines = $.text()
    .split('\n')
    .map(l => l.trim())
    .filter(l => l)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const dm = line.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dm) continue

    const date = `${dm[1]}-${dm[2]}-${dm[3]}`
    const ctx = [line, lines[i + 1] ?? '', lines[i + 2] ?? ''].join(' ')
    const tm = ctx.match(/(\d{1,2}):(\d{2})/)
    if (!tm) continue

    const time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
    const venue = ctx
      .replace(/\d{4}\/\d{2}\/\d{2}/, '')
      .replace(/[（(][月火水木金土日・祝]+[）)]/g, '')
      .replace(/\d{1,2}:\d{2}/g, '')
      .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
      .replace(/[|｜\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (venue && venue.length > 2) {
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
