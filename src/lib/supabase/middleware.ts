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

  // IMPORTANT: Do not remove auth.getUser() - it validates and refreshes the session
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  // Redirect unauthenticated users to login (except for public routes)
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages (except callbacks/reset)
  const authPages = ['/login', '/signup', '/forgot-password']
  if (user && authPages.includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/crm'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
