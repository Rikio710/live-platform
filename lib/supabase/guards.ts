import { createClient } from '@/lib/supabase/server'

/**
 * Verifies the request is from an authenticated admin user.
 * Throws 'Unauthorized' if not logged in, 'Forbidden' if not admin.
 * Use this in every /api/admin/* route.
 */
export async function requireAdmin(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) throw new Error('Forbidden')
}
