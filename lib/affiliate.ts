/**
 * アフィリエイトリンク（2026-10 開始）
 *   ID は Vercel の環境変数で設定する。未設定のものはリンクを出さない（ID がないと報酬にならないため）
 *     NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID  … 楽天アフィリエイトID（楽天市場・楽天トラベル）
 *     NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG  … Amazon アソシエイトのトラッキングID（livevault-22）。あればこちらを優先
 *     NEXT_PUBLIC_MOSHIMO_AMAZON_AID    … もしもアフィリエイトの Amazon 用 a_id
 *     NEXT_PUBLIC_MOSHIMO_RAKUTEN_AID   … もしもアフィリエイトの 楽天市場 用 a_id（楽天アフィリエイトIDがないときに使う）
 *   商品を1つずつ登録せず、検索結果ページへのリンクに ID を付けて全ページに自動で出す。
 *   ステマ規制（景品表示法）のため、表示する枠には必ず「PR」を付ける（components/features/affiliate/AffiliateBox.tsx）
 */
const RAKUTEN_AFF = process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID ?? ''
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG ?? ''
const MOSHIMO_AMAZON = process.env.NEXT_PUBLIC_MOSHIMO_AMAZON_AID ?? ''
const MOSHIMO_RAKUTEN = process.env.NEXT_PUBLIC_MOSHIMO_RAKUTEN_AID ?? ''

/** 画像つきで出す商品（楽天の商品検索APIの結果。lib/rakutenItems.ts） */
export type AffiliateProduct = {
  name: string
  price: number
  image: string
  href: string
}

export type AffiliateItem = {
  provider: 'amazon' | 'rakuten' | 'rakuten_travel'
  label: string
  sub: string
  href: string
}

const enc = encodeURIComponent

function amazon(url: string): string | null {
  if (AMAZON_TAG) return `${url}${url.includes('?') ? '&' : '?'}tag=${enc(AMAZON_TAG)}`
  if (!MOSHIMO_AMAZON) return null
  return `https://af.moshimo.com/af/c/click?a_id=${enc(MOSHIMO_AMAZON)}&p_id=170&pc_id=185&pl_id=4062&url=${enc(url)}`
}

export function rakuten(url: string): string | null {
  if (RAKUTEN_AFF) return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFF}/?pc=${enc(url)}&m=${enc(url)}`
  if (MOSHIMO_RAKUTEN) return `https://af.moshimo.com/af/c/click?a_id=${enc(MOSHIMO_RAKUTEN)}&p_id=54&pc_id=54&pl_id=616&url=${enc(url)}`
  return null
}

/** 楽天トラベルは楽天アフィリエイトIDでだけ報酬になる（もしもの楽天市場リンクは対象外） */
function rakutenTravel(url: string): string | null {
  return RAKUTEN_AFF ? `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFF}/?pc=${enc(url)}&m=${enc(url)}` : null
}

const amazonSearch = (q: string) => `https://www.amazon.co.jp/s?k=${enc(q)}`
const rakutenSearch = (q: string) => `https://search.rakuten.co.jp/search/mall/${enc(q)}/`
const travelSearch = (q: string) => `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${enc(q)}`

function compact(items: (AffiliateItem | null)[]): AffiliateItem[] {
  return items.filter((x): x is AffiliateItem => !!x && !!x.href)
}

function item(provider: AffiliateItem['provider'], label: string, sub: string, href: string | null): AffiliateItem | null {
  return href ? { provider, label, sub, href } : null
}

/** 公演ページ: 開催前は会場近くのホテル、開催後はライブ映像・CD */
export function concertAffiliateItems(c: { artist: string | null; tour: string | null; venue: string | null; upcoming: boolean }): AffiliateItem[] {
  const artist = c.artist ?? ''
  if (c.upcoming) {
    return compact([
      c.venue ? item('rakuten_travel', `${c.venue}周辺のホテルを探す`, '楽天トラベル', rakutenTravel(travelSearch(c.venue))) : null,
      artist ? item('amazon', `${artist}のCD・グッズで予習`, 'Amazon', amazon(amazonSearch(`${artist} CD`))) : null,
      artist ? item('rakuten', `${artist}のCD・グッズで予習`, '楽天市場', rakuten(rakutenSearch(`${artist} CD`))) : null,
    ])
  }
  const q = c.tour ? `${artist} ${c.tour} Blu-ray` : `${artist} ライブ Blu-ray`
  return compact([
    artist ? item('amazon', 'このライブの映像作品・CDを探す', 'Amazon', amazon(amazonSearch(q))) : null,
    artist ? item('rakuten', 'このライブの映像作品・CDを探す', '楽天市場', rakuten(rakutenSearch(q))) : null,
  ])
}

/** ツアーページ: 映像作品・CD（開催中・開催前は会場のホテルは公演ページで出すので出さない） */
export function tourAffiliateItems(t: { artist: string | null; tour: string }): AffiliateItem[] {
  const q = `${t.artist ?? ''} ${t.tour} Blu-ray`.trim()
  return compact([
    item('amazon', 'このツアーの映像作品・CDを探す', 'Amazon', amazon(amazonSearch(q))),
    item('rakuten', 'このツアーの映像作品・CDを探す', '楽天市場', rakuten(rakutenSearch(q))),
  ])
}

/** アーティストページ: CD・ライブ映像・グッズ */
export function artistAffiliateItems(a: { name: string }): AffiliateItem[] {
  return compact([
    item('amazon', `${a.name}のCD・ライブ映像を探す`, 'Amazon', amazon(amazonSearch(`${a.name}`))),
    item('rakuten', `${a.name}のCD・グッズを探す`, '楽天市場', rakuten(rakutenSearch(`${a.name}`))),
  ])
}
