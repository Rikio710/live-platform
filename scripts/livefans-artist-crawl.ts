#!/usr/bin/env bun
/**
 * LiveFans アーティスト全件取得スクリプト
 * 実行: bun run scripts/livefans-artist-crawl.ts
 *
 * 処理内容:
 * 1. LiveFans の50音/A-Z一覧ページを全ページスクレイプ
 * 2. アーティスト名・livefans_id を収集
 * 3. 既存アーティストと名前マッチング → artist_livefans_ids に追加
 * 4. 未登録アーティストは新規作成（source='livefans_bulk'）
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// .env.local 読み込み
const envPath = path.join(process.cwd(), '.env.local')
const env: Record<string, string> = {}
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const idx = line.indexOf('=')
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が .env.local にありません')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// カテゴリID: 1-82（あ〜ん＋A-Z＋0-9）＋99（その他）
const CATEGORIES = [...Array.from({ length: 82 }, (_, i) => i + 1), 99]
const DELAY_MS = 600       // リクエスト間隔（ms）
const BATCH_SIZE = 100     // DB insert のバッチサイズ

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ---------- HTML パース ----------

// 除外するUI文字列
const UI_TEXTS = new Set(['プロフィール', 'クリップ', 'フォロー', '詳細', 'もっと見る'])

function parseArtists(html: string): { livefansId: number; name: string }[] {
  const results = new Map<number, string>()
  // <h3>内の <a href="/artists/123">アーティスト名</a> を優先的に抽出
  // h3内のリンクが正しいアーティスト名、その後のリンクはUIボタン
  const re = /href="\/artists\/(\d+)"[^>]*>\s*([^<\n]+?)\s*<\/a>/g
  let m
  while ((m = re.exec(html)) !== null) {
    const id = parseInt(m[1])
    const name = m[2].trim()
    // UIテキストを除外、最初のマッチ（h3内）を優先（上書きしない）
    if (!isNaN(id) && name && name.length < 200 && !UI_TEXTS.has(name) && !results.has(id)) {
      results.set(id, name)
    }
  }
  return [...results.entries()].map(([livefansId, name]) => ({ livefansId, name }))
}

function parseTotalPages(html: string): number {
  const matches = [...html.matchAll(/\/page:(\d+)/g)]
  if (!matches.length) return 1
  return Math.max(...matches.map(m => parseInt(m[1])))
}

// ---------- フェッチ ----------

async function fetchHtml(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      })
      if (res.status === 404) return null
      if (!res.ok) { await sleep(2000); continue }
      return await res.text()
    } catch {
      if (i < retries - 1) await sleep(2000)
    }
  }
  return null
}

// ---------- カテゴリ全ページスクレイプ ----------

async function scrapeCategory(cat: number): Promise<{ livefansId: number; name: string }[]> {
  const baseUrl = `https://www.livefans.jp/artist/search/all/${cat}`
  const firstHtml = await fetchHtml(baseUrl)
  if (!firstHtml) return []

  const totalPages = parseTotalPages(firstHtml)
  const all = parseArtists(firstHtml)

  for (let page = 2; page <= totalPages; page++) {
    await sleep(DELAY_MS)
    const html = await fetchHtml(`${baseUrl}/page:${page}`)
    if (html) all.push(...parseArtists(html))
    if (page % 20 === 0) process.stdout.write(`  page ${page}/${totalPages}\n`)
  }

  // 重複除去
  const deduped = new Map<number, string>()
  for (const a of all) deduped.set(a.livefansId, a.name)
  return [...deduped.entries()].map(([livefansId, name]) => ({ livefansId, name }))
}

// ---------- メイン ----------

async function main() {
  console.log('=== LiveFans アーティスト収集スクリプト ===\n')

  // 既存データをメモリにロード（DB コール削減）
  console.log('既存データをロード中...')

  const { data: existingLfRows } = await (supabase as any)
    .from('artist_livefans_ids')
    .select('livefans_id')
    .limit(200000)
  const existingLfIds = new Set<number>((existingLfRows ?? []).map((r: any) => r.livefans_id as number))
  console.log(`  既存 livefans_ids: ${existingLfIds.size}件`)

  const { data: existingArtists } = await supabase
    .from('artists')
    .select('id, name')
    .limit(10000)
  const artistNameMap = new Map<string, string>((existingArtists ?? []).map(a => [a.name, a.id]))
  console.log(`  既存アーティスト: ${artistNameMap.size}件\n`)

  let totalSkipped = 0, totalLinked = 0, totalCreated = 0, totalErrors = 0

  for (const cat of CATEGORIES) {
    process.stdout.write(`カテゴリ ${String(cat).padStart(2, '0')} スクレイプ中... `)
    const artists = await scrapeCategory(cat)
    console.log(`${artists.length}件取得`)
    await sleep(DELAY_MS)

    // 新規のみ抽出
    const toProcess = artists.filter(a => !existingLfIds.has(a.livefansId))
    const toLink: { artist_id: string; livefans_id: number }[] = []
    const toCreate: { name: string; livefans_id: number }[] = []

    for (const a of toProcess) {
      const existingId = artistNameMap.get(a.name)
      if (existingId) {
        toLink.push({ artist_id: existingId, livefans_id: a.livefansId })
      } else {
        toCreate.push({ name: a.name, livefans_id: a.livefansId })
      }
      existingLfIds.add(a.livefansId)
    }

    totalSkipped += artists.length - toProcess.length

    // 既存アーティストへの紐付け（バッチ）
    for (let i = 0; i < toLink.length; i += BATCH_SIZE) {
      const batch = toLink.slice(i, i + BATCH_SIZE)
      const rows = batch.map(r => ({ artist_id: r.artist_id, livefans_id: r.livefans_id, crawl_page: 0 }))
      const { error } = await (supabase as any)
        .from('artist_livefans_ids')
        .upsert(rows, { onConflict: 'livefans_id', ignoreDuplicates: true })
      if (error) { console.error('  link error:', error.message); totalErrors++ }
      else totalLinked += batch.length
    }

    // 新規アーティスト作成（バッチ）
    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE)
      const { data: newArtists, error } = await (supabase as any)
        .from('artists')
        .insert(batch.map(a => ({ name: a.name, source: 'livefans_bulk' })))
        .select('id, name')
      if (error || !newArtists) { console.error('  create error:', error?.message); totalErrors += batch.length; continue }

      // nameMap を更新
      for (const a of newArtists) artistNameMap.set(a.name, a.id)

      // livefans_ids を紐付け
      const nameToLfId = new Map(batch.map(b => [b.name, b.livefans_id]))
      const lfRows = newArtists
        .filter((a: any) => nameToLfId.has(a.name))
        .map((a: any) => ({ artist_id: a.id, livefans_id: nameToLfId.get(a.name)!, crawl_page: 0 }))
      if (lfRows.length > 0) {
        await (supabase as any).from('artist_livefans_ids').insert(lfRows)
      }
      totalCreated += newArtists.length
    }

    console.log(`  → スキップ:${artists.length - toProcess.length} 紐付け:${toLink.length} 新規:${toCreate.length}`)
  }

  console.log('\n=== 完了 ===')
  console.log(`スキップ（既存）: ${totalSkipped}`)
  console.log(`既存アーティストに紐付け: ${totalLinked}`)
  console.log(`新規アーティスト作成: ${totalCreated}`)
  console.log(`エラー: ${totalErrors}`)
  console.log(`合計: ${totalSkipped + totalLinked + totalCreated}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
