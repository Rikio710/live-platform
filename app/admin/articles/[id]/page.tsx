'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Plus, Trash2 } from 'lucide-react'
import {
  adminGetArticle, adminGetRankingSongs, adminRefreshSongStats, adminUpdateArticle, adminDeleteArticle, type ArticleUpdate,
} from '../actions'

const input = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-[#555566] focus:outline-none focus:border-white/30'
const label = 'block text-xs font-bold text-[#8888aa] mb-1'

export default function AdminArticleEditPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [form, setForm] = useState<ArticleUpdate | null>(null)
  const [meta, setMeta] = useState<{ artistName: string | null; artistId: string | null; type: string; number: number } | null>(null)
  const [songs, setSongs] = useState<{ name: string; pct: number; count: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [statsState, setStatsState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    adminGetArticle(id).then(a => {
      setForm({
        title: a.title,
        slug: a.slug,
        description: a.description,
        lead: a.lead,
        body: a.body,
        song_notes: (a.song_notes ?? {}) as Record<string, string>,
        faq: (Array.isArray(a.faq) ? a.faq : []) as { q: string; a: string }[],
        sources: (Array.isArray(a.sources) ? a.sources : []) as { title: string; url: string }[],
        cover_image_url: a.cover_image_url,
        is_featured: a.is_featured,
        status: a.status as 'draft' | 'published',
      })
      setMeta({ artistName: a.artists?.name ?? null, artistId: a.artist_id, type: a.type, number: a.number })
      if (a.artist_id) adminGetRankingSongs(a.artist_id).then(setSongs).catch(() => {})
    }).catch(e => setMessage({ ok: false, text: String(e.message ?? e) }))
  }, [id])

  if (!form || !meta) {
    return <div className="max-w-3xl mx-auto px-4 py-6 text-sm text-[#8888aa]">{message?.text ?? '読み込み中...'}</div>
  }

  const set = <K extends keyof ArticleUpdate>(k: K, v: ArticleUpdate[K]) => setForm({ ...form, [k]: v })

  const save = async (status?: 'draft' | 'published') => {
    setSaving(true)
    setMessage(null)
    const next = status ? { ...form, status } : form
    try {
      await adminUpdateArticle(id, next)
      setForm(next)
      setMessage({ ok: true, text: next.status === 'published' ? '保存しました（公開中）' : '保存しました（下書き）' })
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('この記事を削除します。元に戻せません。よろしいですか？')) return
    await adminDeleteArticle(id)
    router.push('/admin/articles')
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-32">
      <div className="flex items-center justify-between gap-3">
        <Link href="/admin/articles" className="flex items-center gap-1 text-sm text-[#8888aa] hover:text-white">
          <ArrowLeft size={16} /> 記事一覧
        </Link>
        <a href={`/admin/articles/${id}/preview`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm text-[#8888aa] hover:text-white">
          表示を確認 <ExternalLink size={14} />
        </a>
      </div>

      {meta.type === 'data' && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-[#8888aa] leading-relaxed">
          導入文・曲ごとの解説・まとめ・説明文はデータから自動生成されます。下の欄は<strong className="text-white">空欄のままでOK</strong>です（書いた欄だけ自動生成の代わりに表示されます）。
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs text-[#8888aa]">{meta.type === 'data' ? 'データ型' : '編集型'}・{meta.artistName ?? '—'}</p>
        {meta.type === 'data' && meta.artistId && (
          <button
            type="button"
            disabled={statsState === 'running'}
            onClick={async () => {
              setStatsState('running')
              try {
                await adminRefreshSongStats(meta.artistId!)
                setSongs(await adminGetRankingSongs(meta.artistId!))
                setStatsState('done')
              } catch {
                setStatsState('error')
              }
            }}
            className="text-xs text-[#8888aa] hover:text-white underline disabled:opacity-50"
            title="ランキングは通常、月1回自動で集計し直します"
          >
            {statsState === 'running' ? '集計中…' : statsState === 'done' ? '集計し直しました' : statsState === 'error' ? '失敗しました（もう一度）' : 'ランキングを今すぐ集計し直す'}
          </button>
        )}
        <p className={`text-sm font-bold ${form.status === 'published' ? 'text-emerald-300' : 'text-[#8888aa]'}`}>
          {form.status === 'published' ? '公開中' : '下書き'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className={label}>タイトル（{form.title.length}文字）</label>
          <textarea rows={2} className={input} value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <p className="text-xs text-[#8888aa]">URL：/articles/{meta.number}</p>
        <div>
          <label className={label}>説明文（検索結果・一覧カードに表示。{form.description?.length ?? 0}文字、120文字前後推奨）</label>
          <textarea rows={3} className={input} value={form.description ?? ''} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className={label}>導入文（ランキングの前に表示。空行で段落を分けます）</label>
          <textarea rows={5} className={input} value={form.lead ?? ''} onChange={e => set('lead', e.target.value)}
            placeholder="例：◯◯のライブに初めて行く人のために、セトリデータから定番曲をまとめました。" />
        </div>
      </div>

      {/* 曲ごとの解説 */}
      {songs.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-white">曲ごとの解説（任意）</h2>
            <p className="text-xs text-[#8888aa]">現在のランキング順。書いた曲だけ記事に表示されます。独自の解説があるほど記事の価値が上がります。</p>
          </div>
          {songs.map((s, i) => (
            <div key={s.name}>
              <label className={label}>{i + 1}. {s.name}（登場率{s.pct}%）</label>
              <textarea rows={2} className={input} value={form.song_notes[s.name] ?? ''}
                onChange={e => set('song_notes', { ...form.song_notes, [s.name]: e.target.value })} />
            </div>
          ))}
        </section>
      )}

      <div>
        <label className={label}>まとめ（ページ後半に表示。空行で段落を分けます）</label>
        <textarea rows={5} className={input} value={form.body ?? ''} onChange={e => set('body', e.target.value)} />
      </div>

      {/* 追加FAQ */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-white">よくある質問（追加分）</h2>
          <p className="text-xs text-[#8888aa]">「一番演奏される曲」「平均曲数」などはデータから自動で作られます。それ以外を追加できます。</p>
        </div>
        {form.faq.map((f, i) => (
          <div key={i} className="glass rounded-xl p-3 space-y-2">
            <input className={input} placeholder="質問" value={f.q}
              onChange={e => set('faq', form.faq.map((x, j) => j === i ? { ...x, q: e.target.value } : x))} />
            <textarea rows={2} className={input} placeholder="回答" value={f.a}
              onChange={e => set('faq', form.faq.map((x, j) => j === i ? { ...x, a: e.target.value } : x))} />
            <button onClick={() => set('faq', form.faq.filter((_, j) => j !== i))} className="text-xs text-red-300 hover:text-red-200">削除</button>
          </div>
        ))}
        <button onClick={() => set('faq', [...form.faq, { q: '', a: '' }])}
          className="flex items-center gap-1 text-xs text-[#8888aa] hover:text-white"><Plus size={12} /> 質問を追加</button>
      </section>

      {/* 参考 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-white">参考にした情報（出典）</h2>
        {form.sources.map((s, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-2 min-w-0">
              <input className={input} placeholder="タイトル" value={s.title}
                onChange={e => set('sources', form.sources.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
              <input className={input} placeholder="https://..." value={s.url}
                onChange={e => set('sources', form.sources.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
            </div>
            <button onClick={() => set('sources', form.sources.filter((_, j) => j !== i))} className="text-red-300 hover:text-red-200 p-2 shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button onClick={() => set('sources', [...form.sources, { title: '', url: '' }])}
          className="flex items-center gap-1 text-xs text-[#8888aa] hover:text-white"><Plus size={12} /> 出典を追加</button>
      </section>

      <div className="space-y-4">
        <div>
          <label className={label}>カバー画像URL（空ならアーティスト画像）</label>
          <input className={input} value={form.cover_image_url ?? ''} onChange={e => set('cover_image_url', e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-white">
          <input type="checkbox" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)} />
          記事一覧の「ピックアップ」に表示する
        </label>
      </div>

      <button onClick={remove} className="flex items-center gap-1 text-xs text-red-300 hover:text-red-200">
        <Trash2 size={12} /> この記事を削除
      </button>

      {/* 保存バー（下部固定） */}
      <div className="fixed bottom-0 left-0 right-0 sm:left-52 z-40 border-t border-white/10 bg-[#121212]/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          {message && (
            <p className={`text-xs flex-1 min-w-0 break-words ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</p>
          )}
          <div className="flex gap-2 ml-auto shrink-0">
            {form.status === 'published' ? (
              <>
                <button disabled={saving} onClick={() => save('draft')}
                  className="text-xs font-bold px-4 py-2 rounded-full border border-white/15 text-white hover:border-white/30 disabled:opacity-40">非公開にする</button>
                <button disabled={saving} onClick={() => save()}
                  className="text-xs font-bold px-4 py-2 rounded-full bg-white text-black hover:bg-[#e0e0e0] disabled:opacity-40">更新</button>
              </>
            ) : (
              <>
                <button disabled={saving} onClick={() => save('draft')}
                  className="text-xs font-bold px-4 py-2 rounded-full border border-white/15 text-white hover:border-white/30 disabled:opacity-40">下書き保存</button>
                <button disabled={saving} onClick={() => save('published')}
                  className="text-xs font-bold px-4 py-2 rounded-full bg-white text-black hover:bg-[#e0e0e0] disabled:opacity-40">公開する</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
