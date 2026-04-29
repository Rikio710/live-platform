import LoginForm from '@/components/LoginForm'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ログイン',
  robots: { index: false },
}

export default function LoginPage() {
  return <LoginForm />
}
