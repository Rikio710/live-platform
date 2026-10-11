/**
 * 日本語などを含む URL（会場名の /venues/日本武道館、旧形式の /concerts/mrchildren-宮城… 等）を
 * 内部では ASCII だけの形（u-<base64url>）で扱うための変換。
 *
 * Vercel では ISR でキャッシュするページの URL が x-next-cache-tags ヘッダーに入り、
 * ASCII 以外の文字が含まれると「Invalid character in header content」で 500 になる（2026-10-04〜）。
 * そこで middleware で ASCII の形に書き換えて（rewrite・ブラウザの URL は元のまま）、ページ側で元に戻す。
 */
const PREFIX = 'u-'

export function toSlugKey(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** ページの params の slug を元の文字列に戻す（u-<base64url> なら復号、それ以外は URL デコード） */
export function fromSlugParam(raw: string): string {
  const s = decodeURIComponent(raw)
  if (!s.startsWith(PREFIX)) return s
  try {
    const b64 = s.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
  } catch {
    return s
  }
}

/** ASCII 以外の文字を含むか */
export function hasNonAscii(s: string): boolean {
  return /[^\x00-\x7f]/.test(s)
}
