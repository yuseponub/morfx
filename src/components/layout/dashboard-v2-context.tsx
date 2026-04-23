// src/components/layout/dashboard-v2-context.tsx
'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Dashboard v2 context.
 *
 * The `v2` flag controls whether NEW JSX renders in dashboard chrome +
 * the 7 module re-skins (eyebrows above titles, editorial badges,
 * smallcaps section headers, etc.). Re-skin-only changes (className
 * swaps gated by .theme-editorial CSS scope) do NOT need this context
 * — they happen automatically via the cascade.
 *
 * Use ONLY in client components that need to gate NEW markup based on
 * the flag. Default value is `false` so any component rendered outside
 * the DashboardV2Provider sees flag-off behavior (Regla 6 fail-closed).
 *
 * Pattern mirrors `InboxV2Provider` / `useInboxV2()` from
 * `src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx`
 * (shipped ui-redesign-conversaciones Plan 01).
 *
 * Lives in `src/components/layout/` (not under a route segment) because
 * it wraps the entire dashboard chrome at `(dashboard)/layout.tsx` and
 * is consumed by sidebar + downstream module components in Waves 1-4.
 */

const DashboardV2Context = createContext<boolean>(false)

export function DashboardV2Provider({
  v2,
  children,
}: {
  v2: boolean
  children: ReactNode
}) {
  return <DashboardV2Context.Provider value={v2}>{children}</DashboardV2Context.Provider>
}

export function useDashboardV2(): boolean {
  return useContext(DashboardV2Context)
}
