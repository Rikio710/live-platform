import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function GET() {
  try { await requireAdmin() } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const [{ data: tours, error }, { data: concertData }] = await Promise.all([
    admin
      .from('tours')
      .select('id, name, start_date, end_date, image_url, livefans_group_id, artists(name, livefans_id), concerts(count)')
      .order('start_date', { ascending: false }),
    admin
      .from('concerts')
      .select('tour_id, setlist_submissions(count)'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // tour_id ごとのセトリカバレッジを集計
  const coverage: Record<string, { total: number; withSetlist: number }> = {}
  for (const c of concertData ?? []) {
    const tid = c.tour_id ?? ''
    if (!tid) continue
    if (!coverage[tid]) coverage[tid] = { total: 0, withSetlist: 0 }
    coverage[tid].total++
    const count = (c.setlist_submissions as any)?.[0]?.count ?? 0
    if (count > 0) coverage[tid].withSetlist++
  }

  const fields = [
    'artist_name', 'tour_name', 'date_from', 'date_to',
    'concert_count', 'setlist_count', 'setlist_coverage',
    'has_image', 'livefans_group_id', 'group_url', 'livefans_id', 'scraper_url', 'tour_id',
  ]

  const rows = (tours ?? []).map(t => {
    const cv = coverage[t.id] ?? { total: 0, withSetlist: 0 }
    const artist = t.artists as any
    const livefansArtistId = artist?.livefans_id ?? ''
    return {
      artist_name: artist?.name ?? '',
      tour_name: t.name,
      date_from: t.start_date ?? '',
      date_to: t.end_date ?? '',
      concert_count: (t.concerts as any)?.[0]?.count ?? 0,
      setlist_count: cv.withSetlist,
      setlist_coverage: cv.total > 0 ? `${Math.round(cv.withSetlist / cv.total * 100)}%` : '',
      has_image: t.image_url ? 'あり' : 'なし',
      livefans_group_id: t.livefans_group_id ?? '',
      group_url: t.livefans_group_id ? `https://www.livefans.jp/groups/${t.livefans_group_id}` : '',
      livefans_id: livefansArtistId,
      scraper_url: livefansArtistId ? `https://www.livefans.jp/search/artist/${livefansArtistId}?year=before` : '',
      tour_id: t.id,
    }
  })

  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }

  const csv = [
    fields.join(','),
    ...rows.map(r => fields.map(f => esc(r[f as keyof typeof r])).join(',')),
  ].join('\n')

  const today = new Date().toISOString().split('T')[0]
  return new NextResponse('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="livevault_tours_${today}.csv"`,
    },
  })
}
