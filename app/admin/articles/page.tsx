'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Plus, ExternalLink } from 'lucide-react'
import {
  adminListArticles, adminListStandardSongsCandidates, adminCreateStandardSongsArticle, adminSyncStandardSongsArticles,
  type AdminArticleRow, type Candidate,
} from './actions'
import { STANDARD_SONGS_MIN_SETLISTS, STANDARD_SONGS_MIN_UNITS, categoryLabel } from '@/lib/articles'

export default function AdminArticlesPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<AdminArticleRow[] | null>(null)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const load = () => {
    adminListArticles().then(setArticles).catch(e => setError(String(e.message ?? e)))
    adminListStandardSongsCandidates().then(setCandidates).catch(e => setError(String(e.message ?? e)))
  }
  useEffect(load, [])

  const syncAll = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await adminSyncStandardSongsArticles(10)
      setSyncResult(`${r.created}件の記事を作成・公開しました（対象 ${r.total}組）`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }

  const create = async (artistId: string) => {
    setCreating(artistId)
    try {
      const id = await adminCreateStandardSongsArticle(artistId)
      router.push(`/admin/articles/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCreating(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-2">
        <FileText size={20} className="text-white" />
        <h1 className="text-xl font-black text-white">記事</h1>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200 break-words">
          {error}
          {error.includes('articles') && <p className="text-xs mt-1">※ Supabase に articles テーブルが作成済みか確認してください（supabase/migrations/20261002_articles.sql）</p>}
        </div>
      )}

      {/* 自動作成 */}
      <section className="glass rounded-2xl p-4 space-y-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-white">定番曲記事の自動作成</h2>
          <p className="text-xs text-[#8888aa] leading-relaxed">
            セトリあり{STANDARD_SONGS_MIN_SETLISTS}公演以上・{STANDARD_SONGS_MIN_UNITS}ツアー（ライブ）以上のアーティストの記事を、文章も含めて自動で作成・公開します。
            自動公開を有効にすると（Vercel の環境変数 ARTICLE_AUTO_PUBLISH=1）、毎日朝4時にセトリの多い順で最大10件ずつ作成・公開されます。文章はデータから自動生成されるので、書く必要はありません（編集画面で上書きも可能）。
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={syncAll} disabled={syncing || candidates === null || candidates.length === 0}
            className="text-xs font-bold px-4 py-2 rounded-full bg-white text-black hover:bg-[#e0e0e0] disabled:opacity-40">
            {syncing ? '作成中...' : `セトリの多い順に10件作成・公開（未作成 ${candidates?.length ?? '…'}件）`}
          </button>
          {syncResult && <p className="text-xs text-emerald-300">{syncResult}</p>}
        </div>
      </section>

      {/* 記事一覧 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-white">作成済みの記事</h2>
        {articles === null ? (
          <p className="text-sm text-[#8888aa]">読み込み中...</p>
        ) : articles.length === 0 ? (
          <p className="text-sm text-[#8888aa]">まだ記事はありません。下の候補から作成できます。</p>
        ) : (
          <div className="space-y-2">
            {articles.map(a => (
              <div key={a.id} className="glass rounded-xl px-4 py-3 flex items-center gap-3 min-w-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  a.status === 'published' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-[#8888aa]'
                }`}>
                  {a.status === 'published' ? '公開中' : '下書き'}
                </span>
                <Link href={`/admin/articles/${a.id}`} className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate hover:text-[#b3b3b3]">{a.title}</p>
                  <p className="text-[11px] text-[#8888aa] truncate">
                    {categoryLabel(a.category)}・{a.artists?.name ?? '—'}{a.is_featured ? '・ピックアップ' : ''}
                  </p>
                </Link>
                <a href={a.status === 'published' ? `/articles/${a.number}` : `/admin/articles/${a.id}/preview`} target="_blank" rel="noopener noreferrer"
                  className="text-[#8888aa] hover:text-white shrink-0" title="表示を確認">
                  <ExternalLink size={16} />
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 作成候補 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-white">未作成のアーティスト</h2>
          <p className="text-xs text-[#8888aa]">1件ずつ下書きで作りたい場合はこちら（多い順）</p>
        </div>
        {candidates === null ? (
          <p className="text-sm text-[#8888aa]">集計中...</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-[#8888aa]">候補はありません</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {candidates.map(c => (
              <div key={c.artistId} className="glass rounded-xl px-4 py-3 flex items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{c.name}</p>
                  <p className="text-[11px] text-[#8888aa]">セトリ {c.setlistCount}公演</p>
                </div>
                <button
                  onClick={() => create(c.artistId)}
                  disabled={creating !== null}
                  className="shrink-0 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full bg-white text-black hover:bg-[#e0e0e0] disabled:opacity-40"
                >
                  <Plus size={12} />{creating === c.artistId ? '作成中...' : '作成'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
