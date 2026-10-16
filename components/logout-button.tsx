'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut, Loader2 } from 'lucide-react'

export default function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className={`group flex items-center justify-center gap-2.5 border border-[#B08D46]/50 bg-card text-muted-foreground font-display uppercase transition-all duration-200 hover:bg-[#8C2F1B] hover:text-[#F3EDDF] hover:border-[#6E2415] hover:shadow-[0_6px_18px_-8px_rgba(140,47,27,0.5)] active:scale-[0.99] disabled:opacity-60 ${
        compact
          ? 'w-9 h-9'
          : 'w-full h-11 text-[11px] tracking-[0.24em]'
      }`}
      aria-label="Выйти"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LogOut className="w-4 h-4" />
      )}
      {!compact && 'Выйти'}
    </button>
  )
}