import { unstable_cache } from 'next/cache'
import { rakuten, type AffiliateProduct } from '@/lib/affiliate'

/**
 * 楽天市場の商品検索API（新しい openapi.rakuten.co.jp）で、アフィリエイトの枠に画像つきで出す商品を探す。
 *   環境変数（サーバー側だけ。ブラウザには出さない）: RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY
 *   - 楽天のAPIは「1秒に1回まで」なので、同じキーワードの結果は7日間キャッシュする（同じアーティストのページで使い回す）
 *   - 失敗したとき（制限超過・通信エラー）はキャッシュせず空を返し、枠は文字だけのリンクに戻る
 *   - リンクは API が返す affiliateUrl ではなく、商品URL に自分の楽天アフィリエイトID を付けて作る
 */
const APP_ID = process.env.RAKUTEN_APP_ID ?? ''
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY ?? ''
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701'

type ApiItem = { itemName: string; itemPrice: number; itemUrl: string; mediumImageUrls?: string[]; availability?: number }

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s・.'’]/g, '')

async function search(keyword: string): Promise<{ name: string; price: number; image: string; url: string }[]> {
  const params = new URLSearchParams({
    applicationId: APP_ID, accessKey: ACCESS_KEY, keyword, hits: '10', availability: '1',
    imageFlag: '1', format: 'json', formatVersion: '2',
  })
  const res = await fetch(`${ENDPOINT}?${params}`, {
    // 楽天側に登録したサイトからの問い合わせとして送る（ないと 403）
    headers: { Referer: 'https://livevault.jp', Origin: 'https://livevault.jp' },
    signal: AbortSignal.timeout(4000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`rakuten ${res.status}`) // 例外にしてキャッシュさせない
  const data = await res.json() as { Items?: ApiItem[] }
  return (data.Items ?? []).map(it => ({
    name: it.itemName,
    price: it.itemPrice,
    image: (it.mediumImageUrls?.[0] ?? '').replace(/_ex=\d+x\d+/, '_ex=240x240'),
    url: it.itemUrl,
  })).filter(it => it.image && !/no_?image/i.test(it.image)) // 画像なし（NO IMAGE）の商品は出さない
}

const cachedSearch = unstable_cache(search, ['rakuten-items-v2'], { revalidate: 604800 })

/** artist の名前を含む商品だけ、最大 limit 件（無関係な商品を出さないため） */
export async function rakutenProducts(keyword: string, artist: string, limit = 3): Promise<AffiliateProduct[]> {
  if (!APP_ID || !ACCESS_KEY || !keyword.trim()) return []
  try {
    const key = norm(artist)
    // 英数字だけの名前（eill 等）は前後が英数字でないことも見る（「BAREILLES」の中の eill に一致させない）
    const ascii = /^[a-z0-9]+$/.test(key)
    const wordRe = ascii ? new RegExp(`(^|[^a-z0-9])${key}([^a-z0-9]|$)`) : null
    const matches = (name: string) => {
      const n = norm(name)
      return !key || (wordRe ? wordRe.test(n) : n.includes(key))
    }
    const items = (await cachedSearch(keyword)).filter(it => matches(it.name) && !/中古|USED|レンタル/i.test(it.name))
    return items.slice(0, limit).flatMap(it => {
      const href = rakuten(it.url)
      return href ? [{ name: it.name, price: it.price, image: it.image, href }] : []
    })
  } catch {
    return []
  }
}
