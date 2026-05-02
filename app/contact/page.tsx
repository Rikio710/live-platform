'use client'

import { useState } from 'react'

const CATEGORIES = [
  { value: 'feedback', label: '意見・要望' },
  { value: 'bug', label: 'バグ報告' },
  { value: 'other', label: 'その他' },
]

const MESSAGE_MAX = 2000

export default function ContactPage() {
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState('feedback')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    if (message.length > MESSAGE_MAX) {
      setError(`メッセージは${MESSAGE_MAX}文字以内で入力してください`)
      return
    }
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() || null, category, message: message.trim() }),
    })

    if (!res.ok) {
      setError('送信に失敗しました。しばらくしてからもう一度お試しください。')
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="text-xl font-black text-white">送信しました</h1>
        <p className="text-[#8888aa] text-sm leading-relaxed">
          お問い合わせありがとうございます。<br />
          内容を確認次第、対応いたします。
        </p>
        <button
          onClick={() => { setSuccess(false); setEmail(''); setCategory('feedback'); setMessage('') }}
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          続けて送信する
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">お問い合わせ</h1>
        <p className="text-sm text-[#8888aa] mt-1">ご意見・ご要望・バグ報告などをお送りください</p>
      </div>

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-5">
        <div>
          <label className="text-xs text-[#8888aa] mb-1 block">メールアドレス（任意）</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="返信が必要な場合はご記入ください"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div>
          <label className="text-xs text-[#8888aa] mb-1 block">カテゴリ *</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-[#8888aa]">メッセージ *</label>
            <span className={`text-xs ${message.length > MESSAGE_MAX ? 'text-red-400' : 'text-[#8888aa]'}`}>
              {message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="お問い合わせ内容をご記入ください"
            required
            rows={6}
            maxLength={MESSAGE_MAX}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-[#8888aa] focus:outline-none focus:border-violet-500/50 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !message.trim() || message.length > MESSAGE_MAX}
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors text-sm"
        >
          {submitting ? '送信中...' : '送信する'}
        </button>
      </form>
    </div>
  )
}
