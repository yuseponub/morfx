# Phase 1: Foundation & Auth - Research

**Researched:** 2026-01-26
**Domain:** Next.js App Router + Supabase Auth + shadcn/ui
**Confidence:** HIGH

## Summary

This phase establishes the application foundation with Next.js App Router and Supabase authentication. The standard approach uses `@supabase/ssr` for cookie-based authentication that works across Server Components, Client Components, and Middleware. UI components should be generated via v0.dev and integrate with shadcn/ui, which provides accessible, composable components built on Radix UI primitives.

Key architectural decisions are already locked: Next.js 14+ with App Router, Supabase for auth, pnpm as package manager, v0.dev for UI generation, and dark/light mode toggle. The research confirms these are current industry standards with strong documentation and community support.

**Primary recommendation:** Use the Vercel `with-supabase` template as reference, implement cookie-based auth with `@supabase/ssr`, and generate UI components via v0.dev following the established design decisions (minimalist centered auth, fixed sidebar navigation).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 15.x or 16.x | React framework with App Router | Industry standard, Vercel-maintained, SSR support |
| @supabase/supabase-js | ^2.90.1 | Supabase client | Official SDK, 1500+ npm dependents |
| @supabase/ssr | ^0.8.0 | Cookie-based SSR auth | Replaces deprecated auth-helpers, official solution |
| tailwindcss | ^4.0 | Utility-first CSS | De facto standard, v0.dev default |
| next-themes | ^0.4.x | Dark/light mode | Most popular Next.js theming solution |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/* | latest | Accessible UI primitives | Foundation for shadcn/ui components |
| react-hook-form | ^7.x | Form state management | Complex forms with validation |
| zod | ^3.x | Schema validation | Type-safe form validation |
| @hookform/resolvers | ^3.x | Connect zod to react-hook-form | Form validation integration |
| lucide-react | latest | Icon library | Default for shadcn/ui |
| class-variance-authority | latest | Component variants | Used by shadcn/ui |
| clsx + tailwind-merge | latest | Class utilities | Conditional class merging |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Next.js 15 | Next.js 16 | v16 has faster builds (Turbopack default) but breaking changes in async APIs; v15 more stable for new projects |
| @supabase/ssr | @supabase/auth-helpers-nextjs | auth-helpers is DEPRECATED - do not use |
| next-themes | Manual implementation | next-themes handles SSR hydration properly, prevents flash |

**Installation:**
```bash
# Core dependencies
pnpm add @supabase/supabase-js @supabase/ssr next-themes

# shadcn/ui initialization (adds Tailwind, Radix, etc.)
pnpm dlx shadcn@latest init

# Form validation (for auth forms)
pnpm add react-hook-form zod @hookform/resolvers
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Redirects to /login
│   ├── (auth)/                 # Auth route group (no layout nesting)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── reset-password/
│   │       └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts        # Auth callback handler
│   │   └── confirm/
│   │       └── route.ts        # Email confirmation handler
│   ├── (dashboard)/            # Protected route group
│   │   ├── layout.tsx          # Dashboard layout with sidebar
│   │   ├── crm/
│   │   │   └── page.tsx
│   │   ├── whatsapp/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   └── onboarding/
│       └── page.tsx            # Post-registration wizard
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── auth/                   # Auth-specific components
│   ├── layout/                 # Layout components (sidebar, header)
│   └── providers/              # Context providers
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Browser client
│   │   ├── server.ts           # Server client
│   │   └── middleware.ts       # Middleware client
│   └── utils.ts                # Utility functions
├── hooks/                      # Custom React hooks
└── types/                      # TypeScript type definitions
```

### Pattern 1: Supabase Client Factory
**What:** Separate client creation for browser, server, and middleware contexts
**When to use:** Always - required for proper cookie-based auth
**Example:**
```typescript
// lib/supabase/client.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```typescript
// lib/supabase/server.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component - ignore
          }
        },
      },
    }
  )
}
```

### Pattern 2: Middleware for Token Refresh
**What:** Middleware refreshes auth tokens before Server Components render
**When to use:** Always - prevents stale sessions
**Example:**
```typescript
// middleware.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Do NOT use getSession() - use getUser() for security
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login (except auth pages)
  if (!user && !request.nextUrl.pathname.startsWith('/login')
      && !request.nextUrl.pathname.startsWith('/signup')
      && !request.nextUrl.pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Pattern 3: Theme Provider Setup
**What:** next-themes with Tailwind dark mode class strategy
**When to use:** For dark/light mode toggle
**Example:**
```typescript
// components/providers/theme-provider.tsx
// Source: https://ui.shadcn.com/docs/dark-mode/next
'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

```typescript
// app/layout.tsx
import { ThemeProvider } from '@/components/providers/theme-provider'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

### Pattern 4: Auth Callback Route Handler
**What:** Exchange auth code for session after email confirmation
**When to use:** Required for email verification and password reset flows
**Example:**
```typescript
// app/auth/callback/route.ts
// Source: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to error page
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

### Anti-Patterns to Avoid
- **Using `getSession()` on server:** Never trust `getSession()` server-side - always use `getUser()` which validates the JWT
- **Single Supabase client:** Don't create one client for all contexts - use separate browser/server/middleware clients
- **Deprecated auth-helpers:** Do NOT use `@supabase/auth-helpers-nextjs` - it's deprecated and breaks in production
- **Cookie manipulation in Server Components:** Server Components can't set cookies - use middleware or route handlers

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth state management | Custom JWT handling | @supabase/ssr | Token refresh, cookie management, SSR hydration edge cases |
| Dark mode toggle | localStorage + manual class toggle | next-themes | Handles SSR flash, system preference, hydration |
| Form validation | Manual validation | zod + react-hook-form | Type inference, error handling, performance |
| Accessible UI primitives | Custom buttons, inputs, dialogs | shadcn/ui (Radix-based) | ARIA compliance, keyboard navigation, focus management |
| Sidebar navigation | Custom drawer implementation | shadcn/ui Sidebar component | Collapsible states, mobile responsive, accessibility |
| Session persistence | Manual cookie/localStorage | Supabase built-in | Handles refresh tokens, expiration, cross-tab sync |

**Key insight:** Authentication and theming have subtle edge cases (hydration mismatch, cookie handling across SSR/CSR boundaries, FOUC) that well-tested libraries handle correctly.

## Common Pitfalls

### Pitfall 1: Using getSession() Server-Side
**What goes wrong:** Security vulnerability - `getSession()` doesn't validate the JWT signature
**Why it happens:** Seems like the obvious API from client-side experience
**How to avoid:** Always use `getUser()` on server-side which validates the JWT
**Warning signs:** Auth that "works" but doesn't actually secure routes

### Pitfall 2: Hydration Mismatch with Theme
**What goes wrong:** Flash of wrong theme on page load, React hydration warnings
**Why it happens:** Server renders one theme, client hydrates with different preference
**How to avoid:** Use `suppressHydrationWarning` on `<html>`, use next-themes with `disableTransitionOnChange`
**Warning signs:** Console warnings about hydration, visible theme flash on reload

### Pitfall 3: Forgetting Middleware Token Refresh
**What goes wrong:** Users get logged out unexpectedly, session expires mid-use
**Why it happens:** Server Components can't refresh tokens - only middleware can
**How to avoid:** Always implement middleware.ts that calls supabase.auth.getUser()
**Warning signs:** Sessions working briefly then failing, inconsistent auth state

### Pitfall 4: Deprecated Package Usage
**What goes wrong:** Auth breaks in production, session not persisting
**Why it happens:** Using `@supabase/auth-helpers-nextjs` which is deprecated
**How to avoid:** Use `@supabase/ssr` package exclusively
**Warning signs:** Import from `auth-helpers`, outdated tutorial code

### Pitfall 5: Email Template Not Updated for PKCE
**What goes wrong:** Email verification/password reset links don't work
**Why it happens:** Default templates use `{{ .ConfirmationURL }}` which doesn't work with SSR
**How to avoid:** Update templates to use `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
**Warning signs:** Users clicking email links get errors, auth callback receives no code

### Pitfall 6: Missing Protected Route Logic
**What goes wrong:** Unauthenticated users can access dashboard, middleware not blocking
**Why it happens:** Middleware matcher pattern too restrictive, or logic not checking user
**How to avoid:** Test auth flow with incognito window, verify redirect occurs
**Warning signs:** Dashboard visible without login, auth state inconsistent

## Code Examples

Verified patterns from official sources:

### Signup Form with Zod Validation
```typescript
// components/auth/signup-form.tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const signupSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contrasenas no coinciden',
  path: ['confirmPassword'],
})

type SignupFormValues = z.infer<typeof signupSchema>

export function SignupForm() {
  const router = useRouter()
  const supabase = createClient()

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  })

  async function onSubmit(values: SignupFormValues) {
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      form.setError('root', { message: error.message })
      return
    }

    // Redirect to confirmation page or onboarding
    router.push('/onboarding')
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields using shadcn/ui components */}
    </form>
  )
}
```

### Logout Action
```typescript
// app/actions/auth.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

