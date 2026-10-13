/**
 * 画像がないときの表示（2026-10 追加。アーティストの9割・ツアーの98%に画像がないため）
 *   名前から決まるくすんだ単色 + 頭文字（アーティスト）/ タイトル（ツアー・フェス・公演）。
 *   同じ名前ならいつも同じ色になる。グラデーションは使わない（AI っぽく見えるため。2026-10 ユーザー指摘）
 */

/** 名前から 0〜359 の色相を決める（同じ名前は常に同じ色） */
export function nameHue(name: string): number {
  let h = 0
  for (const ch of name.normalize('NFKC')) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return h % 360
}

/**
 * くすんだ単色のパレット（グラデーションは使わない。CDジャケット・ライブのポスターのような落ち着いた色）
 */
const PALETTE = ['#2f3e52', '#5a2f35', '#34503f', '#6b5a2e', '#47365e', '#2e5458', '#5e3550', '#4a5230', '#5b3f2c', '#3a3f47']

/** 名前から決まる単色（同じ名前は常に同じ色） */
export function fallbackColor(name: string): string {
  return PALETTE[nameHue(name || '?') % PALETTE.length]
}

/** 先頭の記号を飛ばした1文字目（英字は大文字） */
export function initialOf(name: string): string {
  const s = name.normalize('NFKC').replace(/^[^\p{L}\p{N}]+/u, '')
  return ([...s][0] ?? '♪').toUpperCase()
}

const INITIAL_SIZE = { sm: 'text-sm', md: 'text-xl', lg: 'text-4xl', xl: 'text-6xl' } as const

/** アーティスト用: 単色 + 頭文字。className で大きさ・角丸（rounded-full 等）を指定 */
export function NameArt({ name, className = '', size = 'md' }: {
  name: string
  className?: string
  size?: keyof typeof INITIAL_SIZE
}) {
  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center select-none ${className}`}
      style={{ background: fallbackColor(name) }}
      role="img"
      aria-label={name}
    >
      <span className={`font-black text-white/85 leading-none ${INITIAL_SIZE[size]}`}>{initialOf(name)}</span>
    </div>
  )
}

const TITLE_SIZE = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-lg', xl: 'text-2xl' } as const

/**
 * ツアー・フェス・公演用: 単色（または背景画像をぼかして暗くしたもの）+ タイトル文字。
 *   bgImage … アーティスト画像など。あればぼかして暗くして背景に使う
 */
export function TitleArt({ title, sub, colorKey, bgImage, bgPosition, className = '', size = 'md' }: {
  title: string
  sub?: string | null
  /** 色を決める名前（省略時は title） */
  colorKey?: string
  bgImage?: string | null
  bgPosition?: string
  className?: string
  size?: keyof typeof TITLE_SIZE
}) {
  return (
    <div
      className={`relative overflow-hidden select-none ${className}`}
      style={{ background: fallbackColor(colorKey ?? title) }}
      role="img"
      aria-label={title}
    >
      {bgImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bgImage} alt="" className="absolute inset-0 w-full h-full object-cover scale-125 blur-md opacity-70" style={bgPosition ? { objectPosition: bgPosition } : undefined} />
      )}
      {bgImage && <div className="absolute inset-0 bg-black/45" />}
      <div className={`absolute inset-x-0 bottom-0 p-[8%] ${size === 'sm' ? 'p-1.5' : ''}`}>
        {sub && <p className={`text-white/70 font-bold truncate ${size === 'xl' || size === 'lg' ? 'text-xs' : 'text-[9px]'}`}>{sub}</p>}
        <p className={`text-white font-black leading-tight line-clamp-3 break-words ${TITLE_SIZE[size]}`}>{title}</p>
      </div>
    </div>
  )
}

/** フェス用: 出演アーティストの画像4枚をタイル状に（4枚そろわないときは TitleArt を使う） */
export function TileArt({ images, title, className = '' }: { images: string[]; title: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden grid grid-cols-2 grid-rows-2 ${className}`} role="img" aria-label={title}>
      {images.slice(0, 4).map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt="" className="w-full h-full object-cover" />
      ))}
      {title && <p className="absolute inset-x-0 bottom-0 p-3 bg-black/55 text-white font-black text-lg leading-tight line-clamp-2">{title}</p>}
    </div>
  )
}
