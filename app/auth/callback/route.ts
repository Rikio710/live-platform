import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()

      if (!profile?.username) {
        return NextResponse.redirect(`${origin}/setup-profile`)
      }
      // 既存ユーザーのログイン — クライアント側でloginイベントを発火させるためクエリ付きリダイレクト
      return NextResponse.redirect(`${origin}/mypage?login=google`)
    }
  }

  return NextResponse.redirect(`${origin}/mypage`)
}
