import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'

export type TourEvent = {
  date: string
  venue_name: string
  start_time: string
  event_url: string
  artist_livefans_ids: number[]
}

export type GroupArtist = {
  name: string
  livefans_id: number
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

  // グループ全体のアーティスト: p.mainArtist の /artists/{id} リンクから name→livefans_id マップを構築
  const groupArtists: GroupArtist[] = []
  const nameToLivefansId = new Map<string, number>()
  $('p.mainArtist a[href*="/artists/"]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    const m = href.match(/\/artists\/(\d+)/)
    const name = $(el).text().trim()
    if (m && name) {
      const id = parseInt(m[1])
      groupArtists.push({ name, livefans_id: id })
      nameToLivefansId.set(name, id)
    }
  })

  // Find schedule table: ヘッダーありの場合もなしの場合も対応
  let scheduleSelector = ''
  $('table').each((_, table) => {
    const firstRowText = $(table).find('tr').first().text()
    const hasHeader = firstRowText.includes('公演日') || firstRowText.includes('開演')
    const hasDatePattern = /\d{4}\/\d{2}\/\d{2}/.test($(table).text())
    const hasEventLink = $(table).find('a[href*="/events/"]').length > 0
    if (hasHeader || (hasDatePattern && hasEventLink)) {
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
    if (tds.length < 2) return

    const dateText = $(tds[0]).text().trim()
    const dm = dateText.match(/(\d{4})\/(\d{2})\/(\d{2})/)
    if (!dm) return
    const date = `${dm[1]}-${dm[2]}-${dm[3]}`

    // 対バン形式の検出
    const rowText = tds.map(td => $(td).text()).join(' ')
    const isTaiban = /出演[：:]/.test(rowText)

    let start_time = ''
    let venue_name = ''

    if (isTaiban) {
      for (let j = 1; j < tds.length; j++) {
        const tdEl = $(tds[j])
        if (!/出演[：:]/.test(tdEl.text())) continue
        const tm = $(tds[1]).text().trim().match(/(\d{1,2}):(\d{2})/) ?? tdEl.text().match(/(\d{1,2}):(\d{2})/)
        if (tm) start_time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`
        // Venue: remove eventname and listArtName spans, leaving only the venue text node
        const clone = tdEl.clone()
        clone.find('span.eventname, span.listArtName').remove()
        venue_name = clone.text().trim()
          .replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '')
          .trim()
        break
      }
    } else {
      if (tds.length < 3) return
      for (const td of tds) {
        const txt = $(td).text().trim()
        const tm = txt.match(/(\d{1,2}):(\d{2})/)
        if (tm) { start_time = `${tm[1].padStart(2, '0')}:${tm[2]}:00`; break }
      }
      let venueRaw = ''
      for (let j = 1; j < tds.length; j++) {
        const txt = $(tds[j]).text().trim()
        if (/^[\d:]+$/.test(txt)) continue
        if (txt.length >= 3) { venueRaw = txt; break }
      }
      venue_name = venueRaw.replace(/\s*[（(][^)）]*[都道府県][^)）]*[)）]/g, '').trim()
    }

    // Look for /events/ link anywhere in the row
    let event_url = ''
    $(row).find('a').each((_, a) => {
      const href = $(a).attr('href') ?? ''
      if (/\/events\/\d+/.test(href)) {
        event_url = href.startsWith('http') ? href : `https://www.livefans.jp${href}`
        return false
      }
    })

    // span.listArtName から出演者名を取得し、nameToLivefansId でIDに変換
    const artist_livefans_ids: number[] = []
    const listArtText = $(row).find('span.listArtName').text()
    const artistNamesRaw = listArtText.replace(/^出演[：:]\s*/, '').trim()
    if (artistNamesRaw) {
      artistNamesRaw.split(/[,、]/).forEach(name => {
        const trimmed = name.trim()
        const id = nameToLivefansId.get(trimmed)
        if (id !== undefined) artist_livefans_ids.push(id)
      })
    }

    if (venue_name && venue_name.length <= 60) {
      events.push({ date, venue_name, start_time, event_url, artist_livefans_ids })
    }
  })

  if (events.length === 0) {
    return NextResponse.json({ error: '公演情報が見つかりませんでした' }, { status: 422 })
  }

  return NextResponse.json({ events, groupArtists })
}
