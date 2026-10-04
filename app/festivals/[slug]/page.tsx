import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import { Tent, MapPin, Calendar, ChevronRight } from 'lucide-react'

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

type FestivalEvent = {
  id: string; name: string; slug: string | null
  start_date: string; end_date: string | null; venue_name: string | null; image_url: string | null
  concerts: { id: string }[]
}
type FestivalGroup = {
  id: string; name: string; slug: string | null; image_url: string | null
  festival_events: FestivalEvent[]
}

async function fetchGroup(slug: string): Promise<FestivalGroup | null> {
  const supabase = createPublicClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (supabase as any)
    .from('festival_groups')
    .select('id, name, slug, image_url, festival_events(id, name, slug, start_date, end_date, venue_name, image_url, concerts(id))')

  let query
  if (UUID_RE.test(slug)) {
    query = base.eq('id', slug)
  } else if (SHORT_ID_RE.test(slug)) {
    const { lo, hi } = shortIdRange(slug)
    query = base.gte('id', lo).lt('id', hi)
  } else {
    query = base.eq('slug', slug)
  }

  const { data } = await query.maybeSingle()
  return data ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const group = await fetchGroup(decodeURIComponent(slug))
  if (!group) return { title: 'フェス | LiveVault' }
  return {
    title: `${group.name}のセトリ・出演情報 | LiveVault`,
    description: `${group.name}の歴代出演アーティスト・セットリスト情報。${group.festival_events.length}回の開催データをLiveVaultで確認。`,
  }
}

export default async function FestivalGroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  if (UUID_RE.test(slug)) permanentRedirect(`/festivals/${slug.slice(0, 8)}`)

  const group = await fetchGroup(slug)
  if (!group) notFound()

  if (SHORT_ID_RE.test(slug) && group.slug) permanentRedirect(`/festivals/${group.slug}`)

  const groupSlug = group.slug ?? group.id.slice(0, 8)

  const events = [...(group.festival_events ?? [])].sort((a, b) =>
    b.start_date.localeCompare(a.start_date)
  )
  const totalConcerts = events.reduce((s, e) => s + (e.concerts?.length ?? 0), 0)

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start gap-4">
        {group.image_url ? (
          <img src={group.image_url} alt={group.name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-[#282828] flex items-center justify-center shrink-0">
            <Tent size={32} className="text-[#8888aa]" />
          </div>
        )}
        <div className="flex-1 min-w-0 pt-1">
          <p className="text-xs text-[#8888aa]">フェス</p>
          <h1 className="text-2xl font-black text-white leading-tight">{group.name}</h1>
          <p className="text-sm text-[#8888aa] mt-1">{events.length}回開催 · {totalConcerts}公演</p>
        </div>
      </div>

      {/* 年別開催カード一覧 */}
      {events.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">開催情報がまだありません</div>
      ) : (
        <div className="space-y-2">
          {events.map(ev => {
            const yearSlug = ev.slug ?? ev.id.slice(0, 8)
            const concertCount = ev.concerts?.length ?? 0
            return (
              <Link
                key={ev.id}
                href={`/festivals/${groupSlug}/${yearSlug}`}
                className="group flex items-center gap-4 glass rounded-2xl px-5 py-4 hover:border-white/20 border border-white/8 transition-all"
              >
                {ev.image_url && (
                  <img src={ev.image_url} alt={ev.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{ev.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-[#8888aa]">
                      <Calendar size={10} />
                      {new Date(ev.start_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {ev.end_date && ev.end_date !== ev.start_date && (
                        <> 〜 {new Date(ev.end_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}</>
                      )}
                    </span>
                    {ev.venue_name && (
                      <span className="flex items-center gap-1 text-xs text-[#8888aa]">
                        <MapPin size={10} />
                        {ev.venue_name}
                      </span>
                    )}
                  </div>
                  {concertCount > 0 && (
                    <p className="text-xs text-[#555] mt-0.5">{concertCount}公演</p>
                  )}
                </div>
                <ChevronRight size={16} className="text-[#8888aa] group-hover:text-white transition-colors shrink-0" />
              </Link>
            )
          })}
        </div>
      )}

      <div className="pt-2">
        <Link href="/festivals" className="text-sm text-[#8888aa] hover:text-white transition-colors">← フェス一覧に戻る</Link>
      </div>
    </main>
  )
}
