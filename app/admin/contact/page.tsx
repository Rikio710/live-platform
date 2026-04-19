import { createClient } from '@/lib/supabase/server'
import AdminContactClient from './AdminContactClient'

export default async function AdminContactPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact_messages')
    .select('id, email, category, message, created_at, is_resolved')
    .order('created_at', { ascending: false })

  const messages = (data ?? []).map(m => ({ ...m, created_at: m.created_at ?? '' }))
  return <AdminContactClient initialMessages={messages} />
}
