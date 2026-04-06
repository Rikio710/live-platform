'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import ImageCropUploader from '@/components/ImageCropUploader'

type CatalogItem = {
  id: string
  name: string
  image_url: string | null
  price: number | null
  size_options: string[]
  color_options: string[]
  created_at: string
}

type ComboStat = {
  available: number
  sold_out: number
  myVote?: 'available' | 'sold_out'
}

type AllComboVotes = Record<string, ComboStat>

const WAIT_OPTIONS = ['列なし', '〜10分', '〜30分', '〜1時間', '2時間以上']
const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', '2XL']

interface MerchTabProps {
  concertId: string
  tourId: string | null
}

const ck = (itemId: string, color: string, size: string) => `${itemId}__${color}|${size}`

export default function MerchTab({ concertId, tourId }: MerchTabProps) {
  const supabase = createClient()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [waitVotes, setWaitVotes] = useState<Record<string, number>>({})
  const [myWaitVote, setMyWaitVote] = useState<string | null>(null)
  const [votingWait, setVotingWait] = useState(false)

  const [items, setItems] = useState<CatalogItem[]>([])
  const [comboVotes, setComboVotes] = useState<AllComboVotes>({})
  const [reportingItemId, setReportingItemId] = useState<string | null>(null)
  const [reportingColor, setReportingColor] = useState('')
  const [reportingSize, setReportingSize] = useState('')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formImageUrl, setFormImageUrl] = useState('')
  const [formImageMode, setFormImageMode] = useState<'url' | 'upload'>('url')
  const [formSizes, setFormSizes] = useState<string[]>([])
  const [formColorInput, setFormColorInput] = useState('')
  const [formColors, setFormColors] = useState<string[]>([])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)

      const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
      const { data: wvotes } = await supabase
        .from('merch_wait_votes')
        .select('wait_label, user_id')
        .eq('concert_id', concertId)
        .gte('created_at', oneHourAgo)

      if (wvotes) {
        const counts: Record<string, number> = {}
        for (const v of wvotes) {
          counts[v.wait_label] = (counts[v.wait_label] ?? 0) + 1
        }
        setWaitVotes(counts)
        if (user) {
          const mine = wvotes.find((v: any) => v.user_id === user.id)
          setMyWaitVote(mine?.wait_label ?? null)
        }
      }

      if (tourId) await loadCatalog(tourId, concertId, user?.id ?? null)
      setLoading(false)
    }
    init()
  }, [concertId, tourId])

  const loadCatalog = async (tid: string, cid: string, uid: string | null) => {
    const { data: catalog } = await supabase
      .from('merch_catalog')
      .select('id, name, image_url, price, size_options, color_options, created_at')
      .eq('tour_id', tid)
      .order('created_at', { ascending: true })

    if (!catalog) { setItems([]); return }
    setItems(catalog as CatalogItem[])

    const itemIds = (catalog as CatalogItem[]).map(i => i.id)
    if (itemIds.length === 0) return

    const { data: votes } = await supabase
      .from('merch_combo_votes')
      .select('catalog_item_id, color_option, size_option, status, user_id')
      .eq('concert_id', cid)
      .in('catalog_item_id', itemIds)

    if (!votes) return

    const agg: AllComboVotes = {}
    for (const v of votes) {
      const key = ck(v.catalog_item_id, v.color_option, v.size_option)
      if (!agg[key]) agg[key] = { available: 0, sold_out: 0 }
      agg[key][v.status as 'available' | 'sold_out']++
      if (uid && v.user_id === uid) {
        agg[key].myVote = v.status as 'available' | 'sold_out'
      }
    }
    setComboVotes(agg)
  }

  const handleWaitVote = async (label: string) => {
    if (!userId) { router.push('/login'); return }
    if (votingWait) return
    setVotingWait(true)
    if (myWaitVote === label) {
      await supabase.from('merch_wait_votes').delete().eq('concert_id', concertId).eq('user_id', userId)
      setWaitVotes(prev => ({ ...prev, [label]: Math.max(0, (prev[label] ?? 1) - 1) }))
      setMyWaitVote(null)
    } else {
      await supabase.from('merch_wait_votes')
        .upsert({ concert_id: concertId, user_id: userId, wait_label: label }, { onConflict: 'concert_id,user_id' })
      setWaitVotes(prev => {
        const next = { ...prev }
        if (myWaitVote) next[myWaitVote] = Math.max(0, (next[myWaitVote] ?? 1) - 1)
        next[label] = (next[label] ?? 0) + 1
        return next
      })
      setMyWaitVote(label)
    }
    setVotingWait(false)
  }

  const handleComboVote = async (itemId: string, color: string, size: string, status: 'available' | 'sold_out') => {
    if (!userId) { router.push('/login'); return }
    const key = ck(itemId, color, size)
    const myVote = comboVotes[key]?.myVote

    if (myVote === status) {
      await supabase.from('merch_combo_votes')
        .delete()
        .eq('catalog_item_id', itemId)
        .eq('concert_id', concertId)
        .eq('user_id', userId)
        .eq('color_option', color)
        .eq('size_option', size)
      setComboVotes(prev => {
        const stat = { ...(prev[key] ?? { available: 0, sold_out: 0 }) }
        stat[status] = Math.max(0, stat[status] - 1)
        delete stat.myVote
        return { ...prev, [key]: stat }
      })
    } else {
      await supabase.from('merch_combo_votes').upsert({
        catalog_item_id: itemId,
        concert_id: concertId,
        user_id: userId,
        color_option: color,
        size_option: size,
        status,
      }, { onConflict: 'catalog_item_id,concert_id,user_id,color_option,size_option' })
      setComboVotes(prev => {
        const stat = { ...(prev[key] ?? { available: 0, sold_out: 0 }) }
        if (myVote) stat[myVote] = Math.max(0, stat[myVote] - 1)
        stat[status]++
        stat.myVote = status
        return { ...prev, [key]: stat }
      })
    }
    setReportingItemId(null)
    setReportingColor('')
    setReportingSize('')
  }

  const getComboStatus = (itemId: string, color: string, size: string): 'available' | 'sold_out' | null => {
    const stat = comboVotes[ck(itemId, color, size)]
    if (!stat || (stat.available === 0 && stat.sold_out === 0)) return null
    return stat.sold_out > stat.available ? 'sold_out' : 'available'
  }

  const getColorStatus = (itemId: string, color: string, sizes: string[]): 'available' | 'sold_out' | 'partial' | null => {
    const checkSizes = sizes.length > 0 ? sizes : ['']
    let hasAvailable = false, hasSoldOut = false
    for (const size of checkSizes) {
      const st = getComboStatus(itemId, color, size)
      if (st === 'available') hasAvailable = true
      if (st === 'sold_out') hasSoldOut = true
    }
    if (!hasAvailable && !hasSoldOut) return null
    if (hasSoldOut && hasAvailable) return 'partial'
    return hasSoldOut ? 'sold_out' : 'available'
  }

  const getSizeStatus = (itemId: string, size: string, colors: string[]): 'available' | 'sold_out' | 'partial' | null => {
    const checkColors = colors.length > 0 ? colors : ['']
    let hasAvailable = false, hasSoldOut = false
    for (const color of checkColors) {
      const st = getComboStatus(itemId, color, size)
      if (st === 'available') hasAvailable = true
      if (st === 'sold_out') hasSoldOut = true
    }
    if (!hasAvailable && !hasSoldOut) return null
    if (hasSoldOut && hasAvailable) return 'partial'
    return hasSoldOut ? 'sold_out' : 'available'
  }

  const statusChipClass = (st: 'available' | 'sold_out' | 'partial' | null) => {
    if (st === 'available') return 'bg-green-500/15 text-green-400 border-green-500/30'
    if (st === 'sold_out') return 'bg-red-500/15 text-red-400 border-red-500/30'
    if (st === 'partial') return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30'
    return 'border-white/10 text-[#8888aa]'
  }

  const statusLabel = (st: 'available' | 'sold_out' | 'partial' | null) => {
    if (st === 'available') return ' 在庫あり'
    if (st === 'sold_out') return ' 完売'
    if (st === 'partial') return ' 一部完売'
    return ''
  }

  const toggleFormSize = (s: string) => setFormSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  const addFormColor = () => {
    const trimmed = formColorInput.trim()
    if (trimmed && !formColors.includes(trimmed)) { setFormColors(prev => [...prev, trimmed]); setFormColorInput('') }
  }
  const removeFormColor = (c: string) => setFormColors(prev => prev.filter(x => x !== c))
  const resetAddForm = () => {
    setFormName(''); setFormPrice(''); setFormImageUrl(''); setFormImageMode('url')
    setFormSizes([]); setFormColorInput(''); setFormColors([]); setShowAddForm(false)
  }

  const handleAddCatalog = async () => {
    if (!formName.trim() || !userId || !tourId) return
    setSubmitting(true)
    setAddError(null)
    const { data, error } = await supabase.from('merch_catalog').insert({
      tour_id: tourId, user_id: userId, name: formName.trim(),
      price: formPrice ? Number(formPrice) : null,
      image_url: formImageUrl.trim() || null,
      size_options: formSizes, color_options: formColors,
    }).select('id, name, image_url, price, size_options, color_options, created_at').single()
    if (error) { setAddError(`追加失敗: ${error.message}`); setSubmitting(false); return }
    if (data) setItems(prev => [...prev, data as CatalogItem])
    resetAddForm()
    setSubmitting(false)
  }

  const totalWaitVotes = Object.values(waitVotes).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl leading-none">✕</button>
        </div>
      )}

      {/* Wait time voting */}
      <div className="glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm">物販列の待ち時間</h3>
          <span className="text-xs text-[#8888aa]">過去1時間 · {totalWaitVotes}票</span>
        </div>
        <div className="space-y-2">
          {WAIT_OPTIONS.map(opt => {
            const count = waitVotes[opt] ?? 0
            const isVoted = myWaitVote === opt
            const pct = totalWaitVotes > 0 ? Math.round((count / totalWaitVotes) * 100) : 0
            return (
              <button key={opt} onClick={() => handleWaitVote(opt)} disabled={votingWait}
                className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${isVoted ? 'bg-violet-600/15 ring-1 ring-violet-500/40' : 'hover:bg-white/5'}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-medium ${isVoted ? 'text-violet-300' : 'text-white'}`}>{opt}</span>
                  <span className="text-xs text-[#8888aa]">{count > 0 ? `${count}票 (${pct}%)` : '0票'}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${isVoted ? 'bg-violet-500' : 'bg-white/20'}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-[#8888aa]">タップして投票。再タップで取り消し。投票は1時間後に自動失効。</p>
      </div>

      {/* Merch catalog */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-white text-sm">グッズ一覧</h3>
          {tourId && (
            <button onClick={() => userId ? setShowAddForm(!showAddForm) : router.push('/login')}
              className="text-sm border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 px-4 py-2 rounded-full transition-colors font-bold shrink-0">
              ＋ グッズを追加
            </button>
          )}
        </div>

        {!tourId && (
          <div className="glass rounded-2xl p-6 text-center">
            <p className="text-[#8888aa] text-sm">ツアー未設定のため物販情報を表示できません</p>
          </div>
        )}

        {/* Add form */}
        {tourId && showAddForm && (
          <div className="glass rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-white text-sm">グッズをツアーに追加</h3>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">商品名 *</label>
              <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例: ツアーTシャツ"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50" />
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">価格（¥）</label>
              <input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="例: 3500"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-[#8888aa]">画像（任意）</label>
                <div className="flex bg-white/5 rounded-lg p-0.5">
                  <button type="button" onClick={() => setFormImageMode('url')}
                    className={`text-xs px-3 py-1 rounded-md transition-colors ${formImageMode === 'url' ? 'bg-violet-600 text-white font-bold' : 'text-[#8888aa] hover:text-white'}`}>URL</button>
                  <button type="button" onClick={() => setFormImageMode('upload')}
                    className={`text-xs px-3 py-1 rounded-md transition-colors ${formImageMode === 'upload' ? 'bg-violet-600 text-white font-bold' : 'text-[#8888aa] hover:text-white'}`}>アップロード</button>
                </div>
              </div>
              {formImageMode === 'url' ? (
                <input type="text" value={formImageUrl} onChange={e => setFormImageUrl(e.target.value)} placeholder="https://..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50" />
              ) : formImageUrl ? (
                <div className="space-y-2">
                  <img src={formImageUrl} alt="" className="w-20 h-20 rounded-xl object-cover" />
                  <button type="button" onClick={() => { setFormImageUrl(''); setFormImageMode('upload') }}
                    className="text-xs text-[#8888aa] hover:text-red-400 transition-colors">画像を削除</button>
                </div>
              ) : (
                <ImageCropUploader onUpload={url => setFormImageUrl(url)} onCancel={() => setFormImageMode('url')} />
              )}
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-2 block">サイズ（任意）</label>
              <div className="flex flex-wrap gap-2">
                {SIZE_PRESETS.map(s => (
                  <button key={s} type="button" onClick={() => toggleFormSize(s)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${formSizes.includes(s) ? 'bg-violet-600 text-white border-violet-600' : 'border-white/10 text-[#8888aa] hover:border-white/20'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#8888aa] mb-2 block">カラー（任意）</label>
              <div className="flex gap-2 mb-2">
                <input type="text" value={formColorInput} onChange={e => setFormColorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFormColor() } }}
                  placeholder="例: ブラック"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50" />
                <button type="button" onClick={addFormColor} className="border border-white/10 text-[#8888aa] hover:text-white px-3 py-2 rounded-xl text-sm transition-colors">追加</button>
              </div>
              {formColors.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formColors.map(c => (
                    <span key={c} className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-white">
                      {c}<button onClick={() => removeFormColor(c)} className="text-[#8888aa] hover:text-red-400 ml-1">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {addError && <p className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{addError}</p>}
            <button onClick={handleAddCatalog} disabled={submitting || !formName.trim()}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl transition-colors text-sm">
              {submitting ? '追加中...' : 'ツアーに追加する'}
            </button>
          </div>
        )}

        {/* Catalog list */}
        {tourId && (
          loading ? (
            <div className="text-center text-[#8888aa] text-sm py-6">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center space-y-2">
              <p className="text-[#8888aa] text-sm">グッズ情報がまだありません</p>
              <p className="text-xs text-[#8888aa]">グッズを追加してみよう</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map(item => {
                const isReporting = reportingItemId === item.id
                const hasColors = item.color_options?.length > 0
                const hasSizes = item.size_options?.length > 0

                return (
                  <div key={item.id} className="glass rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {item.image_url ? (
                        <button type="button" onClick={() => setLightboxUrl(item.image_url!)}
                          className="w-16 h-16 rounded-xl overflow-hidden shrink-0 hover:opacity-80 transition-opacity">
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <ShoppingBag size={22} className="text-[#8888aa]" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="font-bold text-white text-sm">{item.name}</p>
                        {item.price != null && (
                          <p className="text-sm font-bold text-violet-300">¥{item.price.toLocaleString()}</p>
                        )}
                        {hasColors && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-[#8888aa]">カラー:</span>
                            {item.color_options.map(c => {
                              const st = getColorStatus(item.id, c, item.size_options ?? [])
                              return (
                                <span key={c} className={`text-xs border px-2 py-0.5 rounded-full ${statusChipClass(st)}`}>
                                  {c}{statusLabel(st)}
                                </span>
                              )
                            })}
                          </div>
                        )}
                        {hasSizes && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-[#8888aa]">サイズ:</span>
                            {item.size_options.map(s => {
                              const st = getSizeStatus(item.id, s, item.color_options ?? [])
                              return (
                                <span key={s} className={`text-xs border px-2 py-0.5 rounded-full ${statusChipClass(st)}`}>
                                  {s}{statusLabel(st)}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stock report panel */}
                    {isReporting ? (
                      <div className="space-y-3 border-t border-white/5 pt-3">
                        <p className="text-xs text-[#8888aa]">カラー・サイズを選んで在庫を報告</p>
                        <div className="flex gap-2">
                          {hasColors && (
                            <select value={reportingColor} onChange={e => setReportingColor(e.target.value)}
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50">
                              <option value="">カラー（全体）</option>
                              {item.color_options.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                          {hasSizes && (
                            <select value={reportingSize} onChange={e => setReportingSize(e.target.value)}
                              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50">
                              <option value="">サイズ（全体）</option>
                              {item.size_options.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          )}
                        </div>
                        {(() => {
                          const stat = comboVotes[ck(item.id, reportingColor, reportingSize)]
                          const total = (stat?.available ?? 0) + (stat?.sold_out ?? 0)
                          return total > 0 ? (
                            <p className="text-xs text-[#8888aa]">
                              現在: 在庫あり {stat?.available ?? 0}票 / 完売 {stat?.sold_out ?? 0}票
                            </p>
                          ) : null
                        })()}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleComboVote(item.id, reportingColor, reportingSize, 'available')}
                            className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-colors ${
                              comboVotes[ck(item.id, reportingColor, reportingSize)]?.myVote === 'available'
                                ? 'bg-green-500/20 border-green-500/40 text-green-400'
                                : 'border-green-500/40 text-green-400 hover:bg-green-500/10'
                            }`}>
                            在庫あり
                          </button>
                          <button
                            onClick={() => handleComboVote(item.id, reportingColor, reportingSize, 'sold_out')}
                            className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-colors ${
                              comboVotes[ck(item.id, reportingColor, reportingSize)]?.myVote === 'sold_out'
                                ? 'bg-red-500/20 border-red-500/40 text-red-400'
                                : 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                            }`}>
                            完売
                          </button>
                          <button onClick={() => { setReportingItemId(null); setReportingColor(''); setReportingSize('') }}
                            className="text-xs text-[#8888aa] hover:text-white transition-colors px-2">×</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { if (!userId) { router.push('/login'); return }; setReportingItemId(item.id); setReportingColor(''); setReportingSize('') }}
                        className="text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
                        在庫報告
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
