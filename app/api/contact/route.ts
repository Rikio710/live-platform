import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const { email, category, message } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  if (message.length > 2000) return NextResponse.json({ error: 'Too long' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('contact_messages').insert({
    email: email ?? null,
    category: category ?? 'other',
    message: message.trim(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
