'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 text-sm text-[#8888aa] hover:text-red-400 border border-white/10 hover:border-red-500/30 px-4 py-2 rounded-full transition-colors"
    >
      <LogOut size={14} />
      ログアウト
    </button>
  )
}
