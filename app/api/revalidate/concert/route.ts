import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// POST: 参戦登録・取り消しのあとにブラウザから呼び、公演ページ（参戦人数）をすぐ作り直す。ログイン中のみ
export async function POST(req: NextRequest) {
  const { concertId } = await req.json().catch(() => ({}))
  if (typeof concertId !== 'string' || !/^[0-9a-f-]{36}$/.test(concertId)) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  revalidatePath(`/concerts/${concertId.slice(0, 8)}`)
  return NextResponse.json({ ok: true })
}
