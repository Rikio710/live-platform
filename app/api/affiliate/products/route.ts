import { NextRequest, NextResponse } from 'next/server'
import { rakutenProducts } from '@/lib/rakutenItems'

// GET ?q=キーワード&artist=アーティスト名 … アフィリエイト枠の画像つき商品（楽天）。
// ページとは別に取ることで、楽天が応答しなかったときに「商品なしのページ」が7日間キャッシュされるのを防ぐ。
// 結果は CDN で1日キャッシュ（同じアーティストのページで使い回す）。商品なし（失敗含む）は短めにキャッシュ
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 100)
  const artist = (req.nextUrl.searchParams.get('artist') ?? '').slice(0, 100)
  if (!q || !artist) return NextResponse.json({ products: [] }, { status: 400 })
  const products = await rakutenProducts(q, artist)
  return NextResponse.json({ products }, {
    headers: { 'Cache-Control': products.length ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'public, s-maxage=600' },
  })
}
