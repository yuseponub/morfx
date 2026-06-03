'use client'

// ============================================================================
// Conectar WhatsApp — Meta Embedded Signup client component
// (Phase 38 — embedded-signup-wa-inbound, Plan 05 / Wave 4)
//
// Loads the Facebook JS SDK, launches the Embedded Signup v4 popup via
// `FB.login` (with `config_id`), captures BOTH return channels, and once both
// are present calls the owner-gated `connectWhatsAppNumber` server action
// (Plan 04). Shows Spanish success/error toasts (sonner).
//
// Two return channels (RESEARCH Pattern 4 — BOTH must fire):
//   - Channel 1 (auth `code`): arrives in the `FB.login` callback
//     (`response.authResponse.code`). Short-lived, single-use (~10 min,
//     Pitfall 9) — exchanged immediately server-side.
//   - Channel 2 (`waba_id` / `phone_number_id`): arrives via a `window`
//     'message' event of type `WA_EMBEDDED_SIGNUP` event `FINISH`, NOT in the
//     FB.login callback. The listener guards `event.origin.endsWith('facebook.com')`
//     and JSON.parse-try/catch before trusting the payload (T-38-17).
//
// Security:
//   - The browser bundle only ever references `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`
//     (the config_id is NON-secret). The Meta app secret is NEVER referenced here —
//     the code→token exchange happens entirely server-side in the action (T-38-18).
//   - The 'message' listener treats every event as untrusted: origin guard +
//     JSON.parse try/catch before reading WA_EMBEDDED_SIGNUP data (T-38-17).
//
// MEDIUM confidence (RESEARCH Pitfall 8): `config_id`, `featureType` and the
// exact `extras` keys are Meta-version-sensitive. The config_id MUST be read
// from the live Meta App dashboard (Embedded Signup product) and set in Vercel
// as NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID. Validate the popup options live
// in the browser before declaring done.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { connectWhatsAppNumber } from '@/app/actions/meta-onboarding'
import { Button } from '@/components/ui/button'
import { Loader2, MessageCircle } from 'lucide-react'

// Minimal global typing for the injected FB JS SDK (no @types dependency).
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FB?: any
  }
}

// appId + version MUST match META_GRAPH_API_VERSION (constants.ts:7 = v22.0).
const META_APP_ID = '1457229738955828'
const META_SDK_VERSION = 'v22.0'
const FB_SDK_ID = 'facebook-jssdk'

// The config_id is NON-secret (read from the Meta App > Embedded Signup config).
// It MUST be set in Vercel as NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID.
const CONFIG_ID = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID

export function ConnectWhatsApp() {
  const [isPending, startTransition] = useTransition()
  const [sdkReady, setSdkReady] = useState(false)

  // Dual-channel capture refs — BOTH must be set before we call the action.
  const codeRef = useRef<string | null>(null)
  const sessionRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(
    null
  )

  const configReady = Boolean(CONFIG_ID)

  // === Fire the action once BOTH channels have arrived =====================
  const tryComplete = () => {
    const code = codeRef.current
    const session = sessionRef.current
    if (!code || !session) return

    // Reset refs immediately so a stray duplicate event can't double-fire.
    codeRef.current = null
    sessionRef.current = null

    startTransition(async () => {
      const result = await connectWhatsAppNumber({
        code,
        wabaId: session.wabaId,
        phoneNumberId: session.phoneNumberId,
      })
      if (result.success) {
        toast.success('WhatsApp conectado')
      } else {
        toast.error(result.error)
      }
    })
  }

  // === SDK load (once) + Channel 2 listener (mount/unmount) ================
  useEffect(() => {
    // --- Inject the FB JS SDK once (guard against double-inject) ---
    const initFb = () => {
      try {
        window.FB?.init({
          appId: META_APP_ID,
          version: META_SDK_VERSION,
          xfbml: false,
        })
        setSdkReady(true)
      } catch {
        // SDK present but init failed — leave button enabled? No: keep gated.
        setSdkReady(false)
      }
    }

    if (window.FB) {
      initFb()
    } else if (!document.getElementById(FB_SDK_ID)) {
      const script = document.createElement('script')
      script.id = FB_SDK_ID
      script.src = 'https://connect.facebook.net/en_US/sdk.js'
      script.async = true
      script.defer = true
      script.crossOrigin = 'anonymous'
      script.onload = initFb
      document.body.appendChild(script)
    } else {
      // Script tag exists (another mount injected it) — poll briefly for window.FB.
      const t = setInterval(() => {
        if (window.FB) {
          clearInterval(t)
          initFb()
        }
      }, 200)
      // Stop polling after ~5s regardless.
      setTimeout(() => clearInterval(t), 5000)
    }

    // --- Channel 2: window 'message' listener (untrusted — guarded) ---
    const onMessage = (event: MessageEvent) => {
      // T-38-17: never trust an event we can't attribute to Facebook.
      if (!event.origin.endsWith('facebook.com')) return
      let data: {
        type?: string
        event?: string
        data?: { waba_id?: string; phone_number_id?: string }
      }
      try {
        data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return // not our message (or malformed) — ignore
      }
      if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return

      if (data.event === 'FINISH') {
        const wabaId = data.data?.waba_id
        const phoneNumberId = data.data?.phone_number_id
        if (wabaId && phoneNumberId) {
          sessionRef.current = { wabaId, phoneNumberId }
          tryComplete()
        }
      } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
        codeRef.current = null
        sessionRef.current = null
        toast.error('Conexión cancelada')
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Launch the Embedded Signup popup (Channel 1: auth code) =============
  const launch = () => {
    if (!configReady) {
      toast.error('Falta configurar NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID')
      return
    }
    if (!window.FB) {
      toast.error('El SDK de Facebook aún no cargó. Intenta de nuevo.')
      return
    }

    // Reset any stale capture before launching a fresh popup.
    codeRef.current = null
    sessionRef.current = null

    window.FB.login(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        const code = response?.authResponse?.code
        if (code) {
          codeRef.current = code
          tryComplete()
        }
        // If no code: the user closed the popup or denied — Channel 2 will emit
        // CANCEL/ERROR (handled in the message listener) or nothing happens.
      },
      {
        config_id: CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3' },
      }
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecta un número de WhatsApp Business directamente con Meta. Se abrirá
        una ventana de Meta para autorizar tu cuenta de WhatsApp Business (WABA)
        y el número. Al finalizar, el número queda registrado de forma segura.
        Conectar un número no cambia el proveedor de envío actual de tu
        workspace.
      </p>

      <Button
        onClick={launch}
        disabled={!configReady || !sdkReady || isPending}
        className="w-full"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <MessageCircle className="h-4 w-4 mr-2" />
        )}
        Conectar WhatsApp
      </Button>

      {!configReady && (
        <p className="text-xs text-destructive">
          Falta configurar{' '}
          <code className="px-1 py-0.5 bg-muted rounded">
            NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID
          </code>{' '}
          en Vercel (léelo del panel de Meta App → Embedded Signup).
        </p>
      )}
    </div>
  )
}
