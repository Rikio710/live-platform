import LoginForm from '@/components/LoginForm'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ログイン',
  robots: { index: false },
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams
  return <LoginForm initialMode={mode === 'signup' ? 'signup' : 'login'} />
}
