'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Hotel, Disc3 } from 'lucide-react'
import type { AffiliateItem, AffiliateProduct } from '@/lib/affiliate'
import { dataLayerPush } from '@/lib/gtag'

/**
 * アフィリエイトの枠。ステマ規制のため必ず「PR」を表示し、リンクは rel="sponsored"。
 * ID が未設定などで items が空なら何も表示しない。
 */
export default function AffiliateBox({ items, productQuery, placement, title = '関連商品・サービス' }: {
  items: AffiliateItem[]
  /** 画像つきで出す商品（楽天の商品検索）の検索語。表示後にブラウザから /api/affiliate/products で取る */
  productQuery?: { q: string; artist: string } | null
  placement: string
  title?: string
}) {
  const [products, setProducts] = useState<AffiliateProduct[]>([])
  useEffect(() => {
    if (!productQuery) return
    const params = new URLSearchParams(productQuery)
    let alive = true
    fetch(`/api/affiliate/products?${params}`)
      .then(r => r.json())
      .then((d: { products?: AffiliateProduct[] }) => { if (alive) setProducts(d.products ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [productQuery?.q, productQuery?.artist]) // eslint-disable-line react-hooks/exhaustive-deps
  if (items.length === 0 && products.length === 0) return null
  return (
    <section className="glass rounded-2xl p-4 space-y-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-[#8888aa] border border-white/15 rounded px-1.5 py-0.5 leading-none">PR</span>
        <h2 className="text-xs font-bold text-[#b3b3b3]">{title}</h2>
      </div>
      {products.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {products.map(p => (
            <a
              key={p.href}
              href={p.href}
              target="_blank"
              rel="sponsored nofollow noopener noreferrer"
              onClick={() => dataLayerPush({ event: 'affiliate_click', affiliate_provider: 'rakuten_item', affiliate_placement: placement })}
              className="min-w-0 rounded-xl bg-white/5 hover:bg-white/10 p-2 transition-colors space-y-1.5"
            >
              <div className="aspect-square rounded-lg bg-white overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" loading="lazy" className="w-full h-full object-contain" />
              </div>
              <p className="text-[11px] text-white leading-snug line-clamp-2 break-words">{p.name}</p>
              <p className="text-xs font-bold text-white tabular-nums">¥{p.price.toLocaleString('ja-JP')}<span className="text-[10px] font-normal text-[#8888aa] ml-1">楽天</span></p>
            </a>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map(it => (
          <a
            key={it.href}
            href={it.href}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            onClick={() => dataLayerPush({ event: 'affiliate_click', affiliate_provider: it.provider, affiliate_placement: placement })}
            className="flex items-center gap-3 rounded-xl bg-white/5 hover:bg-white/10 px-3 py-2.5 transition-colors min-w-0 group"
          >
            <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              {it.provider === 'rakuten_travel' ? <Hotel size={15} className="text-[#b3b3b3]" /> : <Disc3 size={15} className="text-[#b3b3b3]" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-white truncate">{it.label}</span>
              <span className="block text-[11px] text-[#8888aa]">{it.sub}</span>
            </span>
            <ExternalLink size={13} className="text-[#8888aa] shrink-0" />
          </a>
        ))}
      </div>
      <p className="text-[10px] text-[#666]">
        リンク先での購入・予約により LiveVault に収益が発生することがあります。<Link href="/ad-policy" className="underline hover:text-[#8888aa]">広告について</Link>
      </p>
    </section>
  )
}
