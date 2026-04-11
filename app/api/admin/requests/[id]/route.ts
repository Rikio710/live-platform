import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    if (body.status === 'approved') {
      const { data: request } = await admin.from('requests').select('*').eq('id', id).single()
      if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const p = body.payload ?? request.payload

      if (request.type === 'artist') {
        const { error } = await admin.from('artists').insert({
          name: p.name,
          image_url: p.image_url || null,
          description: p.description || null,
          website_url: p.website_url || null,
          twitter_url: p.twitter_url || null,
          instagram_url: p.instagram_url || null,
          youtube_url: p.youtube_url || null,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else if (request.type === 'tour') {
        const { error } = await admin.from('tours').insert({
          name: p.name,
          artist_id: p.artist_id,
          start_date: p.start_date || null,
          end_date: p.end_date || null,
          image_url: p.image_url || null,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      } else if (request.type === 'concert') {
        const { error } = await admin.from('concerts').insert({
          tour_id: p.tour_id || null,
          artist_id: p.artist_id,
          venue_name: p.venue_name,
          date: p.date,
          start_time: p.start_time || null,
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    const { data, error } = await admin
      .from('requests')
      .update({ status: body.status, admin_note: body.admin_note ?? null })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
