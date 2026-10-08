import Link from 'next/link'
import { cache } from 'react'
import type { Metadata } from 'next'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Calendar, ChevronRight, MapPin, Mic2, Music, PenLine } from 'lucide-react'
import type { Database } from '@/types/supabase'
import FollowButton from '@/components/features/artist/FollowButton'
import ArticleCard from '@/components/features/article/ArticleCard'
import { siteUrl } from '@/lib/site'
import { safeJsonLd } from '@/lib/json-ld'
import {
  ARTICLE_CATEGORIES, POSITION_LABEL, articlePath, categoryLabel, displayTitle, formatJaDate,
  isArticleCategory, listPublishedArticles, type Article, type PositionSong, type StandardSongsData,
} from '@/lib/articles'
import { getStandardSongs } from '@/lib/songStats'
import { autoDescription, autoLead, autoSongNote, autoSummary } from '@/lib/articleText'

/**
 * 記事ページの本体。公開ページ（/articles/[番号]、ISRキャッシュ）と
 * 管理画面の下書きプレビュー（/admin/articles/[id]/preview）で共用する。
 */

type Client = SupabaseClient<Database>

export type ArticleWithArtist = Article & {
  artists: { id: string; name: string; image_url: string | null; image_crop_x: number | null; image_crop_y: number | null } | null
}

export const ARTICLE_SELECT = '*, artists(id, name, image_url, image_crop_x, image_crop_y)'

/** 保存済みの集計結果（generateMetadata と本体で1回だけ読む） */
const getStats = cache(async (artistId: string, supabase: Client) => getStandardSongs(supabase, artistId))

async function statsFor(a: ArticleWithArtist, supabase: Client): Promise<StandardSongsData | null> {
  return a.category === 'standard-songs' && a.artist_id ? getStats(a.artist_id, supabase) : null
}

