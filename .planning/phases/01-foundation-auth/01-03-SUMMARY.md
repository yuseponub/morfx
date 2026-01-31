---
phase: 01-foundation-auth
plan: 03
subsystem: navigation
tags: [layout, sidebar, header, navigation, theme, mobile]

dependency-graph:
  requires:
    - 01-01 (Next.js setup, shadcn/ui)
    - 01-02 (Supabase auth, logout action)
  provides:
    - Protected dashboard layout with sidebar navigation
    - Header with user menu and theme toggle
    - Mobile-responsive drawer navigation
    - CRM, WhatsApp, Settings placeholder pages
    - Onboarding placeholder page
  affects:
    - All future dashboard features (Phase 2+) will use this layout
    - CRM pages (Phase 4-5) will replace placeholder
    - WhatsApp pages (Phase 6-7) will replace placeholder

tech-stack:
  added:
    - lucide-react icons (Building2, MessageSquare, Settings, Menu, etc.)
  patterns:
    - Dashboard route group ((dashboard)) for protected layout
    - Client components for navigation state (usePathname)
    - Sheet component for mobile drawer pattern
    - DropdownMenu for user menu and theme toggle

key-files:
  created:
    - src/app/(dashboard)/layout.tsx
    - src/app/(dashboard)/crm/page.tsx
    - src/app/(dashboard)/whatsapp/page.tsx
    - src/app/(dashboard)/settings/page.tsx
    - src/app/onboarding/page.tsx
    - src/components/layout/sidebar.tsx
    - src/components/layout/header.tsx
    - src/components/layout/mobile-nav.tsx
    - src/components/layout/user-menu.tsx
    - src/components/layout/theme-toggle.tsx
    - src/components/ui/dropdown-menu.tsx
    - src/components/ui/avatar.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/sheet.tsx
    - src/components/ui/tooltip.tsx
  modified: []

decisions:
  - id: fixed-sidebar-desktop
    context: "Navigation pattern"
    decision: "Fixed 240px sidebar on desktop, hidden on mobile"
    rationale: "Standard SaaS navigation pattern, responsive"
  - id: drawer-mobile
    context: "Mobile navigation"
    decision: "Sheet/drawer from left triggered by hamburger menu"
    rationale: "Per CONTEXT.md specification for mobile"
  - id: spanish-labels
    context: "UI labels"
    decision: "All navigation labels in Spanish"
    rationale: "Consistent with auth forms, target audience"

metrics:
  duration: ~10 minutes
  completed: 2026-01-27
---

# Phase 01 Plan 03: Application Shell Summary

**One-liner:** Dashboard layout with fixed sidebar navigation (CRM/WhatsApp/Settings), header with theme toggle and user menu, mobile drawer pattern, and placeholder pages for all sections.

## What Was Built

### 1. Dashboard Layout (`(dashboard)/layout.tsx`)
- Protected route with Supabase `getUser` check
- Redirects unauthenticated users to `/login`
- Flex layout: fixed sidebar + flexible main content area
- Passes user object to Header for UserMenu

### 2. Sidebar Navigation (`sidebar.tsx`)
- Fixed 240px width on desktop (`hidden md:flex`)
- MorfX branding at top with logo
- Navigation items with lucide-react icons:
  - CRM (Building2) -> /crm
  - WhatsApp (MessageSquare) -> /whatsapp
  - Configuracion (Settings) -> /settings
- Active state highlighting via `usePathname()`
- Tooltips on navigation items
- Version footer

### 3. Header (`header.tsx`)
- Displays current section name (derives from pathname)
- Search input placeholder (non-functional, UI only)
- ThemeToggle component
- UserMenu component
- MobileNav hamburger button (visible on mobile only)

### 4. Theme Toggle (`theme-toggle.tsx`)
- Dropdown menu with sun/moon icon
- Options: Claro (light), Oscuro (dark), Sistema (system)
- Uses next-themes `setTheme` hook
- Accessible button with screen reader text

### 5. User Menu (`user-menu.tsx`)
- Avatar with user initial from email
- Dropdown menu contents:
  - User email display
  - Link to Settings
  - Logout button (form action)
- Uses logout action from `@/app/actions/auth`

### 6. Mobile Navigation (`mobile-nav.tsx`)
- Sheet/drawer pattern from shadcn/ui
- Triggered by hamburger Menu icon
- Same navigation items as Sidebar
- Auto-closes on navigation via `setOpen(false)`
- Only visible on mobile (`md:hidden`)

### 7. Dashboard Pages (Placeholders)
- `/crm` - CRM placeholder with coming soon message
- `/whatsapp` - WhatsApp inbox placeholder
- `/settings` - Configuration placeholder
- All use consistent card/border styling

### 8. Onboarding Page
- Welcome message with MorfX branding
- Button to continue to dashboard
- Protected route (requires auth)
- Phase 2 will implement full wizard

## Task Completion

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create dashboard layout with sidebar and header | f08b9bc | (dashboard)/layout.tsx, sidebar.tsx, header.tsx, theme-toggle.tsx, user-menu.tsx, mobile-nav.tsx |
| 2 | Create dashboard pages and mobile navigation | 93dcbc5 | crm/page.tsx, whatsapp/page.tsx, settings/page.tsx |
| 3 | Create onboarding page placeholder | 1249d08 | onboarding/page.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `pnpm build` passes without errors
- All dashboard routes appear in route tree (/crm, /whatsapp, /settings, /onboarding)
- Dashboard layout contains `getUser` check (line 12)
- Sidebar has Link components with correct hrefs
- UserMenu imports logout action and uses form action
- ThemeToggle calls setTheme with light/dark/system
- Mobile nav uses Sheet component with hamburger trigger
- Line counts: sidebar.tsx (91 lines), header.tsx (67 lines)

## Success Criteria Met

- [x] Application shell displays with fixed left sidebar
- [x] Sidebar shows CRM, WhatsApp, Settings navigation items
- [x] Header shows current section, theme toggle, and user menu
- [x] User can navigate between all three sections
- [x] User can logout from user menu dropdown
- [x] User can toggle dark/light mode
- [x] Mobile view shows drawer navigation (hamburger menu)
- [x] Protected routes redirect unauthenticated users to /login
- [x] All UI uses Spanish labels

## Next Phase Readiness

**Ready for Phase 2 (Workspace & Team):**
- Dashboard layout complete
- Navigation structure in place
- Theme toggle functional
- User menu with logout working

**Phase 1 Complete:**
- All 3 plans (01-01, 01-02, 01-03) finished
- Foundation layer fully operational:
  - Next.js + Supabase + shadcn/ui setup
  - Auth flows (login, signup, password reset)
  - Application shell with navigation

## Files Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx (protected layout)
│   │   ├── crm/
│   │   │   └── page.tsx (placeholder)
│   │   ├── whatsapp/
│   │   │   └── page.tsx (placeholder)
│   │   └── settings/
│   │       └── page.tsx (placeholder)
│   └── onboarding/
│       └── page.tsx (welcome page)
└── components/
    └── layout/
        ├── sidebar.tsx (desktop nav)
        ├── header.tsx (top bar)
        ├── mobile-nav.tsx (drawer nav)
        ├── user-menu.tsx (avatar + dropdown)
        └── theme-toggle.tsx (light/dark/system)
```
