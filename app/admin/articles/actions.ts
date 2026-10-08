'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/supabase/guards'
import { computeStandardSongs, defaultStandardSongsArticle, type Article } from '@/lib/articles'
import { refreshArtistSongStats } from '@/lib/songStats'
import { listStandardSongsCandidates, syncStandardSongsArticles } from '@/lib/articleSync'

function revalidateArticles() {
  revalidatePath('/articles', 'layout')
  revalidatePath('/')
  revalidatePath('/admin/articles')
}

export type AdminArticleRow = Pick<Article, 'id' | 'number' | 'slug' | 'title' | 'category' | 'type' | 'status' | 'is_featured' | 'published_at' | 'updated_at'> & {
  artists: { name: string } | null
}

export type Candidate = { artistId: string; name: string; setlistCount: number }

export async function adminListArticles(): Promise<AdminArticleRow[]> {
  await requireAdmin()
  const { data, error } = await createAdminClient()
    .from('articles')
    .select('id, number, slug, title, category, type, status, is_featured, published_at, updated_at, artists(name)')
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AdminArticleRow[]
}

/** 定番曲記事の対象でまだ記事がないアーティスト */
export async function adminListStandardSongsCandidates(): Promise<Candidate[]> {
  await requireAdmin()
  const list = await listStandardSongsCandidates(createAdminClient())
  return list.filter(c => !c.hasArticle).map(c => ({ artistId: c.artistId, name: c.name, setlistCount: c.setlistCount }))
}

/** 対象アーティストの記事をまとめて作成・公開（毎日の自動実行と同じ処理） */
export async function adminSyncStandardSongsArticles(limit?: number): Promise<{ created: number; total: number }> {
  await requireAdmin()
  const result = await syncStandardSongsArticles(createAdminClient(), { limit })
  revalidateArticles()
  return result
}

export async function adminCreateStandardSongsArticle(artistId: string): Promise<string> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: artist, error } = await admin.from('artists').select('id, name').eq('id', artistId).single()
  if (error || !artist) throw new Error('アーティストが見つかりません')

  const slug = `standard-songs-${artist.id}`

  const d = defaultStandardSongsArticle(artist.name)
  const { data: created, error: insErr } = await admin.from('articles').insert({
    slug, category: 'standard-songs', type: 'data', artist_id: artist.id,
    title: d.title, description: d.description, status: 'draft',
  }).select('id').single()
  if (insErr) throw new Error(insErr.message)
  revalidatePath('/admin/articles')
  return created.id
}

export async function adminGetArticle(id: string): Promise<Article & { artists: { name: string } | null }> {
  await requireAdmin()
  const { data, error } = await createAdminClient().from('articles').select('*, artists(name)').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as unknown as Article & { artists: { name: string } | null }
}

/** 解説を書くための曲リスト（現在のランキング順） */
export async function adminGetRankingSongs(artistId: string): Promise<{ name: string; pct: number; count: number }[]> {
  await requireAdmin()
  const stats = await computeStandardSongs(createAdminClient(), artistId)
  return (stats?.ranking ?? []).map(s => ({ name: s.name, pct: s.pct, count: s.count }))
}

/** セトリ分析（定番曲ランキング）を今すぐ集計し直して保存する（通常は月1回の自動更新） */
export async function adminRefreshSongStats(artistId: string): Promise<void> {
  await requireAdmin()
  await refreshArtistSongStats(createAdminClient(), artistId)
  revalidatePath(`/artists/${artistId.slice(0, 8)}`)
  revalidateArticles()
}

export type ArticleUpdate = {
  title: string
  slug: string
  description: string | null
  lead: string | null
  body: string | null
  song_notes: Record<string, string>
  faq: { q: string; a: string }[]
  sources: { title: string; url: string }[]
  cover_image_url: string | null
  is_featured: boolean
  status: 'draft' | 'published'
}

export async function adminUpdateArticle(id: string, u: ArticleUpdate): Promise<void> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: before } = await admin.from('articles').select('slug, published_at').eq('id', id).single()

  const slug = u.slug.trim()
  if (!/^[^\s/?#]+$/.test(slug)) throw new Error('slug に空白・/・?・# は使えません')

  const songNotes = Object.fromEntries(Object.entries(u.song_notes).filter(([, v]) => v.trim()))
  const { error } = await admin.from('articles').update({
    title: u.title.trim(),
    slug,
    description: u.description?.trim() || null,
    lead: u.lead?.trim() || null,
    body: u.body?.trim() || null,
    song_notes: songNotes,
    faq: u.faq.filter(f => f.q.trim() && f.a.trim()),
    sources: u.sources.filter(s => s.url.trim()),
    cover_image_url: u.cover_image_url?.trim() || null,
    is_featured: u.is_featured,
    status: u.status,
    published_at: u.status === 'published' ? (before?.published_at ?? new Date().toISOString()) : before?.published_at ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message.includes('duplicate') ? 'その slug は既に使われています' : error.message)

  revalidatePath('/articles', 'layout')
  if (before?.slug && before.slug !== slug) revalidatePath(`/articles/${before.slug}`)
  revalidatePath('/admin/articles')
}

export async function adminDeleteArticle(id: string): Promise<void> {
  await requireAdmin()
  const { error } = await createAdminClient().from('articles').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/articles', 'layout')
  revalidatePath('/admin/articles')
}
