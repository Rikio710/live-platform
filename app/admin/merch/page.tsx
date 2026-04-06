'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, ShoppingBag } from 'lucide-react'

type Tour = { id: string; name: string; artists: { name: string } | null }
type MerchItem = {
  id: string
  name: string
  price: number | null
  image_url: string | null
  size_options: string[] | null
  color_options: string[] | null
  tour_id: string | null
  tours: (Tour & { artists: { name: string } | null }) | null
  report_count?: number
}
type EditForm = {
  name: string
  price: string
  image_url: string
  size_options: string[]
  color_options: string[]
}

const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', '2XL']

export default function AdminMerchPage() {
  const supabase = createClient()
  const [items, setItems] = useState<MerchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTour, setFilterTour] = useState('')
  const [editingItem, setEditingItem] = useState<MerchItem | null>(null)
  const [form, setForm] = useState<EditForm>({ name: '', price: '', image_url: '', size_options: [], color_options: [] })
  const [saving, setSaving] = useState(false)
  const [customSize, setCustomSize] = useState('')
  const [newColor, setNewColor] = useState('')

  const load = async () => {
    const { data: merch } = await supabase
      .from('merch_catalog')
      .select('*, tours(id, name, artists(name))')
      .order('created_at', { ascending: false })

    const { data: reports } = await supabase
      .from('merch_stock_reports')
      .select('merch_id')

    const reportCounts: Record<string, number> = {}
    for (const r of reports ?? []) {
      reportCounts[r.merch_id] = (reportCounts[r.merch_id] ?? 0) + 1
    }

    setItems((merch ?? []).map((m: any) => ({ ...m, report_count: reportCounts[m.id] ?? 0 })) as MerchItem[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const tours = Array.from(
    new Map(
      items
        .filter(i => i.tours)
        .map(i => [i.tour_id, { id: i.tour_id!, name: i.tours!.name, artist: i.tours!.artists?.name ?? '' }])
    ).values()
  )

  const filtered = filterTour ? items.filter(i => i.tour_id === filterTour) : items

  const openEdit = (item: MerchItem) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      price: item.price != null ? String(item.price) : '',
      image_url: item.image_url ?? '',
      size_options: item.size_options ?? [],
      color_options: item.color_options ?? [],
    })
  }

  const closeEdit = () => { setEditingItem(null); setCustomSize(''); setNewColor('') }

  const toggleSize = (size: string) => {
    setForm(f => ({
      ...f,
      size_options: f.size_options.includes(size)
        ? f.size_options.filter(s => s !== size)
        : [...f.size_options, size],
    }))
  }

  const addCustomSize = () => {
    const s = customSize.trim().toUpperCase()
    if (!s || form.size_options.includes(s)) return
    setForm(f => ({ ...f, size_options: [...f.size_options, s] }))
    setCustomSize('')
  }

  const addColor = () => {
    const c = newColor.trim()
    if (!c || form.color_options.includes(c)) return
    setForm(f => ({ ...f, color_options: [...f.color_options, c] }))
    setNewColor('')
  }

  const removeColor = (color: string) => {
    setForm(f => ({ ...f, color_options: f.color_options.filter(c => c !== color) }))
  }

  const handleSave = async () => {
    if (!editingItem) return
    setSaving(true)
    const { data, error } = await supabase
      .from('merch_catalog')
      .update({
        name: form.name,
        price: form.price !== '' ? Number(form.price) : null,
        image_url: form.image_url || null,
        size_options: form.size_options.length > 0 ? form.size_options : null,
        color_options: form.color_options.length > 0 ? form.color_options : null,
      })
      .eq('id', editingItem.id)
      .select('*, tours(id, name, artists(name))')
      .single()
    setSaving(false)
    if (!error && data) {
      setItems(prev => prev.map(i => i.id === editingItem.id ? { ...data as MerchItem, report_count: editingItem.report_count } : i))
      closeEdit()
    }
  }

  const handleDelete = async (item: MerchItem) => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return
    const { error } = await supabase.from('merch_catalog').delete().eq('id', item.id)
    if (!error) setItems(prev => prev.filter(i => i.id !== item.id))
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-white">グッズ管理</h1>
          <p className="text-sm text-[#8888aa] mt-0.5">{filtered.length}件</p>
        </div>
        <select
          value={filterTour}
          onChange={e => setFilterTour(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">全ツアー</option>
          {tours.map(t => (
            <option key={t.id} value={t.id}>{t.name} {t.artist && `(${t.artist})`}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-[#8888aa] text-sm">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center text-[#8888aa] text-sm">グッズがありません</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="glass rounded-2xl px-5 py-4 flex items-center gap-4">
              {item.image_url ? (
                <img src={item.image_url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-violet-800/40 flex items-center justify-center shrink-0">
                  <ShoppingBag size={18} className="text-violet-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-white truncate">{item.name}</p>
                  {(item.report_count ?? 0) > 0 && (
                    <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full shrink-0">
                      報告 {item.report_count}件
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  {item.price != null ? `¥${item.price.toLocaleString()}` : '価格未設定'}
                  {item.tours && ` · ${item.tours.name}`}
                  {item.tours?.artists && ` (${item.tours.artists.name})`}
                </p>
                {(item.size_options?.length ?? 0) > 0 && (
                  <p className="text-xs text-[#8888aa] mt-0.5">サイズ: {item.size_options!.join(', ')}</p>
                )}
                {(item.color_options?.length ?? 0) > 0 && (
                  <p className="text-xs text-[#8888aa]">カラー: {item.color_options!.join(', ')}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="text-xs border border-white/10 text-[#8888aa] hover:text-white hover:border-white/20 px-3 py-1.5 rounded-full transition-colors"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="text-xs border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-full transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white">グッズを編集</h2>
              <button onClick={closeEdit} className="text-[#8888aa] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">グッズ名</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Price */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">価格（円）</label>
              <input
                type="number"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="例: 3000"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="text-xs text-[#8888aa] mb-1 block">画像URL</label>
              <input
                type="text"
                value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="https://..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
              />
              {form.image_url && (
                <img src={form.image_url} alt="" className="w-20 h-20 rounded-xl object-cover mt-2" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
            </div>

            {/* Size options */}
            <div>
              <label className="text-xs text-[#8888aa] mb-2 block">サイズ</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {SIZE_PRESETS.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleSize(size)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors border ${
                      form.size_options.includes(size)
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'border-white/10 text-[#8888aa] hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                ))}
                {form.size_options.filter(s => !SIZE_PRESETS.includes(s)).map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleSize(size)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold border bg-violet-600 border-violet-500 text-white transition-colors"
                  >
                    {size}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customSize}
                  onChange={e => setCustomSize(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomSize()}
                  placeholder="カスタムサイズ"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                />
                <button
                  type="button"
                  onClick={addCustomSize}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-[#8888aa] hover:text-white transition-colors"
                >
                  追加
                </button>
              </div>
            </div>

            {/* Color options */}
            <div>
              <label className="text-xs text-[#8888aa] mb-2 block">カラー</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.color_options.map(color => (
                  <span key={color} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/10 text-white border border-white/10">
                    {color}
                    <button type="button" onClick={() => removeColor(color)} className="text-[#8888aa] hover:text-red-400 transition-colors ml-1">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newColor}
                  onChange={e => setNewColor(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addColor()}
                  placeholder="例: ブラック"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
                />
                <button
                  type="button"
                  onClick={addColor}
                  className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-[#8888aa] hover:text-white transition-colors"
                >
                  追加
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={closeEdit}
                className="flex-1 border border-white/10 text-[#8888aa] hover:text-white py-2.5 rounded-xl text-sm transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