### Protected Layout Pattern
```typescript
// app/(dashboard)/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header user={user} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

## Supabase Auth Configuration

### Email Verification Toggle
**Location:** Supabase Dashboard > Authentication > Providers > Email
**Setting:** "Confirm email" toggle
- **ON (default):** Users must verify email before first login
- **OFF:** Users can login immediately (useful for development/testing)

### Password Reset Flow
1. User requests reset: `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
2. User receives email with link to `/auth/callback?code=...`
3. Callback handler exchanges code for session
4. User redirected to reset-password page
5. Update password: `supabase.auth.updateUser({ password: newPassword })`

### Email Templates (Must Update for SSR)
**Location:** Supabase Dashboard > Authentication > Email Templates

For PKCE flow (required for SSR), update templates:
- **Confirm signup:** Change `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
- **Reset password:** Change `{{ .ConfirmationURL }}` to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

### Custom JWT Claims (For Phase 2 Multi-tenant)
Use Custom Access Token Hook to add `workspace_id` and `role` claims:
1. Create a Postgres function that returns modified JWT
2. Enable hook in Dashboard > Authentication > Hooks
3. Access in RLS: `auth.jwt()->>'workspace_id'`

## v0.dev Workflow

### Recommended Workflow for UI Generation
1. **Prepare prompt:** Describe component in detail including:
   - Purpose and functionality
   - Dark/light mode support
   - Spanish language labels
   - Specific colors (grayscale base, blue/green/red accents)

2. **Generate in v0.dev:** Create component with natural language

3. **Export code:** Click "Add to codebase" or copy code manually

4. **Integrate:**
   - Place in appropriate `components/` directory
   - Adjust imports to match project structure
   - Connect to Supabase auth where needed
   - Test dark/light mode

### v0 Prompt Templates

**Login Form:**
```
Create a minimalist centered login form for a SaaS application called MorfX.
- Card centered on solid/subtle gradient background
- Email and password fields with Spanish labels
- "Iniciar sesion" primary button (blue accent)
- Links: "Olvidaste tu contrasena?" and "Crear cuenta"
- Support dark and light mode
- Use shadcn/ui components
- Grayscale base with subtle mathematical theme
```

**Sidebar Navigation:**
```
Create a fixed left sidebar navigation for a dashboard.
- Always visible on desktop
- Collapsible to icons only
- Three main tabs: CRM, WhatsApp, Settings
- Dark/light mode support
- Mobile: drawer that slides from left (hamburger trigger)
- Spanish labels
- Use shadcn/ui Sidebar components
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| @supabase/auth-helpers-nextjs | @supabase/ssr | 2024 | Single package for all SSR frameworks |
| Pages Router | App Router | Next.js 13+ | Server Components, layouts, new patterns |
| getSession() server-side | getUser() always | 2024 | Security - getUser validates JWT |
| Tailwind darkMode: 'media' | darkMode: 'class' + next-themes | Ongoing | User preference control |
| Custom UI from scratch | v0.dev + shadcn/ui | 2024+ | AI-assisted, accessible components |
| Next.js 14 | Next.js 15/16 | 2024-2025 | Turbopack default, React 19 |

