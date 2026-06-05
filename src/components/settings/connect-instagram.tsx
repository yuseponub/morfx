'use client'

// ============================================================================
// Conectar Instagram — dedicated Instagram Login (Page-linked) client component
// (Phase 41 — instagram-direct, Plan 41-08 / Wave 5 — dedicated IG login)
//
// SIBLING of connect-facebook.tsx. Plan 41-08 (D-IG-10/11/12) replaces the old
// no-popup path: this button now launches its OWN FB.login popup requesting the IG
// SUPERSET scope (IG_LOGIN_SCOPE = the 5 FB scopes + instagram_basic +
// instagram_manage_messages) with auth_type:'rerequest', so the previously-absent IG
// scopes are re-prompted. Meta UNIONS the new grant onto the prior Messenger grants —
// it never drops them — so the resulting Page token is a strict superset (Messenger
// keeps working, Regla 6 / D-IG-11). It captures the short-lived USER token and passes
// it to connectInstagramAccount({ accessToken }) (token-flow), which server-side runs
// the Phase 40 token chain, refreshes the canonical Page token with the IG-scoped
// superset, then resolves + persists the linked IG Professional account. Spanish
// success/error toasts (sonner).
//
// Why a dedicated login (NOT the shared FB connect scope — D-IG-10): adding instagram_*
// to the shared FB connect scope would re-introduce the IG-selection screen for ALL FB
// connects (the exact thing Phase 40 deferred) and block FB-only businesses without IG.
// The IG button uses its OWN IG_LOGIN_SCOPE constant — connect-facebook.tsx stays
// byte-identical.
//
// Security:
//   - The browser only ever sees the short-lived USER token it captured (T-41-08-01).
//     The never-expiring Page token is minted + stored entirely server-side in
//     connectInstagramAccount and is never returned/logged. This component never sees
//     nor logs any Page token.
//   - The owner gate is enforced server-side in connectInstagramAccount (T-41-08-02);
//     this button is a thin trigger only.
// ============================================================================

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { connectInstagramAccount } from '@/app/actions/meta-onboarding'
import { Button } from '@/components/ui/button'
import { Instagram, Loader2 } from 'lucide-react'

// Minimal global typing for the injected FB JS SDK (no @types dependency).
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    FB?: any
  }
}

// appId + version MUST match META_GRAPH_API_VERSION (constants.ts:7 = v22.0).
// Same values as connect-facebook.tsx / connect-whatsapp.tsx — all share the one FB
// JS SDK instance. Do NOT bump the version (Q6 Pitfall 3).
const META_APP_ID = '1457229738955828'
const META_SDK_VERSION = 'v22.0'
const FB_SDK_ID = 'facebook-jssdk'

// Plan 41-08 — dedicated IG login. The IG SUPERSET scope = the 5 FB connect-chain scopes
// (pages_show_list, pages_messaging, pages_manage_metadata, business_management,
// pages_read_engagement — so getPageToken / /me/accounts / subscribe still work) PLUS the
// 2 IG scopes instagram_basic + instagram_manage_messages (Q3). Requesting only the IG
// scopes would yield a token missing the page scopes. This is the IG button's OWN
// constant — the FB connect's scope constant is never referenced here (Regla 6 / D-IG-11).
const IG_LOGIN_SCOPE =
  'pages_show_list,pages_messaging,pages_manage_metadata,business_management,pages_read_engagement,instagram_basic,instagram_manage_messages'

export function ConnectInstagram() {
  const [isPending, startTransition] = useTransition()
  const [sdkReady, setSdkReady] = useState(false)

  // Single-channel capture: the short-lived USER ACCESS TOKEN from FB.login.
  // (Token-flow, not code-flow: connectInstagramAccount expects a token and runs
  //  exchangeForLongLivedUserToken on it — the classic-code exchange broke the connect.)
  const tokenRef = useRef<string | null>(null)

  // === Fire the action once the user token has arrived =====================
  const handleConnect = (accessToken: string) => {
    startTransition(async () => {
      const result = await connectInstagramAccount({ accessToken })
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

  // === SDK load (once) — reuses the same loader/SDK as connect-facebook =====
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
      // Script tag exists (connect-whatsapp/connect-facebook injected it) — poll for FB.
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

  // === Launch the dedicated IG FB Login popup ==============================
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
        // If no token: the user closed the popup or denied the permission.
      },
      {
        // Dedicated IG login — request the IG SUPERSET scope. Default response_type
        // returns a short-lived user access token in authResponse; the server action
        // exchanges it long-lived + derives the IG-scoped Page token.
        scope: IG_LOGIN_SCOPE,
        // auth_type:'rerequest' RE-PROMPTS the previously-absent IG scopes (never granted
        // in the FB connect) WITHOUT forcing the page asset-picker — the Page is already
        // connected, so we only need the new IG grant unioned onto the prior grants (Q1).
        // Contingency: if a live popup ever skips the IG re-prompt and getPageToken
        // returns count=0, fall back to auth_type:'reauthorize' (forces full consent
        // incl. the page-picker). Low risk since the page is already connected.
        auth_type: 'rerequest',
      }
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecta la cuenta de Instagram Profesional vinculada a tu página de
        Facebook para atender los mensajes directos de Instagram con Meta. Se
        abrirá una ventana de Meta para autorizar la cuenta de Instagram
        vinculada. Conectar Instagram no cambia el proveedor de envío actual de
        tu workspace.
      </p>

      <Button
        onClick={launch}
        disabled={!sdkReady || isPending}
        className="w-full"
      >
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
