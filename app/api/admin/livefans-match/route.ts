import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'
import * as cheerio from 'cheerio'

export const dynamic = 'force-dynamic'

const UA = 'Mozilla/5.0 (compatible; LiveVault/1.0)'
const BASE = 'https://www.livefans.jp'

// GET: 全アーティスト（livefans_ids の一覧を含む）
export async function GET() {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    // アーティスト全件取得
    const all = []
    const pageSize = 1000
    let from = 0
    while (true) {
      const { data, error } = await admin
        .from('artists')
        .select('id, name')
        .order('name')
        .range(from, from + pageSize - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }

    // artist_livefans_ids 全件取得
    const { data: livefansRows } = await (admin as any)
      .from('artist_livefans_ids')
      .select('artist_id, livefans_id, crawl_page, total_pages, last_crawled_at')

    // アーティストIDでグループ化
    const livefansMap = new Map<string, { livefans_id: number; crawl_page: number; total_pages: number | null; last_crawled_at: string | null }[]>()
    for (const row of livefansRows ?? []) {
      if (!livefansMap.has(row.artist_id)) livefansMap.set(row.artist_id, [])
      livefansMap.get(row.artist_id)!.push(row)
    }

    const result = all.map(a => ({ ...a, livefans_ids: livefansMap.get(a.id) ?? [] }))
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// POST: アーティスト名でLiveFans検索 → 候補を返す
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { name } = await req.json()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

    const url = `${BASE}/search?option=6&keyword=${encodeURIComponent(name)}&genre=all`
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en' },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null)

    if (!res?.ok) return NextResponse.json({ candidates: [] })

    const html = await res.text()
    const $ = cheerio.load(html)

    const candidates: { livefans_id: number; name: string }[] = []
    const seen = new Set<number>()

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const match = href.match(/^\/artists\/(\d+)$/)
      if (!match) return
      const id = parseInt(match[1])
      if (seen.has(id)) return
      seen.add(id)

      const container = $(el).closest('li, tr, div.event, div.list, section, article')
      const artistName =
        container.find('h2, h3, h4, .name, .title, .artistName').first().text().trim() ||
        $(el).text().trim()

      if (id && artistName) candidates.push({ livefans_id: id, name: artistName })
    })

    return NextResponse.json({ candidates })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// PUT: livefans_id を追加
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin()
    const { artist_id, livefans_id } = await req.json()
    if (!artist_id || !livefans_id) return NextResponse.json({ error: 'artist_id and livefans_id required' }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('artist_livefans_ids')
      .upsert({ artist_id, livefans_id, crawl_page: 0 }, { onConflict: 'livefans_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// DELETE: livefans_id を解除
export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin()
    const { artist_id, livefans_id } = await req.json()
    if (!artist_id || !livefans_id) return NextResponse.json({ error: 'artist_id and livefans_id required' }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('artist_livefans_ids')
      .delete()
      .eq('artist_id', artist_id)
      .eq('livefans_id', livefans_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
