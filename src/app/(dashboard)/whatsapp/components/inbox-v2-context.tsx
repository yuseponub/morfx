// src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Inbox v2 context (RESEARCH Open Question 2 — Option B: context vs prop drilling).
 *
 * The `v2` flag controls whether NEW JSX renders (eyebrows above titles,
 * editorial day separators, bot ornaments, etc.). Re-skin-only changes
 * (className swaps gated by .theme-editorial CSS scope) do NOT need this
 * context — they happen automatically via the cascade.
 *
 * Use ONLY in client components that need to gate NEW markup based on
 * the flag. Default value is `false` so any component rendered outside
 * the InboxV2Provider sees flag-off behavior (Regla 6 fail-closed).
 */

const InboxV2Context = createContext<boolean>(false)

export function InboxV2Provider({
  v2,
  children,
}: {
  v2: boolean
  children: ReactNode
}) {
  return <InboxV2Context.Provider value={v2}>{children}</InboxV2Context.Provider>
}

export function useInboxV2(): boolean {
  return useContext(InboxV2Context)
}
