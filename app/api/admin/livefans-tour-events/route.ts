import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'

export type TourEvent = {
  date: string
  venue_name: string
  start_time: string
  event_url: string
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

  const $ = cheerio.load(html)
  $('script, style').remove()

  // Find schedule table
  let scheduleSelector = ''
  $('table').each((_, table) => {
    const firstRowText = $(table).find('tr').first().text()
    if (firstRowText.includes('公演日') || firstRowText.includes('開演')) {
      const tableId = `lt-${Math.random().toString(36).slice(2)}`
      $(table).attr('id', tableId)
      scheduleSelector = `#${tableId} tr`
      return false
    }
  })

  if (!scheduleSelector) {
    return NextResponse.json({ error: 'スケジュール表が見つかりませんでした' }, { status: 422 })
  }

  const events: TourEvent[] = []

  $(scheduleSelector).each((_, row) => {
    const tds = $(row).find('td').toArray()
    if (tds.length < 3) return

    const dateText = $(tds[0]).text().trim()
    const dm = dateText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dm) return
    const date = `${dm[1]}-${dm[2]}-${dm[3]}`

    const timeText = $(tds[1]).text().trim()
    const tm = timeText.match(/^(\d{1,2}):(\d{2})$/)
    const start_time = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}:00` : ''

    const venueRaw = $(tds[2]).text().trim()
    const venue_name = venueRaw
      .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
      .trim()

    // Look for /events/ link anywhere in the row
    let event_url = ''
    $(row).find('a').each((_, a) => {
      const href = $(a).attr('href') ?? ''
      if (/\/events\/\d+/.test(href)) {
        event_url = href.startsWith('http') ? href : `https://www.livefans.jp${href}`
        return false
      }
    })

    if (venue_name && venue_name.length <= 60) {
      events.push({ date, venue_name, start_time, event_url })
    }
  })

  if (events.length === 0) {
    return NextResponse.json({ error: '公演情報が見つかりませんでした' }, { status: 422 })
  }

  return NextResponse.json({ events })
}
