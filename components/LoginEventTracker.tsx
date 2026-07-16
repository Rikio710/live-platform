'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { dataLayerPush } from '@/lib/gtag'

export default function LoginEventTracker() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const fired = useRef(false)

  useEffect(() => {
    const method = searchParams.get('login')
    if (!method || fired.current) return
    fired.current = true
    dataLayerPush({ event: 'login', method })
    router.replace(pathname, { scroll: false })
  }, [searchParams, pathname, router])

  return null
}
