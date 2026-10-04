import type { RankedSong, StandardSongsData } from './articles'

/**
 * 定番曲記事の文章をセトリデータから自動生成する（手書き不要で量産するため）。
 * - 書くのはデータから言える事実だけ（演奏ツアー数・期間・定位置・最新ツアーで演奏されたか・収録作品）
 * - 全記事が同じ文面にならないよう、アーティストごとに言い回しを切り替える
 * - 管理画面で手書きした文章があればそちらを優先する（ページ側で判断）
 */

/** アーティスト名から決まる 0..n-1（同じアーティストなら毎回同じ言い回しになる） */
function pick<T>(seed: string, salt: string, options: T[]): T {
  let h = 0
  for (const ch of seed + salt) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return options[h % options.length]
}

const year = (d: string) => Number(d.slice(0, 4))
const q = (name: string) => `「${name}」`

function unitText(stats: StandardSongsData, n: number) {
  return stats.unit === 'tour' ? `${n}ツアー` : `${n}公演`
}

function countText(stats: StandardSongsData, s: RankedSong) {
  return stats.unit === 'tour'
    ? `${stats.totalUnits}のツアー・ライブのうち${s.count}で演奏`
    : `${stats.totalWithData}公演のうち${s.count}公演で演奏`
}

// ─────────────────────────────────────────────
// 導入文
// ─────────────────────────────────────────────

export function autoLead(name: string, stats: StandardSongsData): string {
  const [s1, s2, s3] = stats.ranking
  const fy = year(stats.firstDate)
  const ly = year(stats.lastDate)
  const span = fy === ly ? `${fy}年` : `${fy}年〜${ly}年`
  const scope = stats.unit === 'tour'
    ? `${stats.totalWithData}公演（${stats.totalUnits}のツアー・ライブ、${span}）`
    : `${stats.totalWithData}公演（${span}）`

  const opening = pick(name, 'lead1', [
    `${name}のライブで、実際によく演奏されている曲はどれなのか。LiveVaultに登録された${name}のセトリ${scope}を集計し、定番曲をランキングにしました。`,
    `${name}のライブに行く前に押さえておきたい定番曲を、LiveVaultに登録されたセトリ${scope}から集計しました。`,
    `これまでのライブで${name}が演奏してきた曲を、LiveVaultに登録されたセトリ${scope}をもとにランキング形式でまとめました。`,
  ])

  const top = s1
    ? pick(name, 'lead2', [
        `最も多くのツアーで演奏されているのは${q(s1.name)}（${unitText(stats, s1.count)}）。`,
        `1位は${q(s1.name)}で、${countText(stats, s1)}されています。`,
        `いちばんの定番は${q(s1.name)}。${countText(stats, s1)}されています。`,
      ]).replace('多くのツアーで', stats.unit === 'tour' ? '多くのツアーで' : '多くの公演で')
    : ''
  const next = s2 && s3 ? `続いて${q(s2.name)}、${q(s3.name)}が上位に入りました。` : ''
  const avg = `1公演あたりの平均曲数は${stats.avgSongs}曲です。`
  const close = pick(name, 'lead3', [
    'ライブ前の予習や、セトリの傾向チェックに役立ててください。',
    '初めてライブに行く人の予習にも、久しぶりに参戦する人の復習にも使えます。',
    'これから参戦する公演の予習にどうぞ。',
  ])

  return `${opening}\n\n${top}${next}${avg}${close}`
}

// ─────────────────────────────────────────────
// 曲ごとのコメント
// ─────────────────────────────────────────────