export async function buildArticleMetadata(a: ArticleWithArtist, supabase: Client, preview: boolean): Promise<Metadata> {
  const stats = await statsFor(a, supabase)
  const title = displayTitle(a)
  // データ型は説明文も上位曲入りで自動生成（検索結果で上位曲が見えるとクリックされやすい）
  const description = (a.type === 'data' && stats && a.artists ? autoDescription(a.artists.name, stats) : a.description) ?? undefined
  const url = `${siteUrl}${articlePath(a)}`
  const image = a.cover_image_url ?? a.artists?.image_url ?? undefined
  return {
    title: `${title} | LiveVault`,
    description,
    alternates: { canonical: url },
    robots: preview ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      publishedTime: a.published_at ?? undefined,
      modifiedTime: a.updated_at,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

/** 空行区切りで段落にする（プレーンテキスト本文用） */
function Paragraphs({ text }: { text: string | null }) {
  if (!text?.trim()) return null
  return (
    <div className="space-y-4">
      {text.trim().split(/\n{2,}/).map((p, i) => (
        <p key={i} className="text-[15px] text-[#d0d0dc] leading-[1.9] whitespace-pre-line break-words">{p}</p>
      ))}
    </div>
  )
}

function SongLink({ name, songId, className = '' }: { name: string; songId: string | null; className?: string }) {
  return songId ? (
    <Link href={`/songs/${songId.slice(0, 8)}`} className={`hover:underline underline-offset-2 break-words ${className}`}>{name}</Link>
  ) : (
    <span className={`break-words ${className}`}>{name}</span>
  )
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-lg sm:text-xl font-black text-white border-l-4 border-white pl-3 leading-snug">
      {children}
    </h2>
  )
}

/** 'tour' → 「ツアー」、'concert' → 「公演」 */
function unitLabel(stats: StandardSongsData) {
  return stats.unit === 'tour' ? 'ツアー' : '公演'
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
}

export default async function ArticleView({ article: a, preview, supabase }: {
  article: ArticleWithArtist
  preview: boolean
  supabase: Client
}) {
  const artist = a.artists
  const title = displayTitle(a)

  const today = new Date().toISOString().split('T')[0]

  const [stats, { data: upcoming }, related] = await Promise.all([
    statsFor(a, supabase),
    a.artist_id
      ? supabase.from('concerts').select('id, date, venue_name, tours(name)').eq('artist_id', a.artist_id).gte('date', today).order('date').limit(5)
      : Promise.resolve({ data: [] as { id: string; date: string; venue_name: string; tours: { name: string } | null }[] }),
    listPublishedArticles(supabase, { category: a.category, limit: 4, excludeId: a.id }),
  ])

  // 手書きがあればそれを優先、なければデータから自動生成
  const manualNotes = (a.song_notes ?? {}) as Record<string, string>
  const songNotes: Record<string, string> = {}
  for (const s of stats?.ranking ?? []) {
    songNotes[s.name] = manualNotes[s.name]?.trim() || (artist ? autoSongNote(artist.name, stats!, s) : '')
  }
  const lead = a.lead?.trim() || (stats && artist ? autoLead(artist.name, stats) : null)
  const body = a.body?.trim() || (stats && artist ? autoSummary(artist.name, stats) : null)
  const extraFaq = (Array.isArray(a.faq) ? a.faq : []) as { q: string; a: string }[]
  const sources = (Array.isArray(a.sources) ? a.sources : []) as { title: string; url: string }[]
  const name = artist?.name ?? ''

  // ── FAQ（データから自動生成 + 手動追加分）
  const faq: { q: string; a: string }[] = []
  if (stats && stats.ranking[0]) {
    const s = stats.ranking[0]
    faq.push({
      q: `${name}のライブで一番よく演奏される曲は？`,
      a: stats.unit === 'tour'
        ? `「${s.name}」です。LiveVaultに登録された${stats.totalUnits}ツアー・ライブのうち${s.count}で演奏されています（公演数では${stats.totalWithData}公演中${s.concertCount}公演）。`
        : `「${s.name}」です。LiveVaultに登録された${stats.totalWithData}公演のうち${s.count}公演（${s.pct}%）で演奏されています。`,
    })
  }
  if (stats) {
    faq.push({ q: `${name}のライブは何曲くらい演奏される？`, a: `LiveVaultに登録されたセトリ${stats.totalWithData}公演の平均は${stats.avgSongs}曲です（アンコールを含む）。` })
  }
  if (stats && stats.openers[0]) {
    faq.push({ q: `${name}のライブのオープニング曲で多いのは？`, a: `「${stats.openers[0].name}」が${stats.openers[0].count}${unitLabel(stats)}で1曲目に演奏されています。` })
  }
  if (stats && stats.encoreRegulars[0]) {
    faq.push({ q: `${name}のアンコールの定番曲は？`, a: `「${stats.encoreRegulars[0].name}」が${stats.encoreRegulars[0].count}${unitLabel(stats)}のアンコールで演奏されています。` })
  }
  faq.push(...extraFaq.filter(f => f.q && f.a))

  // ── 構造化データ
  const url = `${siteUrl}${articlePath(a)}`
  const image = a.cover_image_url ?? artist?.image_url ?? undefined
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: a.description ?? undefined,
    image: image ? [image] : undefined,
    datePublished: a.published_at ?? a.created_at,
    dateModified: a.updated_at,
    author: { '@type': 'Organization', name: 'LiveVault編集部', url: siteUrl },
    publisher: { '@type': 'Organization', name: 'LiveVault', url: siteUrl },
    mainEntityOfPage: url,
    ...(artist ? { about: { '@type': 'MusicGroup', name: artist.name, url: `${siteUrl}/artists/${artist.id.slice(0, 8)}` } } : {}),
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: '記事', item: `${siteUrl}/articles` },
      { '@type': 'ListItem', position: 3, name: categoryLabel(a.category), item: `${siteUrl}/articles/category/${a.category}` },
      { '@type': 'ListItem', position: 4, name: title },
    ],
  }
  const faqLd = faq.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  } : null

  const toc = [
    stats && { id: 'ranking', label: `定番曲ランキングTOP${stats.ranking.length}` },
    stats && { id: 'positions', label: 'セトリでの「定位置」' },
    stats && stats.rareSongs.length > 0 && { id: 'rare', label: 'レア曲' },
    stats?.latestSetlist && { id: 'latest', label: '最新のセトリ' },
    (upcoming ?? []).length > 0 && { id: 'upcoming', label: '今後の公演' },
    body && { id: 'body', label: 'まとめ' },
    faq.length > 0 && { id: 'faq', label: 'よくある質問' },
    { id: 'about', label: 'データについて' },
  ].filter(Boolean) as { id: string; label: string }[]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqLd) }} />}

      {preview && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          下書きプレビュー（管理者にのみ表示・検索エンジンには出ません）
        </div>
      )}

      {/* パンくず */}
      <nav className="text-xs text-[#8888aa] flex items-center gap-1 min-w-0 overflow-hidden">
        <Link href="/" className="hover:text-white transition-colors shrink-0">ホーム</Link>
        <span className="shrink-0">/</span>
        <Link href="/articles" className="hover:text-white transition-colors shrink-0">記事</Link>
        <span className="shrink-0">/</span>
        <Link href={`/articles/category/${a.category}`} className="hover:text-white transition-colors shrink-0">{categoryLabel(a.category)}</Link>
        {artist && (
          <>
            <span className="shrink-0">/</span>
            <span className="text-white min-w-0 truncate">{artist.name}</span>
          </>
        )}
      </nav>

      {/* タイトル */}
      <header className="space-y-3">
        <span className="inline-block text-[10px] font-bold text-white bg-white/10 px-2 py-0.5 rounded-full">
          {categoryLabel(a.category)}
        </span>
        <h1 className="text-xl sm:text-2xl font-black text-white leading-snug break-words">{title}</h1>
        <p className="text-xs text-[#8888aa]">
          {a.published_at && <>公開 {formatJaDate(a.published_at)}・</>}更新 {formatJaDate(a.updated_at)}・LiveVault編集部
        </p>
        {stats && (
          <p className="text-xs text-[#8888aa] leading-relaxed">
            集計対象：LiveVaultに登録された{name}のセトリ<span className="text-white font-bold">{stats.totalWithData}公演</span>
            {stats.unit === 'tour' && <>（{stats.totalUnits}ツアー・ライブ）</>}
            ・{shortDate(stats.firstDate)}〜{shortDate(stats.lastDate)}
          </p>
        )}
      </header>

      {/* アーティストカード */}
      {artist && (
        <div className="glass rounded-2xl p-4 flex items-center gap-3 min-w-0">
          <Link href={`/artists/${artist.id.slice(0, 8)}`} className="shrink-0">
            {artist.image_url ? (
              <img src={artist.image_url} alt={artist.name} className="w-14 h-14 rounded-full object-cover"
                style={{ objectPosition: `${artist.image_crop_x ?? 50}% ${artist.image_crop_y ?? 50}%` }} />
            ) : (
              <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center"><Mic2 size={20} className="text-white/40" /></div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/artists/${artist.id.slice(0, 8)}`} className="font-bold text-white hover:text-[#b3b3b3] transition-colors block truncate">
              {artist.name}
            </Link>
            <Link href={`/artists/${artist.id.slice(0, 8)}`} className="text-xs text-[#8888aa] hover:text-white transition-colors block truncate">
              ライブ情報を見る
            </Link>
          </div>
          <div className="shrink-0">
            <FollowButton artistId={artist.id} />
          </div>
        </div>
      )}

      <Paragraphs text={lead} />

      {/* 結論ボックス */}
      {stats && stats.ranking.length >= 3 && (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 space-y-2">
          <p className="text-xs font-bold text-[#8888aa]">まずはこの3曲を押さえよう</p>
          <ol className="space-y-1.5">
            {stats.ranking.slice(0, 3).map((s, i) => (
              <li key={s.key} className="flex items-baseline gap-2 min-w-0">
                <span className="text-sm font-black text-white shrink-0">{i + 1}.</span>
                <SongLink name={s.name} songId={s.songId} className="text-sm font-bold text-white min-w-0" />
                <span className="text-xs text-[#8888aa] shrink-0">{s.count}/{stats.totalUnits}{unitLabel(stats)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 目次 */}
      {toc.length > 2 && (
        <nav className="glass rounded-2xl p-4 space-y-2" aria-label="目次">
          <p className="text-xs font-bold text-[#8888aa]">目次</p>
          <ol className="space-y-1.5">
            {toc.map((t, i) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="text-sm text-white hover:text-[#b3b3b3] transition-colors">
                  {i + 1}. {t.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {!stats && a.category === 'standard-songs' && (
        <div className="glass rounded-2xl p-8 text-center text-sm text-[#8888aa]">セトリデータがまだありません</div>
      )}

      {stats && <RankingSection stats={stats} songNotes={songNotes} />}
      {stats && <PositionsSection stats={stats} />}

      {/* レア曲 */}
      {stats && stats.rareSongs.length > 0 && (
        <section className="space-y-4">
          <SectionTitle id="rare">レア曲（1公演だけで演奏された曲）</SectionTitle>
          <p className="text-sm text-[#8888aa] leading-relaxed">集計した{stats.totalWithData}公演のうち、1回だけ演奏された曲です。新しい順に最大10曲。</p>
          <ul className="glass rounded-2xl divide-y divide-white/5">
            {stats.rareSongs.map(s => (
              <li key={s.name} className="flex items-center gap-3 px-4 py-3 min-w-0">
                <Music size={14} className="text-[#8888aa] shrink-0" />
                <SongLink name={s.name} songId={s.songId} className="text-sm text-white min-w-0 flex-1" />
                <span className="text-xs text-[#8888aa] shrink-0">{shortDate(s.lastPlayed)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 最新のセトリ */}
      {stats?.latestSetlist && (
        <section className="space-y-4">
          <SectionTitle id="latest">最新のセトリ</SectionTitle>
          <Link href={`/concerts/${stats.latestSetlist.concertId.slice(0, 8)}`}
            className="glass rounded-2xl p-4 block hover:border-white/20 transition-all space-y-1 min-w-0">
            {stats.latestSetlist.tourName && <p className="text-sm font-bold text-white break-words">{stats.latestSetlist.tourName}</p>}
            <p className="text-xs text-[#8888aa] flex items-center gap-1.5 flex-wrap">
              <Calendar size={12} className="shrink-0" />{formatJaDate(stats.latestSetlist.date)}
              <MapPin size={12} className="shrink-0 ml-1" /><span className="break-words">{stats.latestSetlist.venueName}</span>
            </p>
          </Link>
          <ol className="glass rounded-2xl divide-y divide-white/5">
            {stats.latestSetlist.songs.map((s, i) => {
              const firstEncore = s.isEncore && !stats.latestSetlist!.songs[i - 1]?.isEncore
              return (
                <li key={`${i}-${s.name}`}>
                  {firstEncore && <p className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-widest text-[#8888aa]">ENCORE</p>}
                  <div className="flex items-center gap-3 px-4 py-2.5 min-w-0">
                    <span className="w-6 text-right text-xs text-[#8888aa] shrink-0">{i + 1}</span>
                    <SongLink name={s.name} songId={s.songId} className="text-sm text-white min-w-0" />
                  </div>
                </li>
              )
            })}
          </ol>
          <Link href={`/concerts/${stats.latestSetlist.concertId.slice(0, 8)}`}
            className="flex items-center justify-end gap-1 text-xs text-[#8888aa] hover:text-white transition-colors">
            この公演の詳細・掲示板を見る <ChevronRight size={14} />
          </Link>
        </section>
      )}

      {/* 今後の公演 */}
      {(upcoming ?? []).length > 0 && (
        <section className="space-y-4">
          <SectionTitle id="upcoming">今後の公演</SectionTitle>
          <p className="text-sm text-[#8888aa]">参戦予定の公演は「参戦登録」しておくと、当日のセトリをすぐチェックできます。</p>
          <div className="space-y-2">
            {(upcoming as { id: string; date: string; venue_name: string; tours: { name: string } | null }[]).map(c => (
              <Link key={c.id} href={`/concerts/${c.id.slice(0, 8)}`}
                className="glass rounded-xl px-4 py-3 flex items-center gap-3 hover:border-white/20 transition-all min-w-0">
                <div className="text-center shrink-0 w-12">
                  <p className="text-[10px] text-[#8888aa]">{new Date(c.date).getMonth() + 1}月</p>
                  <p className="text-lg font-black text-white leading-none">{new Date(c.date).getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{c.venue_name}</p>
                  {c.tours?.name && <p className="text-xs text-[#8888aa] truncate">{c.tours.name}</p>}
                </div>
                <ChevronRight size={16} className="text-[#8888aa] shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 本文（まとめ等） */}
      {body && (
        <section className="space-y-4">
          <SectionTitle id="body">まとめ</SectionTitle>
          <Paragraphs text={body} />
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section className="space-y-4">
          <SectionTitle id="faq">よくある質問</SectionTitle>
          <div className="space-y-3">
            {faq.map((f, i) => (
              <div key={i} className="glass rounded-2xl p-4 space-y-2">
                <p className="text-sm font-bold text-white break-words">Q. {f.q}</p>
                <p className="text-sm text-[#d0d0dc] leading-relaxed break-words">A. {f.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* データについて */}
      <section className="space-y-3">
        <SectionTitle id="about">データについて</SectionTitle>
        <p className="text-sm text-[#8888aa] leading-relaxed">
          {stats
            ? `この記事のランキングは、LiveVaultに投稿・登録された${name}のセットリスト${stats.totalWithData}公演分（${shortDate(stats.firstDate)}〜${shortDate(stats.lastDate)}）をもとに自動で集計しています。各公演で最も支持を集めたセトリを1件ずつ使っています。${
                stats.unit === 'tour'
                  ? `同じツアーの公演はセトリがほぼ同じで、公演数の多いツアーに結果が偏るため、「いくつのツアーで演奏されたか」で順位をつけています（ツアー外の単発ライブ・フェスはそれぞれ1つとして数えます）。`
                  : ''
              }新しいセトリが登録されると自動的に更新されます。`
            : 'この記事はLiveVault編集部が作成しています。'}
        </p>
        {sources.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#8888aa]">参考</p>
            <ul className="space-y-1">
              {sources.map((s, i) => (
                <li key={i} className="text-xs break-all">
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[#b3b3b3] hover:text-white underline underline-offset-2">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* セトリ投稿CTA */}
      {artist && (
        <Link href={`/artists/${artist.id.slice(0, 8)}`}
          className="rounded-2xl border border-white/15 p-5 flex items-center gap-4 hover:border-white/30 transition-all min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
            <PenLine size={18} className="text-black" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">参戦した公演のセトリを投稿しよう</p>
            <p className="text-xs text-[#8888aa] leading-relaxed">投稿されたセトリはこのランキングにも反映されます</p>
          </div>
          <ChevronRight size={16} className="text-[#8888aa] shrink-0" />
        </Link>
      )}

      {/* 関連記事 */}
      {related.articles.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white">
              {isArticleCategory(a.category) ? `ほかの${ARTICLE_CATEGORIES[a.category].title}` : '関連記事'}
            </h2>
            <Link href={`/articles/category/${a.category}`} className="text-xs text-[#8888aa] hover:text-white transition-colors shrink-0">
              すべて見る
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {related.articles.map(r => <ArticleCard key={r.id} article={r} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function RankingSection({ stats, songNotes }: { stats: StandardSongsData; songNotes: Record<string, string> }) {
  return (
    <section className="space-y-4">
      <SectionTitle id="ranking">定番曲ランキングTOP{stats.ranking.length}</SectionTitle>
      <p className="text-sm text-[#8888aa] leading-relaxed">
        {stats.unit === 'tour'
          ? `集計した${stats.totalUnits}のツアー・ライブのうち、何ツアーで演奏されたかの順です。いろいろなツアーで演奏され続けている曲ほど上位になります。`
          : `集計した${stats.totalWithData}公演のうち、何公演で演奏されたかの順です。`}
      </p>
      <ol className="space-y-3">
        {stats.ranking.map(s => {
          const note = songNotes[s.name]?.trim()
          return (
            <li key={s.key} className="glass rounded-2xl p-4 space-y-2.5 min-w-0">
              <div className="flex items-start gap-3 min-w-0">
                <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                  s.rank <= 3 ? 'bg-white text-black' : 'bg-white/10 text-white'
                }`}>
                  {s.rank}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="text-base font-bold text-white leading-snug">
                    <SongLink name={s.name} songId={s.songId} />
                  </h3>
                  {(s.album || s.year) && (
                    <p className="text-xs text-[#8888aa] break-words">
                      {s.album}{s.album && s.year ? '・' : ''}{s.year ? `${s.year}年` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <span className="text-white font-bold">
                    {s.count}/{stats.totalUnits}{unitLabel(stats)}で演奏
                    {stats.unit === 'tour' && (
                      <span className="text-[#8888aa] font-normal">（{s.concertCount}公演）</span>
                    )}
                  </span>
                  {s.position && (
                    <span className="text-[10px] font-bold text-[#b3b3b3] border border-white/15 rounded-full px-2 py-0.5">
                      {POSITION_LABEL[s.position]}
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-white/70 rounded-full" style={{ width: `${Math.max(s.pct, 2)}%` }} />
                </div>
              </div>
              {note && <p className="text-sm text-[#d0d0dc] leading-relaxed whitespace-pre-line break-words">{note}</p>}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function PositionsSection({ stats }: { stats: StandardSongsData }) {
  const u = unitLabel(stats)
  const groups: { label: string; desc: string; songs: PositionSong[] }[] = [
    { label: 'オープニング（1曲目）', desc: `1曲目に演奏された${u}数`, songs: stats.openers },
    { label: '本編ラスト', desc: `アンコール前の最後の曲になった${u}数`, songs: stats.mainClosers },
    { label: 'アンコール', desc: `アンコールで演奏された${u}数`, songs: stats.encoreRegulars },
    { label: 'ライブのラスト曲', desc: `その日の最後の曲になった${u}数`, songs: stats.finales },
  ]
  if (groups.every(g => g.songs.length === 0)) return null

  return (
    <section className="space-y-4">
      <SectionTitle id="positions">セトリでの「定位置」</SectionTitle>
      <p className="text-sm text-[#8888aa] leading-relaxed">ライブのどこで演奏されることが多いかを、位置ごとに集計しました{stats.unit === 'tour' ? '（ツアー単位）' : ''}。</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {groups.map(g => (
          <div key={g.label} className="glass rounded-2xl p-4 space-y-3 min-w-0">
            <div>
              <p className="text-sm font-bold text-white">{g.label}</p>
              <p className="text-[11px] text-[#8888aa]">{g.desc}</p>
            </div>
            {g.songs.length === 0 && (
              <p className="text-sm text-[#d0d0dc] leading-relaxed">
                {stats.unit === 'tour' ? 'ツアーごとに毎回違う曲が選ばれていて、決まった定番はありません。' : '公演ごとに毎回違う曲が選ばれていて、決まった定番はありません。'}
              </p>
            )}
            <ol className="space-y-2">
              {g.songs.map((s, i) => (
                <li key={s.name} className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs text-[#8888aa] shrink-0 w-4">{i + 1}</span>
                  <SongLink name={s.name} songId={s.songId} className="text-sm text-white min-w-0 flex-1" />
                  <span className="text-xs text-[#8888aa] shrink-0">{s.count}{u}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}
