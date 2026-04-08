'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SetupProfilePage() {
  const supabase = createClient()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    const trimmed = username.trim()
    if (!trimmed) { setError('ニックネームを入力してください'); return }
    if (trimmed.length > 20) { setError('20文字以内で入力してください'); return }
    if (!/^[^\s]+$/.test(trimmed)) { setError('スペースは使用できません'); return }

    setSaving(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // 重複チェック
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .neq('id', user.id)
      .single()

    if (existing) {
      setError('このニックネームはすでに使われています')
      setSaving(false)
      return
    }

    const { error: err } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: trimmed }, { onConflict: 'id' })

    if (err) {
      setError('保存に失敗しました: ' + err.message)
      setSaving(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black text-white">ニックネームを設定</h1>
          <p className="text-sm text-[#8888aa]">掲示板やセトリ投稿で表示される名前です</p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="例: livebot123"
            maxLength={20}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
          />
          <p className="text-xs text-[#8888aa] text-right">{username.trim().length}/20</p>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !username.trim()}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition-colors text-sm"
          >
            {saving ? '保存中...' : 'はじめる'}
          </button>
        </div>
      </div>
    </div>
  )
}
