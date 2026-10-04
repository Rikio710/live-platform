import * as cheerio from 'cheerio'

/**
 * LiveFans の公演ページからセトリ（曲順・アンコール）を読む。
 *
 * - 旧形式のページ（`element_read(` を含む。2025〜2026年でも約97%）は HTML 上の曲順がページ読み込みごとに
 *   シャッフルされていて、`/events/legend` が返す「モード」で JavaScript（jquery.setlist3.js の getSort/asort）が
 *   並べ替えて表示している。表示位置 b（1始まりの行番号）には class="sl{sort[b]}" の行が表示される。
 *   モードは読み込みごとに変わるので、同じ読み込みの Cookie で legend を取る。アンコールは td に rnd があり rnd2 がない行。
 * - 新形式のページ（element_read なし）は並べ替えなし。HTML 順で、「アンコール：」以降がアンコール。td に rnd がない。
 *
 * ブラウザで JavaScript 実行後の表示順と一致することを確認済み（livefans-scraper/validate.py の C）。
 */

const BASE = 'https://www.livefans.jp'

const SORT_MAPS: Record<string, Record<string, string>> = {
  beck:      { '1': '2', '2': '1' },
  hammett:   { '1': '4', '4': '1', '2': '3', '3': '2', '6': '5', '5': '6' },
  blackmore: { '1': '3', '3': '1', '2': '5', '5': '2', '6': '4', '4': '6' },
  white:     { '1': '6', '6': '1', '3': '5', '5': '3', '2': '4', '4': '2' },
  may:       { '1': '3', '3': '1', '2': '6', '6': '2', '4': '5', '5': '4' },
  johnson:   { '1': '4', '4': '1', '2': '8', '8': '2', '3': '10', '10': '3' },
  harrison:  { '1': '9', '9': '1', '3': '5', '5': '3', '6': '8', '8': '6' },
  young:     { '4': '2', '2': '4', '6': '8', '8': '6', '1': '10', '10': '1' },
  rhoads:    { '2': '9', '9': '2', '3': '4', '4': '3', '6': '1', '1': '6' },
  luke:      { '1': '6', '6': '1', '3': '7', '7': '3', '4': '5', '5': '4' },
}

export type LivefansSong = { song_name: string; is_encore: boolean; order_num: number }

/**
 * @returns 曲の配列。旧形式で legend（並べ替えモード）が取れず曲順を保証できない場合は null
 */
export async function parseLivefansSetlist(
  html: string,
  opts: { url: string; cookies?: string; headers?: Record<string, string> },
): Promise<LivefansSong[] | null> {
  const $ = cheerio.load(html)
  const shuffled = /element_read\(/.test(html)

  let sort: Record<string, string> = {}
  if (shuffled) {
    const key = html.match(/element_read\([^,]+,\s*[^,]+,\s*'(key1=\d+&key2=[^']+)'/)
    if (!key) return null
    const res = await fetch(`${BASE}/events/legend?${key[1]}`, {
      headers: {
        ...(opts.headers ?? {}),
        Referer: opts.url,
        'X-Requested-With': 'XMLHttpRequest',
        ...(opts.cookies ? { Cookie: opts.cookies } : {}),
      },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null)
    const mode = res?.ok ? (await res.text()).match(/(?:rowNoRewrite|getSort)\(['"](\w+)['"]/)?.[1] : undefined
    if (!mode || !(mode in SORT_MAPS)) return null
    sort = SORT_MAPS[mode]
  }

  const tds = $('div.setBlock td').toArray().filter(td => $(td).find('div.ttl').length > 0)
  const slOf = (td: (typeof tds)[number]) => {
    const m = ($(td).attr('class') ?? '').match(/\bsl(\d+)\b/)
    return m ? parseInt(m[1]) : null
  }

  let ordered = tds
  if (shuffled) {
    const posOfSl = new Map<number, number>()
    for (let b = 1; b <= tds.length + 10; b++) posOfSl.set(parseInt(sort[String(b)] ?? String(b)), b)
    ordered = tds
      .map((td, i) => ({ td, i, pos: posOfSl.get(slOf(td) ?? 0) ?? 10_000 }))
      .sort((a, b) => a.pos - b.pos || a.i - b.i)
      .map(x => x.td)
  }

  const songs: LivefansSong[] = []
  let encoreStarted = false
  for (const td of ordered) {
    const $td = $(td)
    const cls = ($td.attr('class') ?? '').split(/\s+/)
    let isEncore: boolean
    if (shuffled) {
      isEncore = cls.includes('rnd') && !cls.includes('rnd2')
    } else {
      if ($td.text().split('\n').some(t => t.includes('アンコール') && t.trim().length < 30)) encoreStarted = true
      isEncore = encoreStarted
    }
    $td.find('div.ttl').each((_, el) => {
      const ttl = $(el)
      const linked = ttl.find('a[href*="/songs/"]').first().text().trim()
      const clone = ttl.clone()
      clone.find('p.memo, .cmt, span').remove()
      const name = linked || clone.text().trim()
      // 曲番号・「EN」マーカー・「— 会場N位」のような行は曲ではない（リンク付きの曲名は数字だけでも実在曲: 「777」等）
      if (!name || /^EN\d*$/i.test(name) || /^[—–‒‐－-]/.test(name)) return
      if (!linked && /^\d+$/.test(name)) return
      songs.push({ song_name: name, is_encore: isEncore, order_num: songs.length + 1 })
    })
  }
  return songs
}
