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

  // Strategy 1: 先頭行に「公演日」「開演」を含むテーブルを特定（th/td 両対応）
  let scheduleSelector = ''
  $('table').each((_, table) => {
    const firstRowText = $(table).find('tr').first().text()
    if (firstRowText.includes('公演日') || firstRowText.includes('開演')) {
      const tableId = `ls-${Math.random().toString(36).slice(2)}`
      $(table).attr('id', tableId)
      scheduleSelector = `#${tableId} tr`
      return false
    }
  })

  let concerts = scheduleSelector ? parseTableRows($, scheduleSelector) : []

  // Strategy 2: テーブル特定できなかった場合のみ全テーブルを試す
  if (concerts.length === 0) {
    concerts = parseTableRows($, 'table tr')
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
