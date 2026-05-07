import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as cheerio from 'cheerio'

export type LiveFansSong = {
  song_name: string
  song_type: 'song' | 'mc' | 'other'
  is_encore: boolean
  memo: string | null
  order_num: number
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// livefans jquery.setlist3.js の getSort() を完全再現
// キー: 表示位置（1-based）、値: そこに置くslNクラスの番号
const SORT_MAPS: Record<string, Record<string, string>> = {
  beck:      { '1':'2','2':'1' },
  hammett:   { '1':'4','4':'1','2':'3','3':'2','6':'5','5':'6' },
  blackmore: { '1':'3','3':'1','2':'5','5':'2','6':'4','4':'6' },
  white:     { '1':'6','6':'1','3':'5','5':'3','2':'4','4':'2' },
  may:       { '1':'3','3':'1','2':'6','6':'2','4':'5','5':'4' },
  johnson:   { '1':'4','4':'1','2':'8','8':'2','3':'10','10':'3' },
  harrison:  { '1':'9','9':'1','3':'5','5':'3','6':'8','8':'6' },
  young:     { '4':'2','2':'4','6':'8','8':'6','1':'10','10':'1' },
  rhoads:    { '2':'9','9':'2','3':'4','4':'3','6':'1','1':'6' },
  luke:      { '1':'6','6':'1','3':'7','7':'3','4':'5','5':'4' },
}

// slN → 表示順位のマップを構築（jquery.setlist3.js の asort() ロジックを再現）
function buildSlToPosition(mode: string, total: number): Record<number, number> {
  const sort = SORT_MAPS[mode] ?? {}
  const slToPos: Record<number, number> = {}
  for (let b = 1; b <= total + 10; b++) {
    const slN = sort[String(b)] ? parseInt(sort[String(b)]) : b
    slToPos[slN] = b
  }
  return slToPos
}

function parseSetlistHtml(html: string, slToPos: Record<number, number>) {
  const $ = cheerio.load(html)

  type RawEntry = {
    slN: number
    song_name: string
    song_type: 'song' | 'mc' | 'other'
    is_encore: boolean
    memo: string | null
    cmts: string[]
  }

  const rawEntries: RawEntry[] = []

  $('td.rnd').each((_, el) => {
    const td = $(el)
    const tdClass = td.attr('class') ?? ''

    // slN クラスを取得（pcslN とは別物）
    const slMatch = tdClass.match(/\bsl(\d+)\b/)
    if (!slMatch) return
    const slN = parseInt(slMatch[1], 10)

    const is_encore = !tdClass.includes('rnd2')

    const ttlEl = td.find('div.ttl')
    const linkedName = ttlEl.find('a').first().text().trim()
    const ttlClone = ttlEl.clone()
    ttlClone.find('p.memo, .cmt').remove()
    const plainName = ttlClone.text().trim()
    const rawName = linkedName || plainName
    if (!rawName) return

    const memo = td.find('div.ttl p.memo').text().trim() || null
    const cmts = td.find('div.cmt').map((_, c) => $(c).text().trim()).get().filter(Boolean)

    let song_type: 'song' | 'mc' | 'other' = 'song'
    if (/^MC$/i.test(rawName)) song_type = 'mc'
    else if (rawName.startsWith('///')) song_type = 'other'

    rawEntries.push({ slN, song_name: rawName, song_type, is_encore, memo, cmts })
  })

  if (rawEntries.length === 0) return []

  // song_type が 'song' のみ残す（MC・その他・cmtは除外）
  const songEntries = rawEntries.filter(e => e.song_type === 'song')

  const entries = songEntries.map(e => ({
    sort_key: slToPos[e.slN] ?? e.slN,
    song_name: e.song_name,
    song_type: 'song' as const,
    is_encore: e.is_encore,
    memo: e.memo,
  }))

  entries.sort((a, b) => a.sort_key - b.sort_key)

  return entries
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!(profile as any)?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { url } = await req.json()
  if (!url || !url.startsWith('https://www.livefans.jp/events/')) {
    return NextResponse.json({ error: 'LiveFansのイベントURLを入力してください' }, { status: 400 })
  }

  const baseHeaders = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ja,en;q=0.5',
  }

  // Step 1: メインページ取得（クッキー保存）
  const mainRes = await fetch(url, { headers: baseHeaders }).catch(() => null)
  if (!mainRes?.ok) return NextResponse.json({ error: 'ページの取得に失敗しました' }, { status: 502 })

  const html = await mainRes.text()
  const cookies = mainRes.headers.get('set-cookie') ?? ''

  const $main = cheerio.load(html)
  const eventTitle = $main('h1.eventTitle, h1.title, .eventName').first().text().trim()
    || $main('title').text().replace(' - LiveFans', '').trim()

  // Step 2: 同じセッションで legend エンドポイントを叩いてシャッフルモードを取得
  let slToPos: Record<number, number> = {}

  const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
  if (ajaxMatch) {
    const params = ajaxMatch[1]
    const legendUrl = `https://www.livefans.jp/events/legend?${params}`
    const legendRes = await fetch(legendUrl, {
      headers: {
        ...baseHeaders,
        'Referer': url,
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
    }).catch(() => null)

    if (legendRes?.ok) {
      const legendText = await legendRes.text()
      // rowNoRewrite('young') または getSort('young') からモード名を取得
      const modeMatch = legendText.match(/(?:rowNoRewrite|getSort)\(['"](\w+)['"]/)
      if (modeMatch) {
        const mode = modeMatch[1]
        const total = $main('td.rnd').length
        slToPos = buildSlToPosition(mode, total)
      }
    }
  }

  const entries = parseSetlistHtml(html, slToPos)

  const songs: LiveFansSong[] = entries.map((e, i) => ({
    song_name: e.song_name,
    song_type: e.song_type,
    is_encore: e.is_encore,
    memo: e.memo,
    order_num: i + 1,
  }))

  return NextResponse.json({ songs, eventTitle })
}
