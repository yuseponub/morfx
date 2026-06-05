'use client'

// ============================================================================
// Conectar Instagram — Instagram Direct (Page-linked) connect client component
// (Phase 41 — instagram-direct, Plan 41-06 / Wave 4)
//
// SIBLING of connect-facebook.tsx, simplified for the no-popup path (D-IG-04).
// Instagram has NO independent OAuth — it rides on the workspace's already-connected
// Facebook Page. So this button does NOT launch a fresh Facebook Login popup: it simply
// triggers the owner-gated `connectInstagramAccount` server action (Plan 41-03),
// which reads the connected-Page row server-side, resolves the linked IG Professional
// account, and persists a channel:'instagram' meta-account row reusing the SAME Page
// token. Shows Spanish success/error toasts (sonner).
//
// Security:
//   - The browser NEVER sees a Page token. The action resolves IG off the stored
//     encrypted Page token entirely server-side and returns only
//     { success, igUsername, error } (T-41-06-01). This component never sees nor
//     logs any token.
//   - The owner gate is enforced server-side in connectInstagramAccount
//     (T-41-06-02); this button is a thin trigger only.
// ============================================================================

import { useTransition } from 'react'
import { toast } from 'sonner'

import { connectInstagramAccount } from '@/app/actions/meta-onboarding'
import { Button } from '@/components/ui/button'
import { Instagram, Loader2 } from 'lucide-react'

export function ConnectInstagram() {
  const [isPending, startTransition] = useTransition()

  const handleConnect = () => {
    startTransition(async () => {
      const result = await connectInstagramAccount()
      if (result.success) {
        toast.success(
          result.igUsername
            ? `Instagram conectado: @${result.igUsername}`
            : 'Instagram conectado'
        )
      } else {
        toast.error(result.error ?? 'No se pudo conectar Instagram')
      }
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecta la cuenta de Instagram Profesional vinculada a tu página de
        Facebook para atender los mensajes directos de Instagram con Meta. No
        se abre ninguna ventana: usamos la conexión de tu página de Facebook
        ya autorizada. Conectar Instagram no cambia el proveedor de envío
        actual de tu workspace.
      </p>

      <Button onClick={handleConnect} disabled={isPending} className="w-full">
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Instagram className="h-4 w-4 mr-2" />
        )}
        Conectar Instagram
      </Button>
    </div>
  )
}
