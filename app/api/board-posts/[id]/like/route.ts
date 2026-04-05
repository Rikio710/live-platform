import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // トグル: すでにいいね済みなら取り消し
  const { data: existing } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await supabase.from('post_likes').delete().eq('id', existing.id)
    await supabase.rpc('decrement_likes', { post_id: id })
  } else {
    await supabase.from('post_likes').insert({ post_id: id, user_id: user.id })
    await supabase.rpc('increment_likes', { post_id: id })
  }

  return NextResponse.json({ ok: true })
}
