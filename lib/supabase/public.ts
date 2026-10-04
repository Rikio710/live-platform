import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Cookie を読まない公開データ用クライアント（anon キー・RLS 適用）。
 * サーバー用の createClient は cookies() を読むためページが毎回動的レンダリングになり、
 * revalidate（ISR キャッシュ）が効かない。ログイン状態に依存しないページではこちらを使う。
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
