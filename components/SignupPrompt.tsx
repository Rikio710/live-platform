'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Calendar, CalendarDays, Heart, MapPin, Mic2, Ticket, Trophy, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { dataLayerPush } from '@/lib/gtag'
import { ArtistCircleImage } from '@/components/ArtistCircleImage'

/**
 * 未ログインの人に、会員登録でできること（マイページ）を紹介するポップアップ。
 * - 一度表示したら 14日間は出さない（閉じても登録ボタンを押しても同じ）。ブラウザの localStorage に記録
 * - 着地直後ではなく、少しスクロールするか数秒たってから出す（検索から来た直後に本文を覆うと Google の評価が下がるため）
 * - スマホは下から出るシート、PC は中央のモーダル。登録ボタンはどのスライドにも出す
 * - 中身はマイページと同じ見た目で、サイトに実在する公演・アーティストを表示例として使う
 * - 確認用: URL に ?signup_prompt=1 を付けると条件を無視してすぐ出す
 */
const STORAGE_KEY = 'lv_signup_prompt_until'
const SUPPRESS_DAYS = 14
const SHOW_AFTER_MS = 8000
const SHOW_AFTER_SCROLL_PX = 400
const EXCLUDED_PREFIXES = ['/login', '/auth', '/setup-profile', '/admin', '/mypage', '/contact', '/request']

/** 表示例に使う公演（参戦履歴）とアーティスト（フォロー中）。消えた・画像がないものは表示時に飛ばす */
const SAMPLE_CONCERT_IDS = [
  'd6e9830d', // Mr.Children 2026-10-03 サンドーム福井
  '085ac9aa', // 緑黄色社会 2026-09-20 LaLa arena TOKYO-BAY
  '6b6cf3b8', // Vaundy 2026-09-20 INSPIRE ARENA
  'e3fece7e', // King Gnu 2026-07-15 横浜アリーナ
]
const SAMPLE_ARTIST_IDS = ['ceffd688', '564b96a8', 'c919da35', '1b291784', '62a248af', '304046e9'] // Mr.Children, King Gnu, Vaundy, 緑黄色社会, SUPER BEAVER, あいみょん
/** 統計の表示例（アーティスト別参戦回数は上の先頭3組） */
const SAMPLE_COUNTS = [9, 6, 4]

type SampleArtist = { id: string; name: string; image_url: string | null; image_crop_x: number | null; image_crop_y: number | null; image_crop_scale: number | null }
type SampleConcert = {
  id: string; date: string; venue_name: string; image_url: string | null
  artists: SampleArtist | null
  tours: { name: string; image_url: string | null } | null
}
type SampleUpcoming = { id: string; date: string; venue_name: string; artists: { name: string } | null }
type Sample = { concerts: SampleConcert[]; artists: SampleArtist[]; upcoming: SampleUpcoming[] }

function shortIdFilter(ids: string[]) {
  return ids.map(s => `and(id.gte.${s}-0000-0000-0000-000000000000,id.lte.${s}-ffff-ffff-ffff-ffffffffffff)`).join(',')
}

async function loadSample(): Promise<Sample> {
  const supabase = createClient()
  const ARTIST = 'id, name, image_url, image_crop_x, image_crop_y, image_crop_scale'
  const [{ data: concerts }, { data: artists }] = await Promise.all([
    supabase.from('concerts').select(`id, date, venue_name, image_url, artists(${ARTIST}), tours(name, image_url)`).or(shortIdFilter(SAMPLE_CONCERT_IDS)),
    supabase.from('artists').select(ARTIST).or(shortIdFilter(SAMPLE_ARTIST_IDS)),
  ])
  const order = (id: string, list: string[]) => list.findIndex(s => id.startsWith(s))
  const as = ((artists ?? []) as SampleArtist[]).sort((a, b) => order(a.id, SAMPLE_ARTIST_IDS) - order(b.id, SAMPLE_ARTIST_IDS))
  // 日本時間の今日（UTC だと朝9時まで前日の公演が「今後」に入る）
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const { data: upcoming } = as.length
    ? await supabase.from('concerts').select('id, date, venue_name, artists(name)')
        .in('artist_id', as.map(a => a.id)).gte('date', today).order('date').limit(20)
    : { data: [] }
  return {
    concerts: ((concerts ?? []) as unknown as SampleConcert[])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3),
    artists: as,
    // 同じアーティストが並ばないよう、1組1公演で2件
    upcoming: ((upcoming ?? []) as unknown as SampleUpcoming[])
      .filter((c, i, list) => list.findIndex(x => x.artists?.name === c.artists?.name) === i)
      .slice(0, 2),
  }
}

function suppressed(): boolean {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) ?? 0) > Date.now()
  } catch {
    return false
  }
}

function suppress() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now() + SUPPRESS_DAYS * 86400_000))
  } catch {}
}

const track = (action: string, extra?: Record<string, unknown>) =>
  dataLayerPush({ event: 'signup_prompt', prompt_action: action, ...extra })

