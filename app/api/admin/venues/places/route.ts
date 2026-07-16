import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { query } = await req.json()
    if (!query?.trim()) return NextResponse.json({ error: 'クエリは必須です' }, { status: 400 })

    const apiKey = process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY が設定されていません' }, { status: 500 })

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&language=ja&region=jp&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return NextResponse.json({ error: 'Google API エラー' }, { status: 502 })

    const data = await res.json()
    if (!data.results?.length) return NextResponse.json({ address: null })

    const place = data.results[0]
    return NextResponse.json({
      address: place.formatted_address?.replace(/^日本、?/, '').trim() ?? null,
      name: place.name ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
