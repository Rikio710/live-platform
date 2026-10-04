import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import { Mic2, MapPin, Calendar, Tent } from 'lucide-react'

export const revalidate = 3600

/** 初回アクセス時に生成してキャッシュ（ISR） */
export function generateStaticParams() {
  return []
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_ID_RE = /^[0-9a-f]{8}$/i

function shortIdRange(shortId: string) {
  const lo = `${shortId}-0000-0000-0000-000000000000`
  const hi = `${(parseInt(shortId, 16) + 1).toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`
  return { lo, hi }
}

type Concert = {
  id: string; date: string; stage_name: string | null; start_time: string | null
  artists: { id: string; name: string; slug: string | null; image_url: string | null; image_crop_x: number | null; image_crop_y: number | null } | null
  setlist_submissions: { id: string }[]
}
type FestivalEvent = {
  id: string; name: string; slug: string | null
  start_date: string; end_date: string | null; venue_name: string | null; image_url: string | null
  concerts: Concert[]
  festival_groups: { id: string; name: string; slug: string | null; image_url: string | null } | null
}

async function fetchEvent(groupSlug: string, yearSlug: string): Promise<FestivalEvent | null> {
  const supabase = createPublicClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any

  // まずグループを解決
  let groupId: string | null = null
  if (UUID_RE.test(groupSlug)) {
    groupId = groupSlug
  } else if (SHORT_ID_RE.test(groupSlug)) {
    const { lo, hi } = shortIdRange(groupSlug)
    const { data } = await s.from('festival_groups').select('id').gte('id', lo).lt('id', hi).maybeSingle()
    groupId = data?.id ?? null
  } else {
    const { data } = await s.from('festival_groups').select('id').eq('slug', groupSlug).maybeSingle()
    groupId = data?.id ?? null
  }
  if (!groupId) return null

  // festival_event を解決
  let evQuery = s
    .from('festival_events')
    .select(`
      id, name, slug, start_date, end_date, venue_name, image_url,
      festival_groups(id, name, slug, image_url),
      concerts(
        id, date, stage_name, start_time,
        artists(id, name, slug, image_url, image_crop_x, image_crop_y),
        setlist_submissions(id)
      )
    `)
    .eq('group_id', groupId)

  if (UUID_RE.test(yearSlug)) {
    evQuery = evQuery.eq('id', yearSlug)
  } else if (SHORT_ID_RE.test(yearSlug)) {
    const { lo, hi } = shortIdRange(yearSlug)
    evQuery = evQuery.gte('id', lo).lt('id', hi)
  } else {
    evQuery = evQuery.eq('slug', yearSlug)
  }

  const { data } = await evQuery.maybeSingle()
  return data ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; year: string }> }): Promise<Metadata> {
  const { slug, year } = await params
  const ev = await fetchEvent(decodeURIComponent(slug), decodeURIComponent(year))
  if (!ev) return { title: 'フェス | LiveVault' }
  const groupName = ev.festival_groups?.name ?? ''
  return {
    title: `${ev.name}のセトリ・出演情報 | LiveVault`,
    description: `${ev.name}の出演アーティスト・セットリスト情報。${groupName}の${new Date(ev.start_date).getFullYear()}年開催データをLiveVaultで確認。`,
  }
}

