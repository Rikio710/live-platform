import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ゲスト（未ログイン）投稿・投票用API
// ログイン済みの場合は実際のuser_idを使い、未ログインの場合はguest_user_id（localStorageから渡す）を使う

async function ensureGuestProfile(admin: ReturnType<typeof createAdminClient>, guestUserId: string, guestName: string) {
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
  const isGuest = !user

  // ---- 投票・いいね系（identity要件が異なる） ----

  if (action === 'like_post') {
    const { post_id, action_type } = data
    if (!post_id || !['like', 'unlike'].includes(action_type)) {
      return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    }
    if (user) {
      if (action_type === 'like') {
        await admin.from('post_likes').insert({ post_id, user_id: user.id })
        await admin.rpc('increment_likes', { post_id })
      } else {
        await admin.from('post_likes').delete().eq('post_id', post_id).eq('user_id', user.id)
        await admin.rpc('decrement_likes', { post_id })
      }
    } else {
      // ゲスト: カウンターのみ更新（post_likes への記録なし）
      if (action_type === 'like') await admin.rpc('increment_likes', { post_id })
      else await admin.rpc('decrement_likes', { post_id })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'setlist_submit') {
    const actorId = user?.id ?? guest_user_id
    if (!actorId || (!user && !guest_name)) {
      return NextResponse.json({ error: 'guest_user_id and guest_name are required' }, { status: 400 })
    }
    if (!user && guest_user_id && guest_name) await ensureGuestProfile(admin, guest_user_id, guest_name)

    const { concert_id, songs, spotify_url, apple_music_url } = data
    if (!concert_id || !Array.isArray(songs) || songs.length === 0) {
      return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    }

    const { data: subData, error: subErr } = await admin
      .from('setlist_submissions')
      .upsert(
        { concert_id, user_id: actorId, spotify_url: spotify_url?.trim() || null, apple_music_url: apple_music_url?.trim() || null },
        { onConflict: 'concert_id,user_id' }
      )
      .select('id').single()
    if (subErr || !subData) return NextResponse.json({ error: subErr?.message ?? 'Failed' }, { status: 500 })

    await admin.from('setlist_songs').delete().eq('submission_id', subData.id)

    const inserts = songs.map((s: any, i: number) => ({
      submission_id: subData.id, concert_id, user_id: actorId,
      song_name: s.name, song_type: s.type, order_num: i + 1, is_encore: s.encore ?? false,
    }))
    if (inserts.length > 0) {
      const { error: songsErr } = await admin.from('setlist_songs').insert(inserts)
      if (songsErr) return NextResponse.json({ error: songsErr.message }, { status: 500 })
    }

    return NextResponse.json({ submission_id: subData.id, guest_name: isGuest ? guest_name : null })
  }

  if (action === 'setlist_vote') {
    const actorId = user?.id ?? guest_user_id
    if (!actorId) return NextResponse.json({ error: 'guest_user_id required' }, { status: 400 })
    const { submission_id, action_type } = data
    if (!submission_id || !['vote', 'unvote'].includes(action_type)) {
      return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    }
    if (action_type === 'vote') {
      await admin.from('setlist_submission_votes').insert({ submission_id, user_id: actorId })
    } else {
      await admin.from('setlist_submission_votes').delete()
        .eq('submission_id', submission_id).eq('user_id', actorId)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'merch_wait_vote') {
    const actorId = user?.id ?? guest_user_id
    if (!actorId) return NextResponse.json({ error: 'guest_user_id required' }, { status: 400 })
    const { concert_id, wait_label, action_type } = data
    if (!concert_id || !action_type) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    if (action_type === 'unvote') {
      await admin.from('merch_wait_votes').delete().eq('concert_id', concert_id).eq('user_id', actorId)
    } else {
      await admin.from('merch_wait_votes').upsert(
        { concert_id, user_id: actorId, wait_label },
        { onConflict: 'concert_id,user_id' }
      )
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'merch_combo_vote') {
    const actorId = user?.id ?? guest_user_id
    if (!actorId) return NextResponse.json({ error: 'guest_user_id required' }, { status: 400 })
    const { catalog_item_id, concert_id, color_option, size_option, status, action_type } = data
    if (!catalog_item_id || !concert_id || !action_type) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
    if (action_type === 'unvote') {
      await admin.from('merch_combo_votes').delete()
        .eq('catalog_item_id', catalog_item_id).eq('concert_id', concert_id).eq('user_id', actorId)
        .eq('color_option', color_option ?? '').eq('size_option', size_option ?? '')
    } else {
      await admin.from('merch_combo_votes').upsert({
        catalog_item_id, concert_id, user_id: actorId,
        color_option: color_option ?? '', size_option: size_option ?? '', status,
      }, { onConflict: 'catalog_item_id,concert_id,user_id,color_option,size_option' })
    }
    return NextResponse.json({ ok: true })
  }

  // ---- 投稿・削除系（フルidentity必要） ----

  let userId: string
  let displayName: string | null

  if (user) {
    userId = user.id
    displayName = null
  } else {
    if (action === 'delete') {
      // delete はguest_nameが不要
      if (!guest_user_id) return NextResponse.json({ error: 'guest_user_id required' }, { status: 401 })
      userId = guest_user_id
      displayName = null
    } else {
      if (!guest_user_id || !guest_name) {
        return NextResponse.json({ error: 'guest_user_id and guest_name are required' }, { status: 400 })
      }
      userId = guest_user_id
      displayName = guest_name
      await ensureGuestProfile(admin, guest_user_id, guest_name)
    }
  }

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

    case 'delete': {
      const { table, record_id } = data
      const ALLOWED_TABLES = ['board_posts', 'post_comments', 'concert_reviews', 'nearby_spots', 'setlist_submissions']
      if (!record_id || !ALLOWED_TABLES.includes(table)) {
        return NextResponse.json({ error: 'Invalid' }, { status: 400 })
      }

      if (user) {
        const { error } = await admin.from(table as any).delete().eq('id', record_id).eq('user_id', userId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      } else {
        // ゲスト: guest_user_id が本物の認証ユーザーでないことを確認
        const { data: authData } = await admin.auth.admin.getUserById(guest_user_id)
        if (authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { error } = await admin.from(table as any).delete().eq('id', record_id).eq('user_id', guest_user_id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
      }
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
