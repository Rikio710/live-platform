'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, Heart, ListMusic, Mic2, Ticket, Trophy, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { dataLayerPush } from '@/lib/gtag'

/**
 * 未ログインの人に、会員登録でできること（マイページ）を紹介するポップアップ。
 * - 一度表示したら 14日間は出さない（閉じても登録ボタンを押しても同じ）。ブラウザの localStorage に記録
 * - 着地直後ではなく、少しスクロールするか数秒たってから出す（検索から来た直後に本文を覆うと Google の評価が下がるため）
 * - スマホは下から出るシート、PC は中央のモーダル
 * - 確認用: URL に ?signup_prompt=1 を付けると条件を無視してすぐ出す
 */
const STORAGE_KEY = 'lv_signup_prompt_until'
const SUPPRESS_DAYS = 14
const SHOW_AFTER_MS = 8000
const SHOW_AFTER_SCROLL_PX = 400
const EXCLUDED_PREFIXES = ['/login', '/auth', '/setup-profile', '/admin', '/mypage', '/contact', '/request']

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

  if (!open) return null
  const last = SLIDES.length - 1

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="LiveVaultの会員登録のご案内">
      <button aria-label="閉じる" className="absolute inset-0 bg-black/60 backdrop-blur-[2px] cursor-default" onClick={() => close('backdrop')} />

      <div className="relative w-full sm:max-w-md bg-[#181818] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-[signupIn_.28s_ease-out] pb-[env(safe-area-inset-bottom)]">
        <div className="sm:hidden flex justify-center pt-2.5">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>
        <button onClick={() => close('x')} aria-label="閉じる"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#b3b3b3]">
          <X size={16} />
        </button>

        <div ref={scroller} onScroll={onSlideScroll}
          className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SLIDES.map((s, i) => (
            <section key={i} className="w-full shrink-0 snap-center px-5 pt-5 sm:pt-7 pb-2 space-y-4">
              <div className="space-y-1.5 pr-8">
                <p className="text-[11px] font-bold tracking-wider text-[#8888aa]">{s.kicker}</p>
                <h2 className="text-lg font-black text-white leading-snug">{s.title}</h2>
                <p className="text-sm text-[#b3b3b3] leading-relaxed">{s.text}</p>
              </div>
              <div className="space-y-1.5">
                {s.mock}
                {i < last && <p className="text-right text-[10px] text-[#8888aa]">※ 画面は表示イメージです</p>}
              </div>
            </section>
          ))}
        </div>

        <div className="px-5 pt-2 pb-5 space-y-3">
          <div className="flex justify-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`${i + 1}枚目`}
                className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
          {slide < last ? (
            <div className="flex gap-2">
              <button onClick={() => close('later')} className="flex-1 py-3 rounded-2xl text-sm font-bold text-[#8888aa] hover:text-white">
                あとで
              </button>
              <button onClick={() => goTo(slide + 1)} className="flex-[2] py-3 rounded-2xl text-sm font-bold bg-white/10 hover:bg-white/15 text-white">
                次へ
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link href="/login?mode=signup" onClick={() => { setOpen(false); track('cta') }}
                className="block w-full text-center py-3 rounded-2xl text-sm font-bold bg-white hover:bg-[#e0e0e0] text-black">
                無料で登録する
              </Link>
              <button onClick={() => close('later')} className="block w-full py-2 text-xs text-[#8888aa] hover:text-white">
                今はしない
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────── スライドの中身（マイページの画面を見本データで再現） ───────── */

const card = 'rounded-2xl bg-white/[0.04] border border-white/10'

const HISTORY = [
  { date: '2026.09.14', artist: 'Mrs. GREEN APPLE', venue: '日産スタジアム' },
  { date: '2026.07.27', artist: 'SUPER BEAVER', venue: '日本武道館' },
  { date: '2026.05.03', artist: 'あいみょん', venue: '大阪城ホール' },
]

const STATS = [
  { label: '総参戦回数', big: '48', unit: '回', icon: Ticket },
  { label: '2026年', big: '12', unit: '回', icon: CalendarDays },
  { label: '最多参戦', big: 'SUPER BEAVER', unit: '', icon: Trophy },
  { label: 'アーティスト', big: '15', unit: '組', icon: Mic2 },
]

const SLIDES: { kicker: string; title: string; text: string; mock: React.ReactNode }[] = [
  {
    kicker: '会員登録でできること 1/3',
    title: '行ったライブを、全部残せる',
    text: '公演ページで「参戦登録」を押すだけ。日付・会場・その日のセトリまで、あなたの参戦履歴になります。',
    mock: (
      <div className={`${card} divide-y divide-white/5 overflow-hidden`}>
        <div className="flex items-center gap-1.5 px-4 py-2.5">
          <Ticket size={13} className="text-[#b3b3b3]" />
          <span className="text-xs font-bold text-white">参戦履歴</span>
        </div>
        {HISTORY.map(h => (
          <div key={h.date} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-[11px] text-[#8888aa] font-mono tabular-nums shrink-0">{h.date}</span>
            <div className="min-w-0">
              <p className="text-[11px] text-[#b3b3b3] truncate">{h.artist}</p>
              <p className="text-sm text-white truncate">{h.venue}</p>
            </div>
            <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] text-[#b3b3b3] bg-white/5 rounded-full px-2 py-0.5">
              <ListMusic size={10} /> セトリ
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    kicker: '会員登録でできること 2/3',
    title: '参戦回数が、ひと目でわかる',
    text: '今年は何回行った？ いちばん通っているのは誰？ 参戦記録から自動で集計します。',
    mock: (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {STATS.map(s => (
            <div key={s.label} className={`${card} p-3 flex flex-col gap-2`}>
              <div className="flex items-center gap-1.5">
                <s.icon size={12} className="text-[#b3b3b3]" />
                <p className="text-[11px] text-[#8888aa] truncate">{s.label}</p>
              </div>
              <p className="font-black text-white text-xl leading-none truncate">
                {s.big}{s.unit && <span className="text-xs font-medium text-[#8888aa] ml-0.5">{s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
        <div className={`${card} divide-y divide-white/5`}>
          {[['SUPER BEAVER', 9], ['Mrs. GREEN APPLE', 7], ['あいみょん', 5]].map(([name, n], i) => (
            <div key={name} className="flex items-center gap-3 px-4 py-2">
              <span className="text-[11px] text-[#8888aa] w-3 font-mono">{i + 1}</span>
              <span className="flex-1 text-sm text-white truncate">{name}</span>
              <span className="text-sm font-bold text-white">{n}<span className="text-[11px] text-[#8888aa] font-normal ml-0.5">回</span></span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    kicker: '会員登録でできること 3/3',
    title: '好きなアーティストの次のライブも',
    text: 'アーティストをフォローすると、今後の公演がマイページにまとまります。セトリの投稿や掲示板への書き込みもできます。',
    mock: (
      <div className="space-y-2">
        <div className={`${card} px-4 py-3 flex items-center gap-2`}>
          <Heart size={13} className="text-pink-400" />
          <span className="text-xs font-bold text-white">フォロー中</span>
          <div className="ml-auto flex -space-x-2">
            {['#5b4b8a', '#2f6f6a', '#8a5b3c', '#3c5a8a'].map(c => (
              <span key={c} className="w-7 h-7 rounded-full border-2 border-[#181818]" style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className={`${card} divide-y divide-white/5`}>
          <div className="flex items-center gap-1.5 px-4 py-2.5">
            <CalendarDays size={13} className="text-[#b3b3b3]" />
            <span className="text-xs font-bold text-white">フォロー中アーティストの今後の公演</span>
          </div>
          {[['あいみょん', 'Kアリーナ横浜', '11/21'], ['SUPER BEAVER', 'さいたまスーパーアリーナ', '12/06']].map(([a, v, d]) => (
            <div key={a} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[#b3b3b3] truncate">{a}</p>
                <p className="text-sm text-white truncate">{v}</p>
              </div>
              <span className="text-[11px] text-[#8888aa] tabular-nums">{d}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    kicker: 'LiveVault',
    title: 'あなたの参戦記録を、ここから',
    text: '登録は無料。Googleアカウントなら数秒で始められます。',
    mock: (
      <ul className={`${card} p-4 space-y-2.5`}>
        {[
          [Ticket, '参戦履歴をずっと残せる'],
          [Trophy, '参戦回数・最多参戦を自動で集計'],
          [Heart, 'フォローで次のライブを見逃さない'],
          [ListMusic, 'セトリの投稿・掲示板に参加'],
        ].map(([Icon, t]) => {
          const I = Icon as typeof Ticket
          return (
            <li key={t as string} className="flex items-center gap-3 text-sm text-white">
              <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0"><I size={14} className="text-[#b3b3b3]" /></span>
              {t as string}
            </li>
          )
        })}
      </ul>
    ),
  },
]
