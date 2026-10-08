import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/supabase'

type Client = SupabaseClient<Database>

export type Article = Tables<'articles'>

// ─────────────────────────────────────────────
// カテゴリ
// ─────────────────────────────────────────────

export const ARTICLE_CATEGORIES = {
  'standard-songs': {
    label: '定番曲',
    title: 'ライブ定番曲ランキング',
    description: 'アーティストごとに、ライブでよく演奏される定番曲・オープニング曲・アンコール常連曲をセトリデータから集計したランキング記事。',
  },
} as const

export type ArticleCategory = keyof typeof ARTICLE_CATEGORIES

export function isArticleCategory(v: string): v is ArticleCategory {
  return v in ARTICLE_CATEGORIES
}

export function categoryLabel(category: string): string {
  return isArticleCategory(category) ? ARTICLE_CATEGORIES[category].label : '記事'
}

// ─────────────────────────────────────────────
// データ型記事の条件・初期値
// ─────────────────────────────────────────────

/** データ型の定番曲記事を自動作成する条件: セトリあり公演数とツアー・ライブ数（1〜2ツアーだけだとそのツアーのセトリになってしまう） */
export const STANDARD_SONGS_MIN_SETLISTS = 10
export const STANDARD_SONGS_MIN_UNITS = 3
export const STANDARD_SONGS_TOP_N = 20

/** 記事URL */
export function articlePath(a: { number: number }): string {
  return `/articles/${a.number}`
}

/** データ型記事のタイトルの【20XX年版】を今年に置き換える（毎年書き換えなくて済むように） */
export function displayTitle(a: { title: string; type: string }, year = new Date().getFullYear()): string {
  return a.type === 'data' ? a.title.replace(/【\d{4}年版】/, `【${year}年版】`) : a.title
}

export function defaultStandardSongsArticle(artistName: string, year = new Date().getFullYear()) {
  return {
    title: `${artistName}のライブ定番曲ランキングTOP${STANDARD_SONGS_TOP_N}｜セトリ頻出曲・アンコール常連【${year}年版】`,
    description: `${artistName}のライブで演奏される定番曲をセトリデータから集計。演奏率の高い曲、オープニング・本編ラスト・アンコールの常連曲、レア曲まで、ライブの予習に役立つ情報をまとめました。`,
  }
}

// ─────────────────────────────────────────────
// 定番曲ランキングの集計
// ─────────────────────────────────────────────

export type SongPosition = 'opening' | 'main-last' | 'encore' | 'finale'

export const POSITION_LABEL: Record<SongPosition, string> = {
  opening: 'オープニング常連',
  'main-last': '本編ラスト常連',
  encore: 'アンコール常連',
  finale: 'ラスト曲常連',
}

export type RankedSong = {
  rank: number
  key: string
  name: string
  songId: string | null
  /** 演奏されたツアー数（unit='tour'）または公演数（unit='concert'） */
  count: number
  pct: number
  /** 演奏された公演数（参考値） */
  concertCount: number
  position: SongPosition | null
  album: string | null
  year: number | null
  firstPlayed: string
  lastPlayed: string
  /** 最新のツアー（単発公演）で演奏されたか */
  inLatest: boolean
}

export type PositionSong = { name: string; songId: string | null; count: number }

export type StandardSongsData = {
  /** 集計単位。ツアーが3つ以上あればツアー単位（同じツアーの公演はほぼ同じセトリなので公演数だと1ツアーに偏る） */
  unit: 'tour' | 'concert'
  /** 集計したツアー数（unit='tour'）または公演数 */
  totalUnits: number
  totalWithData: number
  firstDate: string
  lastDate: string
  avgSongs: number
  uniqueSongs: number
  ranking: RankedSong[]
  openers: PositionSong[]
  mainClosers: PositionSong[]
  encoreRegulars: PositionSong[]
  finales: PositionSong[]
  rareSongs: (PositionSong & { lastPlayed: string })[]
  /** 全曲（アーティストページの「セトリ分析」用）。count は unit 単位（ツアー数 or 公演数） */
  allSongs: { name: string; songId: string | null; count: number; concertCount: number; pct: number; isEncore: boolean }[]
  /** 最新のツアー名（ツアー外なら null） */
  latestTourName: string | null
  latestSetlist: {
    concertId: string
    date: string
    venueName: string
    tourName: string | null
    songs: { name: string; songId: string | null; isEncore: boolean }[]
  } | null
}

