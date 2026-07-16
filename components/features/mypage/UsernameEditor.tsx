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
    <div>
      {editing ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              maxLength={20}
              autoFocus
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xl font-black text-white focus:outline-none focus:border-white/30 w-48"
            />
            <button onClick={handleSave} disabled={saving}
              className="text-[#b3b3b3] hover:text-[#b3b3b3] transition-colors p-1">
              <Check size={16} />
            </button>
            <button onClick={handleCancel}
              className="text-[#8888aa] hover:text-white transition-colors p-1">
              <X size={16} />
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black text-white">{current ?? '名前を設定'}</h2>
          <button onClick={() => setEditing(true)}
            className="text-[#8888aa] hover:text-white transition-colors">
            <Pencil size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
