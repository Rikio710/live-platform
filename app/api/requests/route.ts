import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await req.json()
    if (!body.type || !body.payload) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin.from('requests').insert({
      type: body.type,
      payload: body.payload,
      submitted_by: user?.id ?? null,
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