type SubmissionRow = {
  concert_id: string
  votes_count: number | null
  concerts: { id: string; date: string; venue_name: string; tour_id: string | null; festival_event_id: string | null; tours: { name: string } | null }
  setlist_songs: { song_id: string | null; song_name: string; song_type: string; is_encore: boolean | null; order_num: number | null }[]
}

/**
 * アーティストの過去公演のセトリ（公演ごとに投票数最多の1件）を取得。
 * setlist_submissions → concerts の inner join で絞ると重くタイムアウトするため、
 * 先に公演一覧を取り、公演IDで分割してセトリを取る。
 */
/** ID を size 件ずつに分けて取得する（同時に走らせるのは4件まで。並列にしすぎると DB が詰まる） */
async function inChunks<T>(ids: string[], size: number, fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  const out: T[] = []
  for (let i = 0; i < chunks.length; i += 4) {
    for (const r of await Promise.all(chunks.slice(i, i + 4).map(fn))) out.push(...r)
  }
  return out
}

async function fetchSetlists(supabase: Client, artistId: string): Promise<SubmissionRow[]> {
  const today = new Date().toISOString().split('T')[0]
  const concerts: SubmissionRow['concerts'][] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('concerts')
      .select('id, date, venue_name, tour_id, festival_event_id, tours(name)')
      .eq('artist_id', artistId)
      .lt('date', today)
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    concerts.push(...((data ?? []) as unknown as SubmissionRow['concerts'][]))
    if (!data || data.length < 1000) break
  }
  if (concerts.length === 0) return []
  const concertById = new Map(concerts.map(c => [c.id, c]))

  // セトリ（submission）と曲は別々に取る。setlist_songs を埋め込む取得は件数が多いアーティストで数秒かかり、
  // 公開用（anon）の statement timeout を超えてページごと表示できなくなるため（2026-10 一括取り込み後の Mr.Children 等）
  const ids = concerts.map(c => c.id)
  const subs = (await inChunks(ids, 100, async chunk => {
    const { data, error } = await supabase
      .from('setlist_submissions')
      .select('id, concert_id, votes_count')
      .in('concert_id', chunk)
    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; concert_id: string; votes_count: number | null }[]
  })).sort((a, b) => (b.votes_count ?? 0) - (a.votes_count ?? 0))

  const songsBySub = new Map<string, SubmissionRow['setlist_songs']>()
  const songRows = await inChunks(subs.map(s => s.id), 30, async chunk => {
    const rows: (SubmissionRow['setlist_songs'][number] & { submission_id: string })[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('setlist_songs')
        .select('submission_id, song_id, song_name, song_type, is_encore, order_num')
        .in('submission_id', chunk)
        // id だけで並べると主キーの索引を全件なめる実行計画になり遅い（タイムアウトの原因）
        .order('submission_id').order('order_num').order('id')
        .range(from, from + 999)
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as typeof rows))
      if (!data || data.length < 1000) break
    }
    return rows
  })
  for (const { submission_id, ...song } of songRows) {
    const list = songsBySub.get(submission_id)
    if (list) list.push(song)
    else songsBySub.set(submission_id, [song])
  }

  // 公演ごとに投票数最多のセトリを1件
  const top = new Map<string, SubmissionRow>()
  for (const sub of subs) {
    const songs = songsBySub.get(sub.id) ?? []
    if (top.has(sub.concert_id) || !songs.some(s => s.song_type === 'song')) continue
    top.set(sub.concert_id, { concert_id: sub.concert_id, votes_count: sub.votes_count, setlist_songs: songs, concerts: concertById.get(sub.concert_id)! })
  }
  return [...top.values()]
}

