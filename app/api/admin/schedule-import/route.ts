import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'

type ConcertRow = { venue_name: string; date: string; start_time: string; event_url: string; additional_artists: string[] }

function extractArtistsFromTaiban(cellText: string): string[] {
  const m = cellText.match(/出演[：:]\s*(.+)/)
  if (!m) return []
  return m[1].split(/[,、\/／]\s*/).map(s => s.trim()).filter(Boolean)
}

function parseTableRows($: cheerio.CheerioAPI, selector: string): ConcertRow[] {
  const concerts: ConcertRow[] = []
  $(selector).each((_, row) => {
    const tds = $(row).find('td').toArray()
    if (tds.length < 2) return

    // セル0: 日付
    const dateText = $(tds[0]).text().trim()
    const dm = dateText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dm) return
    const date = `${dm[1]}-${dm[2]}-${dm[3]}`

    // 対バン形式の検出: いずれかのセルに「出演：」が含まれる
    const rowText = tds.map(td => $(td).text()).join(' ')
    const isTaiban = /出演[：:]/.test(rowText)

    let time = ''
    let venue = ''

    let additionalArtists: string[] = []
    if (isTaiban) {
      for (let j = 1; j < tds.length; j++) {
        const tdEl = $(tds[j])
        if (!/出演[：:]/.test(tdEl.text())) continue
        // Time from column 1 (usually empty for対バン) or within this cell
        const tm = $(tds[1]).text().trim().match(/(\d{1,2}):(\d{2})/) ?? tdEl.text().match(/(\d{1,2}):(\d{2})/)
        if (tm) time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
        // Venue: remove eventname and listArtName spans, leaving only the venue text node
        const clone = tdEl.clone()
        clone.find('span.eventname, span.listArtName').remove()
        venue = clone.text().trim()
          .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
          .trim()
        // Artists from listArtName span
        additionalArtists = extractArtistsFromTaiban(tdEl.find('span.listArtName').text())
        break
      }
    } else {
      if (tds.length < 3) return
      const timeText = $(tds[1]).text().trim()
      const tm = timeText.match(/(\d{1,2}):(\d{2})/)
      time = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}:00` : ''
      const venueRaw = $(tds[2]).text().trim()
      venue = venueRaw.replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '').trim()
    }

    // 行内の /events/XXXXX リンクを抽出
    let event_url = ''
    $(row).find('a').each((_, a) => {
      const href = $(a).attr('href') ?? ''
      if (/\/events\/\d+/.test(href)) {
        event_url = href.startsWith('http') ? href : `https://www.livefans.jp${href}`
        return false
      }
    })

    if (venue && venue.length > 0 && venue.length <= 60) {
      concerts.push({ venue_name: venue, date, start_time: time, event_url, additional_artists: additionalArtists })
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
