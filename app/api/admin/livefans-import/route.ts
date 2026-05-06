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

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'

function parseSetlistHtml(html: string) {
  const $ = cheerio.load(html)

  type Entry = {
    top: number
    song_name: string
    song_type: 'song' | 'mc' | 'other'
    is_encore: boolean
    memo: string | null
    cmts: string[]
  }

  const entries: Entry[] = []

  // style="top: Xpx;" の値でソート（livefansが画面上の正しい順番を埋め込んでいる）
  $('td.rnd').each((_, el) => {
    const td = $(el)
    const tdClass = td.attr('class') ?? ''
    const style = td.attr('style') ?? ''

    const topMatch = style.match(/top:\s*(\d+)px/)
    if (!topMatch) return
    const top = parseInt(topMatch[1], 10)

    const is_encore = !tdClass.includes('rnd2')

    const ttlEl = td.find('div.ttl')
    const linkedName = ttlEl.find('a').first().text().trim()
    const ttlClone = ttlEl.clone()
    ttlClone.find('p.memo, .cmt').remove()
    const plainName = ttlClone.text().trim()
    const rawName = linkedName || plainName
    if (!rawName) return

    const memo = td.find('div.ttl p.memo').text().trim() || null

    // 複数 div.cmt を個別に収集
    const cmts = td.find('div.cmt').map((_, c) => $(c).text().trim()).get().filter(Boolean)

    let song_type: 'song' | 'mc' | 'other' = 'song'
    if (/^MC$/i.test(rawName)) song_type = 'mc'
    else if (rawName.startsWith('///')) song_type = 'other'

    entries.push({ top, song_name: rawName, song_type, is_encore, memo, cmts })
  })

  entries.sort((a, b) => a.top - b.top)

  // cmt を曲の直後に挿入
  type FinalEntry = { sort_key: number; song_name: string; song_type: 'song' | 'mc' | 'other'; is_encore: boolean; memo: string | null }
  const result: FinalEntry[] = []
  for (const e of entries) {
    result.push({ sort_key: e.top, song_name: e.song_name, song_type: e.song_type, is_encore: e.is_encore, memo: e.memo })
    e.cmts.forEach((cmt, i) => {
      result.push({ sort_key: e.top + 0.1 + i * 0.01, song_name: `///${cmt}`, song_type: 'other', is_encore: e.is_encore, memo: null })
    })
  }

  return result
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

  // Step 1: メインページ取得
  const html = await fetch(url, { headers: { 'User-Agent': UA } }).then(r => r.text()).catch(() => null)
  if (!html) return NextResponse.json({ error: 'ページの取得に失敗しました' }, { status: 502 })

  const $main = cheerio.load(html)
  const eventTitle = $main('h1.eventTitle, h1.title, .eventName').first().text().trim()
    || $main('title').text().replace(' - LiveFans', '').trim()

  // Step 2: まず静的HTMLからセトリを試みる
  let entries = parseSetlistHtml(html)

  // Step 3: 静的HTMLに曲がない場合 → AJAXエンドポイントから取得
  if (entries.length === 0) {
    // window.onload の element_read呼び出しからkey1・key2を抽出
    const ajaxMatch = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
    if (ajaxMatch) {
      const params = ajaxMatch[1]
      const legendUrl = `https://www.livefans.jp/events/legend?${params}`
      const legendHtml = await fetch(legendUrl, { headers: { 'User-Agent': UA, 'Referer': url } })
        .then(r => r.text()).catch(() => null)
      if (legendHtml) {
        entries = parseSetlistHtml(legendHtml)
      }
    }
  }

  const songs: LiveFansSong[] = entries.map((e, i) => ({
    song_name: e.song_name,
    song_type: e.song_type,
    is_encore: e.is_encore,
    memo: e.memo,
    order_num: i + 1,
  }))

  return NextResponse.json({ songs, eventTitle })
}
