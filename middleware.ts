import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { hasNonAscii, toSlugKey } from '@/lib/slugKey'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 会場名など日本語を含む URL は、内部だけ ASCII の形に書き換える（理由は lib/slugKey.ts）
  if (!pathname.startsWith('/admin')) {
    const m = pathname.match(/^\/(venues|concerts|tours|artists)\/([^/]+)(\/.*)?$/)
    if (m) {
      let seg = m[2]
      try { seg = decodeURIComponent(seg) } catch {}
      if (hasNonAscii(seg)) {
        const url = req.nextUrl.clone()
        url.pathname = `/${m[1]}/${toSlugKey(seg)}${m[3] ?? ''}`
        const res = NextResponse.rewrite(url)
        res.headers.set('x-lv-slug-rewrite', '1')
        return res
      }
    }
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // セッションを更新（トークンリフレッシュ）
  const { data: { user } } = await supabase.auth.getUser()

  // /admin/* は未ログインなら /login へリダイレクト
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  // 会場ページは名前が日本語なので全部。公演・ツアー・アーティストは URL に %（日本語を含む旧形式の URL）があるときだけ
  // （通常の /concerts/d6e9830d などで毎回 middleware が動くと Vercel の利用量が増えるため）
  matcher: ['/admin/:path*', '/venues/:path+', '/(concerts|tours|artists)/(.*%.*)'],
}
