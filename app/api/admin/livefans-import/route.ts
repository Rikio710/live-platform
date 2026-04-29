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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 管理者チェック
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!(profile as any)?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { url } = await req.json()
  if (!url || !url.startsWith('https://www.livefans.jp/events/')) {
    return NextResponse.json({ error: 'LiveFansのイベントURLを入力してください' }, { status: 400 })
  }

  const html = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LiveVault/1.0)' },
  }).then(r => r.text()).catch(() => null)

  if (!html) return NextResponse.json({ error: 'ページの取得に失敗しました' }, { status: 502 })

  const $ = cheerio.load(html)

  // イベントタイトル・アーティスト名取得
  const eventTitle = $('h1.eventTitle, h1.title, .eventName').first().text().trim()
    || $('title').text().replace(' - LiveFans', '').trim()

  // .notyet table 内の td.pcslN を全取得
  const entries: Array<{ idx: number; song_name: string; song_type: 'song' | 'mc' | 'other'; is_encore: boolean; memo: string | null }> = []

  $('.notyet table tr td').each((_, el) => {
    const td = $(el)
    const tdClass = td.attr('class') ?? ''

    // pcslN クラスを持つ td のみ対象
    if (!/pcsl\d+/.test(tdClass)) return

    // idx 値取得（正しい順番）
    const idxAttr = td.find('a[id^="idx-"]').attr('id') ?? ''
    const idxMatch = idxAttr.match(/idx-(\d+)/)
    if (!idxMatch) return
    const idx = parseInt(idxMatch[1], 10)

    // アンコール判定（rnd2クラスなし）
    const is_encore = !tdClass.includes('rnd2')

    // 曲名取得
    const titleEl = td.find('div.ttl a').first()
    const rawName = titleEl.text().trim()
    if (!rawName) return

    // メモ取得（div.ttl 内の p.memo）
    const memo = td.find('div.ttl p.memo').text().trim() || null

    // song_type 判定
    // /// で始まる名前 → other（SE・MCトークなど）
    // "MC" のみ → mc
    let song_type: 'song' | 'mc' | 'other' = 'song'
    if (/^MC$/i.test(rawName)) {
      song_type = 'mc'
    }

    // cmt div（第1部・第2部などのラベル）はスキップ
    entries.push({ idx, song_name: rawName, song_type, is_encore, memo })
  })

  // idx 順にソート → 正しいセトリ順
  entries.sort((a, b) => a.idx - b.idx)

  const songs: LiveFansSong[] = entries.map((e, i) => ({
    song_name: e.song_name,
    song_type: e.song_type,
    is_encore: e.is_encore,
    memo: e.memo,
    order_num: i + 1,
  }))

  return NextResponse.json({ songs, eventTitle })
}