/** 末尾の演奏形態の注記（弾き語り・Acoustic ver. 等）。曲としては同じものとして数える */
const PERFORMANCE_NOTE_RE = /\s*[(（\[［][^)）\]］]*(ver|version|弾き語り|acoustic|アコースティック|short|ショート|full|フル|remix|medley|メドレー|band|バンド|piano|ピアノ|edit)[^)）\]］]*[)）\]］]\s*$/i

/**
 * 曲名の表記ゆれをまとめるキー。song_id は公演によって紐付いていたりいなかったりするため使わない。
 * 全角半角・大小文字・空白・波ダッシュ類の違いを同一視する。
 */
/** 「-Japanese Ver.-」「〜Acoustic ver.〜」のように記号で挟んだ注記 */
const DASHED_NOTE_RE = /\s*[-~〜～][^-~〜～]*\b(ver|version)\b\.?[^-~〜～]*[-~〜～]?\s*$/i

function stripNotes(name: string): string {
  return name.normalize('NFKC').replace(PERFORMANCE_NOTE_RE, '').replace(DASHED_NOTE_RE, '')
}

/** 曲名に「（弾き語り）」「-Japanese Ver.-」などの演奏形態の注記が付いているか（表示名は注記なしを優先するため） */
export function hasPerformanceNote(name: string): boolean {
  return stripNotes(name) !== name.normalize('NFKC')
}

