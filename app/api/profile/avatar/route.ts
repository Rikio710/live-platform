import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { avatar_url } = await req.json()
  // Security: only allow null, Supabase storage URLs, or preset avatar URLs
  const SUPABASE_STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/'
  if (avatar_url !== null && avatar_url !== undefined) {
    if (typeof avatar_url !== 'string') {
      return NextResponse.json({ error: 'Invalid avatar_url' }, { status: 400 })
    }
    const isStorage = avatar_url.startsWith(SUPABASE_STORAGE_PREFIX)
    if (!isStorage) {
      const { data: preset } = await supabase.from('preset_avatars').select('id').eq('url', avatar_url).maybeSingle()
      if (!preset) return NextResponse.json({ error: 'Invalid avatar_url' }, { status: 400 })
    }
  }
  const { error } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: avatar_url ?? null }, { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