export default async function FestivalEventPage({ params }: { params: Promise<{ slug: string; year: string }> }) {
  const { slug: rawSlug, year: rawYear } = await params
  const groupSlug = decodeURIComponent(rawSlug)
  const yearSlug = decodeURIComponent(rawYear)

  if (UUID_RE.test(groupSlug)) permanentRedirect(`/festivals/${groupSlug.slice(0, 8)}/${yearSlug}`)
  if (UUID_RE.test(yearSlug)) permanentRedirect(`/festivals/${groupSlug}/${yearSlug.slice(0, 8)}`)

  const ev = await fetchEvent(groupSlug, yearSlug)
  if (!ev) notFound()

  const group = ev.festival_groups
  const groupHref = `/festivals/${group?.slug ?? group?.id?.slice(0, 8) ?? '#'}`

  // slug があるのに shortId でアクセスした場合は正規URLへリダイレクト
  if (SHORT_ID_RE.test(yearSlug) && ev.slug) {
    permanentRedirect(`/festivals/${groupSlug}/${ev.slug}`)
  }

  // 日付 → ステージ → 開演時刻 でソート
  const concerts = [...(ev.concerts ?? [])].sort((a, b) => {
    const d = a.date.localeCompare(b.date)
    if (d !== 0) return d
    const s = (a.stage_name ?? '').localeCompare(b.stage_name ?? '')
    if (s !== 0) return s
    return (a.start_time ?? '').localeCompare(b.start_time ?? '')
  })

  // 日付 → ステージ の2階層グループ化
  const byDate = new Map<string, Map<string, Concert[]>>()
  for (const c of concerts) {
    if (!byDate.has(c.date)) byDate.set(c.date, new Map())
    const stageKey = c.stage_name ?? ''
    const byStage = byDate.get(c.date)!
    if (!byStage.has(stageKey)) byStage.set(stageKey, [])
    byStage.get(stageKey)!.push(c)
  }
  const dates = [...byDate.keys()].sort()
  const hasStages = concerts.some(c => c.stage_name)

  const setlistCount = concerts.filter(c => c.setlist_submissions?.length > 0).length

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* パンくず */}
      <nav className="flex items-center gap-1.5 text-xs text-[#8888aa] min-w-0 overflow-hidden">
        <Link href="/festivals" className="hover:text-white transition-colors shrink-0">フェス</Link>
        <span className="shrink-0">›</span>
        <Link href={groupHref} className="hover:text-white transition-colors min-w-0 truncate shrink">{group?.name ?? 'フェス'}</Link>
        <span className="shrink-0">›</span>
        <span className="text-white min-w-0 truncate shrink">{ev.name}</span>
      </nav>

      {/* ヘッダー */}
      <div className="flex items-start gap-4">
        {ev.image_url ? (
          <img src={ev.image_url} alt={ev.name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
        ) : group?.image_url ? (
          <img src={group.image_url} alt={group.name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-[#282828] flex items-center justify-center shrink-0">
            <Tent size={32} className="text-[#8888aa]" />
          </div>
        )}
        <div className="flex-1 min-w-0 pt-1">
          {group && <p className="text-xs text-[#8888aa]">{group.name}</p>}
          <h1 className="text-2xl font-black text-white leading-tight">{ev.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="flex items-center gap-1 text-xs text-[#8888aa]">
              <Calendar size={11} />
              {new Date(ev.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
              {ev.end_date && ev.end_date !== ev.start_date && (
                <> 〜 {new Date(ev.end_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</>
              )}
            </span>
            {ev.venue_name && (
              <span className="flex items-center gap-1 text-xs text-[#8888aa]">
                <MapPin size={11} />
                {ev.venue_name}
              </span>
            )}
          </div>
          <p className="text-xs text-[#555] mt-1">{concerts.length}公演{setlistCount > 0 && ` · セトリ${setlistCount}件`}</p>
        </div>
      </div>

      {/* 出演アーティスト（日付 → ステージ別） */}
      {concerts.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">公演情報がまだありません</div>
      ) : (
        <div className="space-y-6">
          {dates.map(date => {
            const byStage = byDate.get(date)!
            const stages = [...byStage.keys()].sort()
            const dateLabel = dates.length > 1
              ? new Date(date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
              : null
            return (
              <section key={date}>
                {dateLabel && (
                  <p className="text-sm font-bold text-white px-1 mb-3">{dateLabel}</p>
                )}
                {hasStages ? (
                  <div className="space-y-3">
                    {stages.map(stage => (
                      <div key={stage}>
                        <p className="text-xs font-bold text-[#8888aa] uppercase tracking-wider px-1 mb-1.5">
                          {stage || 'STAGE'}
                        </p>
                        <div className="glass rounded-2xl overflow-hidden divide-y divide-white/5">
                          {byStage.get(stage)!.map(c => <ConcertRow key={c.id} concert={c} showStage={false} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="glass rounded-2xl overflow-hidden divide-y divide-white/5">
                    {[...byStage.values()].flat().map(c => <ConcertRow key={c.id} concert={c} showStage={false} />)}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}

function ConcertRow({ concert: c, showStage = true }: { concert: Concert; showStage?: boolean }) {
  const artist = c.artists
  const hasSetlist = c.setlist_submissions?.length > 0
  const subLine = showStage
    ? [c.stage_name, c.start_time?.slice(0, 5)].filter(Boolean).join(' · ')
    : c.start_time?.slice(0, 5) ?? ''
  return (
    <Link
      href={`/concerts/${c.id.slice(0, 8)}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors group"
    >
      {artist?.image_url ? (
        <img
          src={artist.image_url}
          alt={artist.name ?? ''}
          className="w-10 h-10 rounded-full object-cover shrink-0"
          style={{ objectPosition: `${artist.image_crop_x ?? 50}% ${artist.image_crop_y ?? 50}%` }}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#282828] flex items-center justify-center shrink-0">
          <Mic2 size={16} className="text-[#8888aa]" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{artist?.name ?? '—'}</p>
        {subLine && <p className="text-xs text-[#8888aa]">{subLine}</p>}
      </div>
      {hasSetlist && (
        <span className="flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span className="text-[11px] text-green-400 font-medium">セトリあり</span>
        </span>
      )}
      <span className="text-[#8888aa] group-hover:text-white transition-colors text-sm shrink-0">›</span>
    </Link>
  )
}
