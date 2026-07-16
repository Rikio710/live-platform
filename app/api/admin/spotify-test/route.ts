import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/guards'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdmin()
  } catch (e) {
    return NextResponse.json({ step: 'auth', error: String(e) }, { status: 401 })
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  // トークン取得
  let token: string
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    })
    const text = await res.text()
    const data = JSON.parse(text)
    token = data.access_token
    if (!token) return NextResponse.json({ step: 'token', status: res.status, text: text.slice(0, 200) })
  } catch (e) {
    return NextResponse.json({ step: 'token_error', error: String(e) })
  }

  // 検索テスト
  try {
    const res = await fetch(
      'https://api.spotify.com/v1/search?q=vaundy&type=artist&market=JP&limit=3',
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const text = await res.text()
    return NextResponse.json({ step: 'search', status: res.status, preview: text.slice(0, 300) })
  } catch (e) {
    return NextResponse.json({ step: 'search_error', error: String(e) })
  }
}
