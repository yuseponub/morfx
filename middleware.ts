import { type NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { updateSession } from '@/lib/supabase/middleware'
import { validateApiKey, extractApiKey } from '@/lib/auth/api-key'
import { routing } from '@/i18n/routing'

const intlMiddleware = createMiddleware(routing)

// Phase 37.5: Public marketing routes served by next-intl + (marketing) route group.
// Exact-match list (not prefix) to avoid accidentally whitelisting authed /en/* routes later.
const PUBLIC_MARKETING_ROUTES = new Set([
  '/',
  '/en',
  '/privacy',
  '/en/privacy',
  '/terms',
  '/en/terms',
])

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // ==================== PUBLIC MARKETING (Phase 37.5) ====================
  // Bypass Supabase session middleware for marketing pages so unauthenticated
  // visitors (and Meta reviewers) can load / /privacy /terms /en /en/privacy /en/terms.
  // next-intl handles locale detection + rewrites into (marketing)/[locale]/.
  if (PUBLIC_MARKETING_ROUTES.has(pathname)) {
    return intlMiddleware(request)
  }

  // ==================== WEBHOOK ROUTES ====================
  // Allow webhooks to pass through without authentication
  if (pathname.startsWith('/api/webhooks')) {
    return NextResponse.next()
  }

  // ==================== INNGEST ROUTE ====================
  // Inngest Cloud needs direct access for function sync and execution
  if (pathname.startsWith('/api/inngest')) {
    return NextResponse.next()
  }

  // ==================== MANYCHAT DYNAMIC CONTENT ====================
  // ManyChat calls this endpoint from Dynamic Content blocks in Flows
  if (pathname.startsWith('/api/manychat')) {
    return NextResponse.next()
  }

  // ==================== MOBILE API ROUTES ====================
  // Mobile app uses Bearer JWT auth (not cookies), handled by requireMobileAuth()
  // in each route handler. Must bypass the web session middleware.
  if (pathname.startsWith('/api/mobile')) {
    return NextResponse.next()
  }

  // ==================== TEMP ROUTE (DELETE AFTER USE) ====================
  if (pathname.startsWith('/api/temp-send-agendados')) {
    return NextResponse.next()
  }

  // ==================== API TOOL ROUTES ====================
  // Handle /api/v1/tools/* with API key authentication
  // This runs BEFORE the existing session logic
  if (pathname.startsWith('/api/v1/tools')) {
    const authHeader = request.headers.get('authorization')
    const apiKey = extractApiKey(authHeader)

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key', code: 'MISSING_API_KEY' },
        { status: 401 }
      )
    }

    const validation = await validateApiKey(apiKey)

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid API key', code: 'INVALID_API_KEY' },
        { status: 401 }
      )
    }

    // Pass workspace context to route handlers via headers
    const response = NextResponse.next()
    response.headers.set('x-workspace-id', validation.workspaceId!)
    response.headers.set('x-permissions', JSON.stringify(validation.permissions || []))
    response.headers.set('x-api-key-prefix', apiKey.substring(0, 8))

    return response
  }

  // ==================== EXISTING SESSION AUTH ====================
  // Handle session for all other routes (existing behavior from Phase 1-2)
  // DO NOT MODIFY THIS PART - it handles user authentication for the web app
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