export function autoSongNote(name: string, stats: StandardSongsData, s: RankedSong): string {
  const parts: string[] = []
  const fy = year(s.firstPlayed)
  const ly = year(s.lastPlayed)
  const nowYear = new Date().getFullYear()

  // 演奏回数はカード上部に表示しているので文章には入れない

  // 演奏期間
  if (fy !== ly && ly - fy >= 3) {
    parts.push(pick(s.key, 'span', [
      `${fy}年から${ly}年まで、長く演奏され続けている曲です。`,
      `${fy}年のライブから${ly}年まで、時期を問わずセトリに入っています。`,
    ]))
  } else if (fy !== ly) {
    parts.push(`${fy}年〜${ly}年のライブで演奏されています。`)
  } else {
    parts.push(`${fy}年のライブで集中的に演奏されました。`)
  }

  // 定位置
  if (s.position === 'opening') parts.push('ライブの1曲目を飾ることが多い曲です。')
  else if (s.position === 'finale') parts.push('ライブの最後を締めくくる曲として定着しています。')
  else if (s.position === 'main-last') parts.push('アンコール前、本編のラストに置かれることが多い曲です。')
  else if (s.position === 'encore') parts.push('アンコールで演奏されることが多い曲です。')

  // 最新ツアー
  if (s.inLatest && stats.latestTourName) {
    parts.push(`最新の「${stats.latestTourName}」でも演奏されています。`)
  } else if (s.inLatest) {
    parts.push('直近のライブでも演奏されています。')
  } else if (nowYear - ly >= 3) {
    parts.push(`ただし${ly}年を最後に、登録されているセトリには登場していません。`)
  }

  // 収録作品
  if (s.album && s.year) parts.push(`『${s.album}』（${s.year}年）収録。`)
  else if (s.album) parts.push(`『${s.album}』収録。`)

  return parts.join('')
}

// ─────────────────────────────────────────────
// まとめ
// ─────────────────────────────────────────────

export function autoSummary(name: string, stats: StandardSongsData): string {
  const paras: string[] = []
  const top3 = stats.ranking.slice(0, 3).map(s => q(s.name)).join('、')
  if (top3) {
    paras.push(pick(name, 'sum1', [
      `${name}のライブ定番曲は${top3}。まずはこの3曲を聴いておけば、ライブ本番でも盛り上がれるはずです。`,
      `${name}のライブに行くなら、まずは${top3}を押さえておきましょう。`,
    ]))
  }

  if (stats.latestTourName) {
    const inLatest = stats.ranking.filter(s => s.inLatest).length
    paras.push(`最新の「${stats.latestTourName}」では、このランキング上位${stats.ranking.length}曲のうち${inLatest}曲が演奏されています。${
      inLatest <= stats.ranking.length / 3
        ? '定番曲よりも新しい曲中心の構成になっているので、最新作もあわせて予習しておくのがおすすめです。'
        : '定番曲をしっかり押さえた構成です。'
    }`)
  }

  const pos: string[] = []
  if (stats.encoreRegulars[0]) pos.push(`アンコールでは${q(stats.encoreRegulars[0].name)}`)
  if (stats.finales[0]) pos.push(`ライブのラストでは${q(stats.finales[0].name)}`)
  if (stats.openers[0]) pos.push(`1曲目では${q(stats.openers[0].name)}`)
  if (pos.length > 0) paras.push(`${pos.join('、')}が演奏されることが多くなっています。`)

  paras.push('このページのランキングは、LiveVaultに新しいセトリが登録されるたびに自動で更新されます。参戦した公演のセトリもぜひ投稿してください。')
  return paras.join('\n\n')
}

// ─────────────────────────────────────────────
// 検索結果の説明文（meta description）
// ─────────────────────────────────────────────

export function autoDescription(name: string, stats: StandardSongsData): string {
  const [s1, s2, s3] = stats.ranking
  const ranks = [s1 && `1位${q(s1.name)}`, s2 && `2位${q(s2.name)}`, s3 && `3位${q(s3.name)}`].filter(Boolean).join('、')
  const scope = stats.unit === 'tour'
    ? `${stats.totalUnits}ツアー・${stats.totalWithData}公演`
    : `${stats.totalWithData}公演`
  return `${name}のライブ定番曲ランキング。${ranks}。${scope}のセトリから、よく演奏される曲・アンコール常連曲・レア曲を集計しました。`
}

