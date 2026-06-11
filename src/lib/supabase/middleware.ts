import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // ÚNICO punto de refresh de sesión de toda la app (auth-hardening Wave 1,
  // FINDINGS-C1). getClaims() verifica el JWT localmente (ES256 vs JWKS
  // cacheado) y solo va a red cuando el access token expiró — ese refresh
  // escribe las cookies nuevas en supabaseResponse vía setAll. NO usar
  // getUser() aquí: era uno de los 3 guards que disparaban
  // AuthSessionMissingError en el ciclo action→revalidate (C-1).
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ?? null

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/auth/confirm',
    '/invite',
    // Marketing routes (Phase 37.5) — bypassed by composed middleware,
    // listed here as defense-in-depth in case updateSession is ever called directly.
    '/',
    '/privacy',
    '/terms',
    '/en',
    '/en/privacy',
    '/en/terms',
  ]

  // Normalize trailing slash for marketing route matching (Vercel sometimes
  // serves URLs with trailing slash that break exact-match — 2026-04-25 fix)
  const rawPath = request.nextUrl.pathname
  const normalizedPath =
    rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath

  const isPublicRoute = publicRoutes.some(
    (route) =>
      normalizedPath === route ||
      request.nextUrl.pathname.startsWith('/auth/') ||
      request.nextUrl.pathname.startsWith('/invite/')
  )

  // Todo redirect emitido por el middleware DEBE llevar las cookies que el
  // refresh dejó en supabaseResponse — el redirect "pelado" a /login era
  // parte del wipe de sesión de C-1 (FINDINGS-C1 §Mecanismo, paso 4).
  const redirectWithCookies = (url: URL) => {
    const response = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // Redirect unauthenticated users to login (except for public routes)
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    // H-5: preservar el destino para volver tras el login. El consumo del
    // param se sanitiza en Wave 2 (safeRedirectPath — solo paths internos).
    const target = request.nextUrl.pathname + request.nextUrl.search
    if (target !== '/') {
      url.searchParams.set('redirect', target)
    }
    return redirectWithCookies(url)
  }

  // Redirect authenticated users away from auth pages (except callbacks/reset)
  const authPages = ['/login', '/signup', '/forgot-password']
  if (user && authPages.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/crm'
    return redirectWithCookies(url)
  }

  return supabaseResponse
}