export function songNameKey(name: string): string {
  return stripNotes(name)
    .toLowerCase()
    .replace(/[〜～~−–—-]/g, '-')
    .replace(/[\s　・'’"“”]/g, '')
}

export async function computeStandardSongs(supabase: Client, artistId: string): Promise<StandardSongsData | null> {
  const setlists = await fetchSetlists(supabase, artistId)
  if (setlists.length === 0) return null

  // 集計単位（グループ）: ツアー > フェス > 単発公演
  const groupOf = (c: SubmissionRow['concerts']) =>
    c.tour_id ? `t:${c.tour_id}` : c.festival_event_id ? `f:${c.festival_event_id}` : `c:${c.id}`
  const tourGroups = new Set(setlists.map(s => s.concerts.tour_id).filter(Boolean))
  const unit: 'tour' | 'concert' = tourGroups.size >= 3 ? 'tour' : 'concert'
  const unitKey = (c: SubmissionRow['concerts']) => (unit === 'tour' ? groupOf(c) : c.id)
  const totalUnits = new Set(setlists.map(s => unitKey(s.concerts))).size

  type Acc = {
    names: Map<string, number>
    songIds: Map<string, number>
    concerts: Set<string>
    units: Set<string>
    firstPlayed: string
    lastPlayed: string
    pos: Record<SongPosition, Set<string>>
  }
  const songs = new Map<string, Acc>()
  let totalSongs = 0
  const dates = setlists.map(s => s.concerts.date).sort()

  for (const sub of setlists) {
    const tracks = sub.setlist_songs
      .filter(s => s.song_type === 'song')
      .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
    totalSongs += tracks.length
    const mainTracks = tracks.filter(t => !t.is_encore)
    const opening = tracks[0]
    const mainLast = mainTracks[mainTracks.length - 1]
    const finale = tracks[tracks.length - 1]
    const u = unitKey(sub.concerts)

    for (const t of tracks) {
      const name = t.song_name.trim()
      const key = songNameKey(name)
      if (!key) continue
      let acc = songs.get(key)
      if (!acc) {
        acc = {
          names: new Map(), songIds: new Map(), concerts: new Set(), units: new Set(), firstPlayed: '9999', lastPlayed: '',
          pos: { opening: new Set(), 'main-last': new Set(), encore: new Set(), finale: new Set() },
        }
        songs.set(key, acc)
      }
      acc.names.set(name, (acc.names.get(name) ?? 0) + 1)
      if (t.song_id) acc.songIds.set(t.song_id, (acc.songIds.get(t.song_id) ?? 0) + 1)
      // 同じ公演で2回演奏しても1公演、同じツアーで何公演演奏しても1ツアーとして数える
      acc.concerts.add(sub.concert_id)
      acc.units.add(u)
      if (sub.concerts.date > acc.lastPlayed) acc.lastPlayed = sub.concerts.date
      if (sub.concerts.date < acc.firstPlayed) acc.firstPlayed = sub.concerts.date
      if (t === opening) acc.pos.opening.add(u)
      if (t === mainLast && mainLast !== finale) acc.pos['main-last'].add(u)
      if (t.is_encore) acc.pos.encore.add(u)
      if (t === finale) acc.pos.finale.add(u)
    }
  }

  const total = setlists.length
  const latest = [...setlists].sort((a, b) => b.concerts.date.localeCompare(a.concerts.date))[0]
  const latestUnit = unitKey(latest.concerts)
  const all = [...songs.entries()].map(([key, a]) => ({
    key,
    name: [...a.names.entries()]
      .sort((x, y) => Number(stripNotes(x[0]) !== x[0].normalize('NFKC')) - Number(stripNotes(y[0]) !== y[0].normalize('NFKC')) || y[1] - x[1])[0][0],
    // 表示名・曲ページのリンク先は一番多く使われているものを採用
    songId: [...a.songIds.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
    count: a.units.size,
    concertCount: a.concerts.size,
    pct: Math.round((a.units.size / totalUnits) * 100),
    firstPlayed: a.firstPlayed,
    lastPlayed: a.lastPlayed,
    inLatest: a.units.has(latestUnit),
    pos: Object.fromEntries(Object.entries(a.pos).map(([k, v]) => [k, v.size])) as Record<SongPosition, number>,
  })).sort((a, b) =>
    b.count - a.count || b.concertCount - a.concertCount || b.lastPlayed.localeCompare(a.lastPlayed) || a.name.localeCompare(b.name))

  // 定位置: 演奏されたツアー（公演）の4割以上でその位置なら「◯◯常連」
  const positionOf = (s: (typeof all)[number]): SongPosition | null => {
    const order: SongPosition[] = ['opening', 'finale', 'main-last', 'encore']
    for (const p of order) if (s.count >= 2 && s.pos[p] / s.count >= 0.4) return p
    return null
  }

  // 曲情報（アルバム・リリース年）
  const top = all.slice(0, STANDARD_SONGS_TOP_N)
  const songIds = top.map(s => s.songId).filter((v): v is string => !!v)
  const meta = new Map<string, { album_name: string | null; release_year: number | null }>()
  if (songIds.length > 0) {
    const { data } = await supabase.from('songs').select('id, album_name, release_year').in('id', songIds)
    for (const m of data ?? []) meta.set(m.id, m)
  }

  // 同順位は同じ番号にする（ツアー数・公演数とも同じなら同順位）
  let prev = ''
  let prevRank = 0
  const ranking: RankedSong[] = top.map((s, i) => {
    const sig = `${s.count}/${s.concertCount}`
    const rank = sig === prev ? prevRank : i + 1
    prev = sig
    prevRank = rank
    const m = s.songId ? meta.get(s.songId) : undefined
    return {
      rank, key: s.key, name: s.name, songId: s.songId, count: s.count, pct: s.pct, concertCount: s.concertCount,
      position: positionOf(s), album: m?.album_name ?? null, year: m?.release_year ?? null,
      firstPlayed: s.firstPlayed, lastPlayed: s.lastPlayed, inLatest: s.inLatest,
    }
  })

  // 定位置は2ツアー（2公演）以上でその位置になった曲だけ。1回だけでは「定位置」と言えないため
  const topBy = (p: SongPosition, n = 3): PositionSong[] =>
    all.filter(s => s.pos[p] >= 2)
      .sort((a, b) => b.pos[p] - a.pos[p] || b.count - a.count)
      .slice(0, n)
      .map(s => ({ name: s.name, songId: s.songId, count: s.pos[p] }))

  const rareSongs = total >= 5
    ? all.filter(s => s.concertCount === 1).sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed)).slice(0, 10)
        .map(s => ({ name: s.name, songId: s.songId, count: 1, lastPlayed: s.lastPlayed }))
    : []

  const latestSetlist = latest ? {
    concertId: latest.concerts.id,
    date: latest.concerts.date,
    venueName: latest.concerts.venue_name,
    tourName: latest.concerts.tours?.name ?? null,
    songs: latest.setlist_songs
      .filter(s => s.song_type === 'song')
      .sort((a, b) => (a.order_num ?? 0) - (b.order_num ?? 0))
      .map(s => ({ name: s.song_name.trim(), songId: s.song_id, isEncore: !!s.is_encore })),
  } : null

  return {
    unit,
    totalUnits,
    totalWithData: total,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    avgSongs: Math.round((totalSongs / total) * 10) / 10,
    uniqueSongs: all.length,
    ranking,
    openers: topBy('opening'),
    mainClosers: topBy('main-last'),
    encoreRegulars: topBy('encore'),
    finales: topBy('finale'),
    rareSongs,
    allSongs: all.map(s => ({
      name: s.name, songId: s.songId, count: s.count, concertCount: s.concertCount, pct: s.pct,
      isEncore: s.pos.encore / Math.max(1, s.count) >= 0.5,
    })),
    latestTourName: latest.concerts.tour_id ? latest.concerts.tours?.name ?? null : null,
    latestSetlist,
  }
}

// ─────────────────────────────────────────────
// 記事の取得（テーブル未作成・エラー時は空を返して既存ページを壊さない）
// ─────────────────────────────────────────────

export type ArticleSummary = Pick<Article, 'id' | 'number' | 'type' | 'slug' | 'title' | 'description' | 'category' | 'cover_image_url' | 'published_at' | 'updated_at' | 'is_featured' | 'artist_id'> & {
  artists: { id: string; name: string; image_url: string | null; image_crop_x: number | null; image_crop_y: number | null } | null
}

export const SUMMARY_SELECT = 'id, number, type, slug, title, description, category, cover_image_url, published_at, updated_at, is_featured, artist_id, artists(id, name, image_url, image_crop_x, image_crop_y)'

export async function listPublishedArticles(
  supabase: Client,
  opts: { category?: string; limit?: number; offset?: number; excludeId?: string } = {},
): Promise<{ articles: ArticleSummary[]; total: number }> {
  let q = supabase.from('articles').select(SUMMARY_SELECT, { count: 'exact' }).eq('status', 'published')
  if (opts.category) q = q.eq('category', opts.category)
  if (opts.excludeId) q = q.neq('id', opts.excludeId)
  const limit = opts.limit ?? 24
  const offset = opts.offset ?? 0
  const { data, count, error } = await q.order('published_at', { ascending: false }).range(offset, offset + limit - 1)
  if (error) return { articles: [], total: 0 }
  return { articles: (data ?? []) as unknown as ArticleSummary[], total: count ?? 0 }
}

/** アーティストの公開済み記事（既存ページからの導線用） */
export async function getArtistArticle(
  supabase: Client,
  artistId: string | null | undefined,
  category: ArticleCategory = 'standard-songs',
): Promise<Pick<Article, 'number' | 'title' | 'type'> | null> {
  if (!artistId) return null
  const { data, error } = await supabase
    .from('articles')
    .select('number, title, type')
    .eq('status', 'published')
    .eq('category', category)
    .eq('artist_id', artistId)
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return null
  return data
}

export function articleImage(a: Pick<ArticleSummary, 'cover_image_url' | 'artists'>): { src: string | null; position?: string } {
  if (a.cover_image_url) return { src: a.cover_image_url }
  if (a.artists?.image_url) {
    return { src: a.artists.image_url, position: `${a.artists.image_crop_x ?? 50}% ${a.artists.image_crop_y ?? 50}%` }
  }
  return { src: null }
}

export function formatJaDate(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' })
}
