// src/app/(dashboard)/whatsapp/components/inbox-v3-context.tsx
'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Inbox v3 context (standalone ui-redesign-editorial-core, Plan 01).
 *
 * The `v3` flag controls whether the NEW editorial-v3 markup renders — the
 * verbatim port of `ui_kits/conversaciones/index.html` (the `.inbox` 3-column
 * grid, `.conv` rows, `.msg` Helvetica-Neue bubbles, `.ficha` contact card with
 * `.ped-card`). These class strings resolve against the `.theme-editorial-v3`
 * CSS block authored in Plan 00 (globals.css), which Plan 00 wired onto the
 * dashboard `<main>` wrapper gated by `getIsEditorialV3Enabled`.
 *
 * This is a SEPARATE flag/context from `inbox-v2-context` (the LIVE Somnio
 * `.theme-editorial` path under `ui_inbox_v2`). The two coexist by distinct
 * scope class — Regla 6: when v3 is OFF (default), the components render
 * byte-identical to today (either legacy or the v2 editorial path).
 *
 * Default value is `false` so any component rendered outside the
 * InboxV3Provider sees flag-off behavior (fail-closed, Regla 6).
 */

const InboxV3Context = createContext<boolean>(false)

export function InboxV3Provider({
  v3,
  children,
}: {
  v3: boolean
  children: ReactNode
}) {
  return <InboxV3Context.Provider value={v3}>{children}</InboxV3Context.Provider>
}

export function useInboxV3(): boolean {
  return useContext(InboxV3Context)
}
