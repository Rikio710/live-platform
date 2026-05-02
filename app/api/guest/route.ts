import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ゲスト（未ログイン）投稿用API
// ログイン済みの場合は実際のuser_idを使い、未ログインの場合はguest_user_id（localStorageから渡す）を使う

async function ensureGuestProfile(admin: ReturnType<typeof createAdminClient>, guestUserId: string, guestName: string) {
  // profileが存在しなければ作成（存在するなら何もしない）
  const { data } = await admin.from('profiles').select('id').eq('id', guestUserId).maybeSingle()
  if (!data) {
    await admin.from('profiles').insert({ id: guestUserId, username: guestName })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, guest_user_id, guest_name, ...data } = body

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  let userId: string
  let displayName: string | null

  if (user) {
    userId = user.id
    displayName = null // profileから取得されるので不要
  } else {
    if (!guest_user_id || !guest_name) {
      return NextResponse.json({ error: 'guest_user_id and guest_name are required' }, { status: 400 })
    }
    userId = guest_user_id
    displayName = guest_name
    await ensureGuestProfile(admin, guest_user_id, guest_name)
  }

  const isGuest = !user

  switch (action) {
    case 'board_post': {
      const { concert_id, content, category, is_spoiler, media_url, media_type } = data
      if (!concert_id || !content?.trim()) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: post, error } = await admin.from('board_posts').insert({
        concert_id, user_id: userId,
        content: content.trim(), category: category ?? 'chat',
        is_spoiler: is_spoiler ?? false,
        media_url: media_url ?? null,
        media_type: media_type ?? null,
        ...(isGuest ? { guest_name: displayName } : {}),
      }).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ post, isGuest, displayName })
    }

    case 'comment': {
      const { post_id, content } = data
      if (!post_id || !content?.trim()) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: comment, error } = await admin.from('post_comments').insert({
        post_id, user_id: userId, content: content.trim(),
        ...(isGuest ? { guest_name: displayName } : {}),
      }).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ comment, isGuest, displayName })
    }

    case 'review': {
      const { concert_id, rating, comment } = data
      if (!concert_id || !rating) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: review, error } = await admin.from('concert_reviews').insert({
        concert_id, user_id: userId, rating, comment: comment?.trim() || null,
        ...(isGuest ? { guest_name: displayName } : {}),
      }).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ review, isGuest, displayName })
    }

    case 'nearby_spot': {
      const { concert_id, category, name, description, address, url } = data
      if (!concert_id || !name?.trim()) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: spot, error } = await admin.from('nearby_spots').insert({
        concert_id, user_id: userId,
        category, name: name.trim(),
        description: description?.trim() || null,
        address: address?.trim() || null,
        url: url?.trim() || null,
        ...(isGuest ? { guest_name: displayName } : {}),
      }).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ spot, isGuest, displayName })
    }

    case 'merch_catalog': {
      const { tour_id, name, price, image_url, size_options, color_options } = data
      if (!tour_id || !name?.trim()) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      const { data: item, error } = await admin.from('merch_catalog').insert({
        tour_id, user_id: userId, name: name.trim(),
        price: price ? Number(price) : null,
        image_url: image_url?.trim() || null,
        size_options: size_options ?? [],
        color_options: color_options ?? [],
        ...(isGuest ? { guest_name: displayName } : {}),
      }).select('*').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ item, isGuest, displayName })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