export default function SignupPrompt() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [slide, setSlide] = useState(0)
  const [sample, setSample] = useState<Sample | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const armed = useRef(false)

  useEffect(() => {
    if (armed.current) return
    const force = new URLSearchParams(window.location.search).get('signup_prompt') === '1'
    if (!force && (EXCLUDED_PREFIXES.some(p => pathname.startsWith(p)) || suppressed())) return
    armed.current = true

    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const show = async () => {
      if (cancelled) return
      cancelled = true
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
      if (!force) {
        // ログイン済みなら出さない（getSession はブラウザ内の情報だけで判定するので通信しない）
        const { data } = await createClient().auth.getSession()
        if (data.session) return
      }
      // 表示例のデータを読んでから出す（読めなくても出す）
      setSample(await loadSample().catch(() => ({ concerts: [], artists: [], upcoming: [] })))
      suppress()
      setOpen(true)
      track('show', { page_path: window.location.pathname })
    }
    const onScroll = () => { if (window.scrollY > SHOW_AFTER_SCROLL_PX) show() }
    if (force) {
      show()
    } else {
      timer = setTimeout(show, SHOW_AFTER_MS)
      window.addEventListener('scroll', onScroll, { passive: true })
    }
    return () => {
      cancelled = true
      armed.current = false
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
    // 最初に着地したページでだけ判定する（ページ移動のたびに数え直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useCallback((how: string) => {
    setOpen(false)
    track('close', { how, slide: slide + 1 })
  }, [slide])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close('esc') }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  const goTo = (i: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
  }

  const onSlideScroll = () => {
    const el = scroller.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== slide) {
      setSlide(i)
      track('slide', { slide: i + 1 })
    }
  }

  if (!open || !sample) return null
  const slides = buildSlides(sample)
  const last = slides.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="LiveVaultの会員登録のご案内">
      <button aria-label="閉じる" className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default" onClick={() => close('backdrop')} />

      <div className="relative w-full sm:max-w-md max-h-[90dvh] flex flex-col bg-[#121212] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-[signupIn_.28s_ease-out] pb-[env(safe-area-inset-bottom)]">
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>
        <button onClick={() => close('x')} aria-label="閉じる"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#b3b3b3]">
          <X size={16} />
        </button>

        <div ref={scroller} onScroll={onSlideScroll}
          className="flex-1 min-h-0 flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {slides.map((s, i) => (
            <section key={i} className="w-full shrink-0 snap-center overflow-y-auto px-5 pt-5 sm:pt-7 pb-2 space-y-4">
              <div className="space-y-1.5 pr-8">
                <p className="text-[11px] font-bold tracking-wider text-[#8888aa]">会員登録でできること {i + 1}/{slides.length}</p>
                <h2 className="text-lg font-black text-white leading-snug">{s.title}</h2>
                <p className="text-sm text-[#b3b3b3] leading-relaxed">{s.text}</p>
              </div>
              <div className="space-y-1.5">
                {s.preview}
                <p className="text-right text-[10px] text-[#8888aa]">※ マイページの表示例です</p>
              </div>
            </section>
          ))}
        </div>

        <div className="shrink-0 px-5 pt-3 pb-4 space-y-3 border-t border-white/5">
          <div className="flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`${i + 1}枚目`}
                className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
          <Link href="/login?mode=signup" onClick={() => { setOpen(false); track('cta', { slide: slide + 1 }) }}
            className="block w-full text-center py-3 rounded-2xl text-sm font-bold bg-white hover:bg-[#e0e0e0] text-black">
            無料で登録する
          </Link>
          <div className="flex items-center justify-between">
            <button onClick={() => close('later')} className="px-2 py-1 text-xs text-[#8888aa] hover:text-white">
              今はしない
            </button>
            {slide < last && (
              <button onClick={() => goTo(slide + 1)} className="px-2 py-1 text-xs font-bold text-[#b3b3b3] hover:text-white">
                次へ ›
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────── スライドの中身（マイページと同じ見た目） ───────── */

function buildSlides({ concerts, artists, upcoming }: Sample): { title: string; text: string; preview: React.ReactNode }[] {
  const ranked = artists.slice(0, 3).map((a, i) => ({ ...a, count: SAMPLE_COUNTS[i] }))
  const total = 48
  return [
    {
      title: '行ったライブを、全部残せる',
      text: '公演ページで「参戦登録」を押すだけ。日付・会場・その日のセトリまで、あなたの参戦履歴になります。',
      preview: (
        <div className="space-y-3">
          <SectionTitle icon={<Ticket size={15} className="text-[#b3b3b3]" />} title="参戦履歴" />
          {concerts.map(c => <TicketCard key={c.id} c={c} />)}
        </div>
      ),
    },
    {
      title: '参戦回数が、ひと目でわかる',
      text: '今年は何回行った？ いちばん通っているのは誰？ 参戦登録から自動で集計します。',
      preview: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '総参戦回数', big: String(total), unit: '回', icon: Ticket },
              { label: `${new Date().getFullYear()}年`, big: '12', unit: '回', icon: Calendar },
              { label: '最多参戦', big: ranked[0]?.name ?? '—', unit: '', icon: Trophy },
              { label: 'アーティスト', big: '15', unit: '組', icon: Mic2 },
            ].map(s => (
              <div key={s.label} className="glass rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <s.icon size={13} className="text-[#b3b3b3]" />
                  </div>
                  <p className="text-xs text-[#8888aa] truncate">{s.label}</p>
                </div>
                <p className="font-black text-white text-2xl leading-none truncate">
                  {s.big}
                  {s.unit && <span className="text-sm font-medium text-[#8888aa] ml-0.5">{s.unit}</span>}
                </p>
              </div>
            ))}
          </div>
          {ranked.length > 0 && (
            <div className="space-y-3">
              <SectionTitle icon={<Trophy size={15} className="text-[#b3b3b3]" />} title="アーティスト別参戦回数" />
              <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
                {ranked.map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs text-[#8888aa] w-4 shrink-0 font-mono">{i + 1}</span>
                    {a.image_url
                      ? <img src={a.image_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" style={{ objectPosition: `${a.image_crop_x ?? 50}% ${a.image_crop_y ?? 50}%` }} />
                      : <div className="w-7 h-7 rounded-full bg-white/10 shrink-0 flex items-center justify-center"><Mic2 size={12} className="text-white/40" /></div>}
                    <span className="flex-1 text-sm text-white truncate">{a.name}</span>
                    <span className="text-sm font-bold text-white shrink-0">{a.count}<span className="text-xs text-[#8888aa] font-normal ml-0.5">回</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '好きなアーティストの次のライブも',
      text: 'アーティストをフォローすると、今後の公演がマイページにまとまります。セトリの投稿や掲示板への書き込みもできます。',
      preview: (
        <div className="space-y-4">
          <div className="space-y-3">
            <SectionTitle icon={<Heart size={15} className="text-pink-400" />} title="フォロー中のアーティスト" extra={`${artists.length}組`} />
            <div className="grid grid-cols-3 gap-4">
              {artists.map(a => (
                <div key={a.id} className="flex flex-col items-center gap-2">
                  {a.image_url
                    ? <ArtistCircleImage url={a.image_url} name={a.name} cropX={a.image_crop_x} cropY={a.image_crop_y} cropScale={a.image_crop_scale} className="w-full aspect-square" />
                    : <div className="w-full aspect-square rounded-full bg-[#333333] flex items-center justify-center"><Mic2 size={20} className="text-[#b3b3b3]" /></div>}
                  <span className="text-xs text-[#ccccdd] text-center line-clamp-2 w-full leading-tight">{a.name}</span>
                </div>
              ))}
            </div>
          </div>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <SectionTitle icon={<CalendarDays size={15} className="text-[#b3b3b3]" />} title="フォロー中アーティストの今後の公演" />
              <div className="glass rounded-2xl divide-y divide-white/5 overflow-hidden">
                {upcoming.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      {c.artists?.name && <p className="text-xs text-[#b3b3b3]">{c.artists.name}</p>}
                      <p className="text-sm text-white truncate">{c.venue_name}</p>
                    </div>
                    <span className="text-xs text-[#8888aa] shrink-0">{c.date}</span>
                    <span className="text-[#8888aa] shrink-0">›</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
  ]
}

function SectionTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {extra && <span className="text-xs text-[#8888aa]">{extra}</span>}
    </div>
  )
}

/** マイページの参戦履歴カード（AttendanceHistory のソロ公演カードと同じ見た目） */
function TicketCard({ c }: { c: SampleConcert }) {
  const d = new Date(c.date)
  const thumb = c.image_url ?? c.tours?.image_url ?? null
  return (
    <div className="relative flex rounded-xl overflow-hidden border border-white/8 bg-white/3">
      <div className="w-20 h-20 m-2.5 rounded-lg shrink-0 overflow-hidden relative bg-[#1a1a2e] self-center">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" />
        ) : c.artists?.image_url ? (
          <img src={c.artists.image_url} alt="" className="w-full h-full object-cover opacity-40" style={{ objectPosition: `${c.artists.image_crop_x ?? 50}% ${c.artists.image_crop_y ?? 50}%` }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Mic2 size={18} className="text-[#8888aa]" /></div>
        )}
      </div>
      <div className="flex-1 min-w-0 py-5 px-3">
        <p className="text-sm font-bold text-white truncate">{c.artists?.name ?? '—'}</p>
        {c.tours?.name && <p className="text-xs text-[#8888aa] truncate">{c.tours.name}</p>}
        <p className="text-xs text-[#666] mt-0.5 flex items-center gap-1 min-w-0">
          <MapPin size={9} className="shrink-0" />
          <span className="truncate">{c.venue_name}</span>
        </p>
      </div>
      <div className="flex items-stretch shrink-0">
        <div className="border-l border-dashed border-white/15 my-2" />
        <div className="py-5 flex flex-col items-center justify-center w-16 shrink-0">
          <p className="text-[10px] text-[#8888aa]">{d.getMonth() + 1}月</p>
          <p className="text-xl font-black text-white leading-none">{d.getDate()}</p>
          <p className="text-[10px] text-[#555] mt-0.5">{d.getFullYear()} {d.toLocaleDateString('ja-JP', { weekday: 'short' })}</p>
        </div>
      </div>
    </div>
  )
}
