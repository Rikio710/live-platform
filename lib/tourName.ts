/**
 * ツアー名の先頭のアーティスト名を外す（「Dragon Ash「VOX in DA BOX」」→「VOX in DA BOX」）。
 * LiveFans のツアー名はアーティスト名入りで、ツアーページの表示が「Dragon Ash「Dragon Ash「…」」」と重複するため。
 * livefans-scraper/tourname.py と同じルール。
 */
const PAIRS: Record<string, string> = { '「': '」', '『': '』', '“': '”', '【': '】', '《': '》', '〈': '〉', '"': '"' }
// 外した残りがこれで始まるなら文として不自然なので元の名前のまま（例: 浦島坂田船の大忘年会、○○ at Billboard Live）
const KEEP_IF_REST_STARTS = /^(の|と|が|を|に|で|は|へ|や|&|＆|×|\(|（|x\s|feat|with\b|at\b|presents?\b|pre\.|vs\.?|and\b|in\b|on\b|meets?\b)/i

export function stripArtistPrefix(tourName: string, artistName: string): string {
  const name = tourName.trim()
  const a = (artistName ?? '').normalize('NFKC').trim().toLowerCase()
  if (!a || !name.normalize('NFKC').toLowerCase().startsWith(a)) return name
  // アーティスト名の直後に英数字が続く場合は別の単語の一部なので外さない
  const n = name.normalize('NFKC')
  const after = n.slice(a.length, a.length + 1)
  if (after && /[0-9A-Za-z]/.test(after) && /[0-9A-Za-z]/.test(a.slice(-1))) return name
  // 元の表記（全角の「～」など）を保ったまま、アーティスト名の長さぶんを切り取る
  let cut = -1
  for (let i = 0; i <= name.length; i++) {
    if (name.slice(0, i).normalize('NFKC').toLowerCase() === a) { cut = i; break }
  }
  if (cut < 0) return name
  let rest = name.slice(cut).replace(/^[\s　\-‐–—:：/／・|｜~〜～]+/, '')
  const close = PAIRS[rest[0]]
  if (rest.length >= 2 && close && rest.endsWith(close) && !rest.slice(1, -1).includes(rest[0]) && !rest.slice(1, -1).includes(close)) {
    rest = rest.slice(1, -1).trim()
  }
  if (rest.length < 4 || KEEP_IF_REST_STARTS.test(rest)) return name
  return rest
}
