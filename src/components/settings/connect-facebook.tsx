'use client'

// ============================================================================
// Conectar Facebook — Facebook Login (Page connect) client component
// (Phase 40 — facebook-messenger-direct, Plan 40-07 / Wave 4)
//
// Loads the Facebook JS SDK (reusing the same loader as connect-whatsapp.tsx),
// launches a CLASSIC Facebook Login popup via `FB.login` requesting
// `pages_messaging` (+ the IG messaging scope for D-02 forward-compat), and on
// success calls the owner-gated `connectFacebookPage` server action (Plan 03)
// with the returned auth `code`. Shows Spanish success/error toasts (sonner).
//
// DIVERGENCE from connect-whatsapp.tsx (RESEARCH §Page connect):
//   - NO Embedded-Signup config / sessionInfoVersion — this is classic FB Login
//     with a `scope` string, NOT WhatsApp Embedded Signup.
//   - NO Channel-2 `window 'message'` listener — Page connect has no
//     WABA/phone_number_id postMessage. Only the auth `code` from the callback
//     matters; the server exchanges it (response_type:'code', A1).
//   - D-02: the IG scope is additive forward-compat. If the business has no IG
//     linked, Meta grants only `pages_messaging` (graceful no-op). The FB connect
//     MUST succeed regardless of the IG scope outcome — the IG scope is NEVER
//     allowed to block the FB flow.
//
// Security:
//   - The browser only ever sees an auth `code` (response_type:'code'). The
//     code→token exchange (and the never-expiring Page token) stay entirely
//     server-side in connectFacebookPage (T-40-07-01). This component never
//     sees nor logs any token.
//   - The owner gate is enforced server-side in connectFacebookPage
//     (T-40-07-02); this button is convenience only.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { connectFacebookPage } from '@/app/actions/meta-onboarding'
import { Button } from '@/components/ui/button'
import { Facebook, Loader2 } from 'lucide-react'

// Minimal global typing for the injected FB JS SDK (no @types dependency).
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FB?: any
  }
}

// appId + version MUST match META_GRAPH_API_VERSION (constants.ts:7 = v22.0).
// Same values as connect-whatsapp.tsx — both share the one FB JS SDK instance.
const META_APP_ID = '1457229738955828'
const META_SDK_VERSION = 'v22.0'
const FB_SDK_ID = 'facebook-jssdk'

// Phase 40 — SOLO Facebook Messenger. Los 3 scopes que el flujo de connect
// REALMENTE necesita (descubierto en el smoke 40-08):
//   - pages_show_list     → GET /me/accounts debe LISTAR las páginas y entregar
//                           su Page Access Token. Sin esto /me/accounts vuelve
//                           VACÍO ("me/accounts returned no Page with an access_token").
//   - pages_messaging     → enviar/recibir mensajes de Messenger.
//   - pages_manage_metadata → POST /{pageId}/subscribed_apps (suscribir la página
//                           al webhook). Sin esto el paso 5 (subscribe) falla.
// Los scopes IG (instagram_*) se difieren 100% a la Fase 41 (D-02 revisado): pedirlos
// hoy no aporta nada (no hay código IG) e intercala una pantalla que bloquea a
// usuarios sin IG (botón Continuar deshabilitado, sin opción "no conectar IG").
const FB_LOGIN_SCOPE =
  'pages_show_list,pages_messaging,pages_manage_metadata,business_management,pages_read_engagement'

export function ConnectFacebook() {
  const [isPending, startTransition] = useTransition()
  const [sdkReady, setSdkReady] = useState(false)

  // Single-channel capture: the short-lived USER ACCESS TOKEN from FB.login.
  // (Token-flow, not code-flow: exchangeForLongLivedUserToken expects a token,
  //  and this avoids the classic-code redirect_uri exchange that broke the connect.)
  const tokenRef = useRef<string | null>(null)

  // === Fire the action once the user token has arrived =====================
  const handleConnect = (accessToken: string) => {
    startTransition(async () => {
      const result = await connectFacebookPage({ accessToken })
      if (result.success) {
        toast.success(`Página de Facebook conectada: ${result.pageName}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  // === SDK load (once) — reuses the same loader/SDK as connect-whatsapp ====
  useEffect(() => {
    const initFb = () => {
      try {
        window.FB?.init({
          appId: META_APP_ID,
          version: META_SDK_VERSION,
          xfbml: false,
        })
        setSdkReady(true)
      } catch {
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
      // Script tag exists (connect-whatsapp injected it) — poll briefly for window.FB.
      const t = setInterval(() => {
        if (window.FB) {
          clearInterval(t)
          initFb()
        }
      }, 200)
      setTimeout(() => clearInterval(t), 5000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Launch the classic FB Login popup (Page connect) ====================
  const launch = () => {
    if (!window.FB) {
      toast.error('El SDK de Facebook aún no cargó. Intenta de nuevo.')
      return
    }

    // Reset any stale capture before launching a fresh popup.
    tokenRef.current = null

    window.FB.login(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        const accessToken = response?.authResponse?.accessToken
        if (accessToken) {
          tokenRef.current = accessToken
          handleConnect(accessToken)
        }
        // If no token: the user closed the popup or denied the FB permission.
      },
      {
        // Classic FB Login — scope-based (no Embedded-Signup config). Default
        // response_type returns a short-lived user access token in authResponse;
        // the server action exchanges it long-lived + derives the Page token.
        scope: FB_LOGIN_SCOPE,
        // auth_type:'reauthorize' FORCES the full consent incl. the Page asset
        // picker every time (40-08 live bug: a cached authorization showed only
        // "reconectar" and SKIPPED page selection → the app held the scopes but
        // had NO Page granted → /me/accounts returned count=0). Re-showing the
        // picker lets the user actually select the Page to connect.
        auth_type: 'reauthorize',
      }
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecta una página de Facebook para atender los mensajes de Messenger
        directamente con Meta. Se abrirá una ventana de Meta para autorizar tu
        página y el permiso de mensajería. Al finalizar, la página queda
        registrada de forma segura. Conectar una página no cambia el proveedor
        de envío actual de tu workspace.
      </p>

      <Button
        onClick={launch}
        disabled={!sdkReady || isPending}
        className="w-full"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Facebook className="h-4 w-4 mr-2" />
        )}
        Conectar Facebook
      </Button>
    </div>
  )
}
