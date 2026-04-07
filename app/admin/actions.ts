'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// ---- 掲示板 ----
export async function adminDeletePost(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('board_posts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function adminDeleteComment(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('post_comments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- グッズ ----
export async function adminUpdateMerch(id: string, data: {
  name: string
  price: number | null
  image_url: string | null
  size_options: string[]
  color_options: string[]
}) {
  const admin = createAdminClient()
  const { error } = await admin.from('merch_catalog').update(data).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function adminDeleteMerch(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('merch_catalog').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- セトリ ----
export async function adminUpdateSong(id: string, data: {
  song_name: string
  song_type: string
  is_encore: boolean
  order_num: number
}) {
  const admin = createAdminClient()
  const { error } = await admin.from('setlist_songs').update(data).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function adminDeleteSong(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('setlist_songs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function adminDeleteSubmission(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('setlist_submissions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- 周辺情報 ----
export async function adminDeleteSpot(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('nearby_spots').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- お問い合わせ ----
export async function adminResolveContact(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('contact_messages').update({ is_resolved: true }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function adminDeleteContact(id: string) {
  const admin = createAdminClient()
  const { error } = await admin.from('contact_messages').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
