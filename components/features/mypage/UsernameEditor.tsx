'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pencil, Check, X } from 'lucide-react'

export default function UsernameEditor({ initialUsername }: { initialUsername: string | null }) {
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialUsername ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(initialUsername)

  const handleSave = async () => {
    const trimmed = value.trim()
    if (!trimmed) { setError('ニックネームを入力してください'); return }
    if (trimmed.length > 20) { setError('20文字以内で入力してください'); return }
    if (!/^[^\s]+$/.test(trimmed)) { setError('スペースは使用できません'); return }
    if (trimmed === current) { setEditing(false); return }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: existing } = await supabase
      .from('profiles').select('id').eq('username', trimmed).neq('id', user.id).single()

    if (existing) {
      setError('このニックネームはすでに使われています')
      setSaving(false)
      return
    }

    const { error: err } = await supabase
      .from('profiles').update({ username: trimmed }).eq('id', user.id)

    if (err) {
      setError('保存に失敗しました')
      setSaving(false)
      return
    }

    setCurrent(trimmed)
    setEditing(false)
    setSaving(false)
  }

  const handleCancel = () => {
    setValue(current ?? '')
    setError(null)
    setEditing(false)
  }

  return (
    <div className="glass rounded-2xl px-5 py-4 space-y-2">
      <p className="text-xs text-[#8888aa]">ニックネーム</p>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              maxLength={20}
              autoFocus
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
            />
            <button onClick={handleSave} disabled={saving}
              className="text-violet-400 hover:text-violet-300 transition-colors p-1.5">
              <Check size={16} />
            </button>
            <button onClick={handleCancel}
              className="text-[#8888aa] hover:text-white transition-colors p-1.5">
              <X size={16} />
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-white">{current ?? '未設定'}</p>
          <button onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-[#8888aa] hover:text-white border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-full transition-colors">
            <Pencil size={11} />
            変更
          </button>
        </div>
      )}
    </div>
  )
}
