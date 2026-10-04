'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * ?tab= と連動するタブ（ブラウザ側で切り替え）。
 * 各タブの中身はサーバーで全部描画して渡し、表示/非表示だけを切り替える。
 * ページ側（サーバー）で searchParams を読むとページがキャッシュされなくなるため、この形にしている。
 * 非表示のタブも HTML には含まれるので、検索エンジンからも読める。
 */
export default function UrlTabs({
  tabs,
  defaultKey,
  param = 'tab',
  variant = 'underline',
}: {
  tabs: { key: string; label: string; panel: ReactNode }[]
  defaultKey: string
  /** URL のパラメータ名（?tab= / ?type= など） */
  param?: string
  variant?: 'underline' | 'pill'
}) {
  const keys = tabs.map(t => t.key)
  const [active, setActive] = useState(defaultKey)

  useEffect(() => {
    const sync = () => {
      const t = new URLSearchParams(window.location.search).get(param)
      setActive(t && keys.includes(t) ? t : defaultKey)
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKey, param, keys.join(',')])

  const select = (key: string) => {
    setActive(key)
    const url = key === defaultKey ? window.location.pathname : `${window.location.pathname}?${param}=${key}`
    window.history.pushState(null, '', url)
  }

  return (
    <>
      <div className={variant === 'pill' ? 'flex bg-white/5 rounded-xl p-1' : 'flex gap-0 border-b border-white/10'} role="tablist">
        {tabs.map(t => (
          <a
            key={t.key}
            href={t.key === defaultKey ? '?' : `?${param}=${t.key}`}
            role="tab"
            aria-selected={active === t.key}
            onClick={e => { e.preventDefault(); select(t.key) }}
            className={variant === 'pill'
              ? `flex-1 py-2 text-sm font-bold rounded-lg text-center transition-colors ${active === t.key ? 'bg-white text-black' : 'text-[#8888aa] hover:text-white'}`
              : `px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active === t.key ? 'text-white border-white' : 'text-[#8888aa] border-transparent hover:text-[#b3b3b3]'
                }`}
          >
            {t.label}
          </a>
        ))}
      </div>
      {tabs.map(t => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.panel}
        </div>
      ))}
    </>
  )
}