**Deprecated/outdated:**
- `@supabase/auth-helpers-*`: All auth-helpers packages deprecated, use @supabase/ssr
- `getSession()` on server: Security risk, use `getUser()` instead
- Pages Router for new projects: App Router is the standard
- Manual JWT handling: Let Supabase handle token refresh

## Open Questions

Things that couldn't be fully resolved:

1. **Next.js 15 vs 16 for new project**
   - What we know: Next.js 16 has Turbopack stable, faster builds; v15 more mature
   - What's unclear: Breaking changes in async APIs may affect @supabase/ssr compatibility
   - Recommendation: Start with Next.js 15, upgrade to 16 after initial setup verified

2. **Exact shadcn/ui component versions**
   - What we know: shadcn copies source code, not versioned dependencies
   - What's unclear: Which exact Radix versions are used internally
   - Recommendation: Use `pnpm dlx shadcn@latest` for latest stable

3. **Custom JWT claims timing**
   - What we know: Can add workspace_id via Custom Access Token Hook
   - What's unclear: When exactly to add claims (at signup? after onboarding?)
   - Recommendation: Add claims after onboarding wizard creates workspace

## Sources

### Primary (HIGH confidence)
- [Supabase Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) - Official setup guide
- [Supabase Auth Quickstart for Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs) - Official quickstart
- [shadcn/ui Next.js Installation](https://ui.shadcn.com/docs/installation/next) - Official shadcn docs
- [shadcn/ui Dark Mode](https://ui.shadcn.com/docs/dark-mode/next) - Official dark mode setup
- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/sidebar) - Official sidebar docs
- [v0.dev Documentation](https://v0.app/docs) - Official v0 docs
- [next-themes npm](https://www.npmjs.com/package/next-themes) - Official package
- [@supabase/ssr npm](https://www.npmjs.com/package/@supabase/ssr) - Version 0.8.0

### Secondary (MEDIUM confidence)
- [Supabase Troubleshooting Guide](https://supabase.com/docs/guides/troubleshooting/how-do-you-troubleshoot-nextjs---supabase-auth-issues-riMCZV) - Official troubleshooting
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) - Multi-tenant patterns
- [Supabase Password-based Auth](https://supabase.com/docs/guides/auth/passwords) - Password reset flow
- [Next.js Official Docs](https://nextjs.org/docs/app) - App Router documentation

### Tertiary (LOW confidence)
- Various Medium/dev.to articles on Next.js structure - community patterns, not official

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official documentation, npm verified
- Architecture: HIGH - Patterns from official Supabase/Next.js docs
- Pitfalls: HIGH - From official troubleshooting guide and community issues
- v0 workflow: MEDIUM - Official docs exist but workflow is newer

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable stack)
