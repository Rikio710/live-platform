import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    const allArtistIds: string[] = body.all_artist_ids ?? (body.artist_id ? [body.artist_id] : [])
    const mainArtistId = allArtistIds[0] ?? null

    const { error } = await admin.from('tours').update({
      artist_id: mainArtistId,
      name: body.name,
      image_url: body.image_url || null,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (allArtistIds.length > 0) {
      await (admin as any).from('tour_artists').delete().eq('tour_id', id)
      await (admin as any).from('tour_artists').insert(
        allArtistIds.map((artistId: string, i: number) => ({ tour_id: id, artist_id: artistId, order_num: i }))
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from('tours')
      .select('*, tour_artists(artists(id, name)), concerts(id, setlist_submissions(count))')
      .eq('id', id)
      .single()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const admin = createAdminClient()
    const { error } = await admin.from('tours').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
