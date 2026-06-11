'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Sincroniza el token refrescado en el browser ↔ Server Components
 * (auth-hardening Wave 1, T1.3).
 *
 * El middleware es el único punto de refresh server-side, pero el cliente
 * browser también rota el token (~hourly) por su cuenta. Sin este provider,
 * los Server Components siguen renderizando con el RSC payload viejo hasta la
 * siguiente navegación dura — router.refresh() los re-renderiza con las
 * cookies frescas.
 *
 * Solo TOKEN_REFRESHED y SIGNED_OUT: SIGNED_IN dispara en cada foco de tab /
 * re-hidratación y refrescaría en bucle sin necesidad. El callback es
 * intencionalmente NO-async (auth-js deadlock warning — mismo patrón que
 * RealtimeAuthProvider).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  return <>{children}</>
}
