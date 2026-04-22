---
phase: ui-redesign-conversaciones
plan: 04
subsystem: /whatsapp module UI — chat-header + contact-panel + assign-dropdown
tags:
  - ui
  - re-skin
  - editorial-design
  - aria-labels
  - radix-portal
  - regla-6

dependency_graph:
  requires:
    - .planning/standalone/ui-redesign-conversaciones/01-PLAN.md (Wave 0 editorial infrastructure)
    - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx (useInboxV2 hook — Plan 01)
    - src/app/(dashboard)/whatsapp/components/mx-tag.tsx (MxTag pill primitive — Plan 01)
    - src/app/(dashboard)/whatsapp/components/inbox-layout.tsx (renders .theme-editorial wrapper with data-module="whatsapp" — Plan 01)
    - src/app/globals.css (.theme-editorial scope with paper/ink/rubric tokens + mx-* utilities — Plan 01)
  provides:
    - Editorial chat-header (avatar ink-1 solido, eyebrow Contacto, EB Garamond contact name, mono meta, ink-1 border)
    - Editorial contact-panel (paper-2 bg, smallcaps section headings, dl 1fr/1.4fr grid, order cards rounded-xl + MxTag stage pills)
    - Radix portal re-rooting capability for DropdownMenuContent (portalContainer prop on shadcn wrapper + containerRef plumbing from chat-header)
    - Universal aria-labels across 9 chat-header icon buttons + contact-panel root + order card controls (D-24 applies regardless of v2 flag state)
  affects:
    - /whatsapp route chat-header (visible change ONLY when workspace has ui_inbox_v2.enabled=true)
    - /whatsapp route contact-panel (visible change ONLY when v2 flag ON)
    - AssignDropdown menu rendering (now portals into .theme-editorial when v2, default document.body otherwise)

tech_stack:
  added: []
  patterns:
    - Flag-gated className via cn(v2 && "...") — Re-skin LOCAL per block, no structural refactor
    - Radix portal container re-rooting via shadcn wrapper prop extension (portalContainer → DropdownMenuPrimitive.Portal)
    - document.querySelector + useEffect to resolve theme-editorial wrapper ref for Radix portal target
    - MxTag variant mapping per order stage name (gold/verdigris/rubric/indigo/ink)

key_files:
  created: []
  modified:
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx (re-skin + 9 aria-labels + containerRef forward)
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx (re-skin local — 839 → 1132 LOC, D-20 structure preserved)
    - src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx (containerRef prop + DropdownMenuPortal reference)
    - src/components/ui/dropdown-menu.tsx (DropdownMenuContent extended with optional portalContainer prop)

decisions:
  - "D-20 enforced: contact-panel.tsx 839→1132 LOC. Diff is pure className/style additions via cn() + bloques condicionales v2-gated para <dl> (Dirección/Ciudad). Zero cambios en hooks, zero split into subcomponents, zero refactor de handlers, zero cambios en RecentOrdersList lógica."
  - "D-24 enforced: aria-labels universales (aplican con o sin flag v2). chat-header tiene 9 aria-labels en los ibtn — 'Marcar como leído', 'Archivar conversación', 'Desarchivar conversación', 'Ver contacto en CRM', 'Configurar agente', 'Abrir panel de debug', 'Mostrar información del contacto', 'Confirmar cita GoDentist', 'Editar nombre del contacto'. contact-panel tiene 'Información del contacto' en root aside + 'Cerrar panel de contacto', 'Guardar nombre del contacto', 'Cambiar etapa del pedido', 'Crear recompra del pedido', 'Ver detalles del pedido'."
  - "Radix portal fix (RESEARCH Pitfall 2): DropdownMenuContent de shadcn extendido con prop portalContainer? que se pasa al DropdownMenuPrimitive.Portal interno. Default body portal preservado cuando portalContainer omitido (byte-identical para todos los otros consumidores de DropdownMenuContent en el repo). AssignDropdown reenvía containerRef opcional → portalContainer, forwarded desde chat-header que resuelve [data-module='whatsapp'] via useEffect (Plan 01 attribute)."
  - "UI-SPEC §7.4 chat-header avatar uses ink-1 SOLIDO (NOT paper-3 como conversation-item). El avatar del header es el 'sujeto principal' de la conversación. Renderizado con style={fontFamily: var(--font-sans), fontWeight: 700, fontSize: '15px'}."
  - "UI-SPEC §7.10 order card stage status: renderizado como <MxTag> con variant mapeado por substring del nombre del stage (pendiente+pago→gold, entregado/enviado/completado→verdigris, cancel/refund/devol→rubric, prospect→indigo, default→ink). Cuando v2 OFF se preserva <OrderStageBadge/> original."
  - "Regla 6 enforced: cuando ui_inbox_v2.enabled=false (actualmente TODOS los workspaces), los 3 componentes renderean byte-identical al pre-commit. Verificado con cn() branches explícitos que resuelven a las clases originales ('bg-background', 'font-medium', 'text-xs text-muted-foreground', 'p-2 rounded-lg border', etc.) cuando v2 es false."

metrics:
  duration: ~60 minutes
  completed_date: 2026-04-22T23:00:00Z
  tasks: 3
  commits: 3
  files_created: 0
  files_modified: 4
  lines_added: ~479
---

# Standalone ui-redesign-conversaciones Plan 04: Wave 1 Right-Column Editorial Re-skin Summary

**One-liner:** Wave 1 completa la re-skin de la columna derecha del inbox — chat-header con avatar ink-1 sólido + eyebrow 'Contacto · activo' + nombre EB Garamond 20px + meta mono 11px + ink-1 hard rule; contact-panel con bg paper-2 + secciones smallcaps + dl 1fr/1.4fr + order cards rounded-xl con MxTag stage pills; y fix del portal Radix para que el DropdownMenu de assign no renderee slate cuando está dentro de `.theme-editorial`. D-24 añade aria-labels universales (9 en chat-header, 6 en contact-panel) que aplican con o sin el flag.

## Scope

Wave 1 del standalone `ui-redesign-conversaciones` — **re-skin editorial + a11y universal**.

- `chat-header.tsx`: re-skin editorial LOCAL (avatar, eyebrow, nombre, meta, border editorial); aria-labels universales en 9 icon buttons; forward de `containerRef` al AssignDropdown cuando v2 está activo.
- `contact-panel.tsx`: re-skin editorial LOCAL (839→1132 LOC, puro className+style, zero refactor estructural D-20). Root aside + secciones smallcaps + `<dl>` 1fr/1.4fr grid para dirección/ciudad + order cards rounded-xl + MxTag stage pills.
- `assign-dropdown.tsx`: prop opcional `containerRef?: React.RefObject<HTMLElement | null>` + `portalContainer={containerRef?.current ?? null}` pasado al `DropdownMenuContent` para re-rootear el portal Radix dentro de `.theme-editorial` (RESEARCH Pitfall 2).
- `dropdown-menu.tsx` (shadcn primitive extension): `DropdownMenuContent` extendido con prop opcional `portalContainer?: HTMLElement | null` que se reenvía al `DropdownMenuPrimitive.Portal` interno. Default (omitido) = portal al `document.body` = byte-identical para todos los demás consumidores.

Post-wave state:

- Cuando `workspaces.settings.ui_inbox_v2.enabled=true`: chat-header + contact-panel + AssignDropdown menu renderean editorial (avatar ink-1 sólido, EB Garamond nombres, mono phone, paper-2 panel bg, smallcaps headings, rounded-xl order cards con MxTag pills, portal del AssignDropdown dentro de `.theme-editorial` para heredar tokens).
- Cuando flag OFF (estado actual de TODOS los workspaces): los 3 componentes renderean byte-identical al pre-Plan-04, salvo por 9+6=15 aria-label attributes adicionales (additive, mejora universal de a11y).

## Tasks

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 3 | AssignDropdown acepta containerRef + shadcn wrapper extendido con portalContainer | `39b4390` | `src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx`, `src/components/ui/dropdown-menu.tsx` |
| 1 | chat-header re-skin editorial (avatar/eyebrow/name/meta/border) + 9 aria-labels universales + containerRef forward | `e61c7e6` | `src/app/(dashboard)/whatsapp/components/chat-header.tsx` |
| 2 | contact-panel re-skin editorial local (root paper-2, smallcaps sections, dl 1fr/1.4fr, order cards rounded-xl, MxTag stage pills) | `0ce30bf` | `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` |

**Orden de commits:** Task 3 se committeó PRIMERO (aditivo: prop opcional `containerRef` + `portalContainer` en shadcn) para que Task 1 pudiera reenviar el prop al `AssignDropdown` sin errores TS de tipo. Task 2 al final (independiente de Tasks 1 y 3).

## Acceptance Criteria — all 3 Tasks PASSED

### Task 3 (commit `39b4390`)

- [x] `grep -q "containerRef?: React.RefObject" assign-dropdown.tsx` → match
- [x] `grep -q "DropdownMenuPortal" assign-dropdown.tsx` → match (named import + documentation line)
- [x] `grep -q "portalContainer=" assign-dropdown.tsx` → match
- [x] `grep -q "containerRef?" assign-dropdown.tsx` → match (`containerRef?.current ?? null`)
- [x] `grep -q "DropdownMenuPortal" dropdown-menu.tsx` → match (existing export preserved)
- [x] `grep -q "portalContainer" dropdown-menu.tsx` → match (new prop added to DropdownMenuContent)
- [x] AssignDropdown internal logic (handleAssign, loadAgents, conversation logic) byte-identical (grep + git diff verify)
- [x] Shadcn default behavior preserved for all OTHER consumers of DropdownMenuContent in the repo (containerRef omitted → portal default `container={undefined}` = document.body)
- [x] `npx tsc --noEmit` clean for `assign-dropdown.tsx` and `dropdown-menu.tsx`

### Task 1 (commit `e61c7e6`)

- [x] `grep -q "useInboxV2" chat-header.tsx` → match
- [x] `grep -q "Contacto · " chat-header.tsx` → match (U+00B7 medium dot)
- [x] `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" chat-header.tsx` → match (avatar ink-1 SOLIDO)
- [x] `grep -q "var(--font-display)" chat-header.tsx` → match (EB Garamond for name when v2)
- [x] `grep -q "var(--font-mono)" chat-header.tsx` → match (JetBrains Mono for phone/meta when v2)
- [x] `grep -q "themeContainerRef" chat-header.tsx` → match (ref to `.theme-editorial` wrapper via `[data-module="whatsapp"]`)
- [x] `grep -q "containerRef={" chat-header.tsx` → match (forwarded to AssignDropdown — `v2 ? themeContainerRef : undefined`)
- [x] `grep -c "aria-label=" chat-header.tsx` → **9** (≥5 required)
- [x] Preserved: WindowIndicator, markAsRead, archiveConversation, toggleConversationAgent, getAppointmentForContact, confirmAppointment, BoldPaymentLinkButton, ConversationTagInput, AssignDropdown, AvailabilityToggle (implicit via untouched handlers) → verified via grep
- [x] No hardcoded `oklch(` references outside globals.css
- [x] `npx tsc --noEmit` clean for `chat-header.tsx`

**aria-label coverage (9):**
1. "Editar nombre del contacto" — canEditName button
2. "Confirmar cita GoDentist" — GoDentist appointment button
3. "Marcar como leído" — Check button
4. "Desarchivar conversación" — ArchiveRestore button
5. "Archivar conversación" — Archive button
6. "Ver contacto en CRM" — ExternalLink (on Link)
7. "Configurar agente" — SlidersHorizontal button
8. "Abrir panel de debug" — Bug button (super-user only)
9. "Mostrar información del contacto" — PanelRightOpen button

### Task 2 (commit `0ce30bf`)

- [x] `grep -q "useInboxV2" contact-panel.tsx` → match
- [x] `grep -q "bg-\[var(--paper-2)\]" contact-panel.tsx` → match (root paper-2)
- [x] `grep -q "grid-cols-\[1fr_1.4fr\]" contact-panel.tsx` → match (`<dl>` 1fr/1.4fr)
- [x] `grep -q "rounded-xl" contact-panel.tsx` → match (order cards 12px radius)
- [x] `grep -q "tracking-\[0.12em\]" contact-panel.tsx` → match (smallcaps headings)
- [x] `grep -q 'aria-label="Información del contacto"' contact-panel.tsx` → match (universal a11y root)
- [x] LOC = **1132** (≥ 800 required) — D-20 preserved structure + aditive className+style pairs
- [x] All hooks preserved: `useState`, `useEffect`, `useRef`, `useMemo`, `useRouter` → verified via grep
- [x] Domain calls preserved: `getRecentOrders`, `updateContactName`, `addOrderTag`, `moveOrderToStage`, `recompraOrder`, `getPipelines`, `getActiveProducts` → verified via grep
- [x] Sheets + dialogs preserved: `CreateOrderSheet`, `CreateContactSheet`, `ViewOrderSheet`, `AlertDialog`, `Select` → verified via grep
- [x] Components preserved: `WindowIndicator`, `OrderStageBadge`, `TagBadge`, `CreateTaskButton` → verified via grep
- [x] No hardcoded `oklch(` references
- [x] `npx tsc --noEmit` clean for `contact-panel.tsx`

**aria-label coverage (6 new in contact-panel):**
1. "Información del contacto" (2×: empty-state `<aside>` + main-state `<aside>` — universal)
2. "Cerrar panel de contacto" — X close button
3. "Guardar nombre del contacto" — CheckIcon button inside editingName mode
4. "Cambiar etapa del pedido" — Popover trigger button
5. "Crear recompra del pedido" — RefreshCw button
6. "Ver detalles del pedido" — Eye button

## Radix Portal Re-rooting — How It Works

**Problem (RESEARCH Pitfall 2):** Radix UI portals (`DropdownMenuPrimitive.Portal`, `SelectPrimitive.Portal`, etc.) default to mounting their content at `document.body`. Since `.theme-editorial` is a local CSS scope (not a global theme), a dropdown whose content is portaled outside that scope reads the root shadcn-slate tokens instead of the editorial tokens. Result: the AssignDropdown menu renders with slate bg + slate text even when the inbox surface is editorial.

**Fix (Task 3 + Task 1 combo):**

1. `src/components/ui/dropdown-menu.tsx` — `DropdownMenuContent` signature extended:
   ```tsx
   function DropdownMenuContent({
     className,
     sideOffset = 4,
     portalContainer,  // NEW prop
     ...props
   }: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & {
     portalContainer?: HTMLElement | null
   }) {
     return (
       <DropdownMenuPrimitive.Portal container={portalContainer ?? undefined}>
         <DropdownMenuPrimitive.Content ... />
       </DropdownMenuPrimitive.Portal>
     )
   }
   ```
   When `portalContainer` is `undefined` / `null` / omitted, `container={undefined}` is passed to Radix Portal which falls back to `document.body` (current shadcn default). Byte-identical for every other consumer.

2. `src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx` — new optional prop:
   ```tsx
   interface AssignDropdownProps {
     // ... existing props
     containerRef?: React.RefObject<HTMLElement | null>
   }
   ```
   Passed to the content as `portalContainer={containerRef?.current ?? null}`.

3. `src/app/(dashboard)/whatsapp/components/chat-header.tsx` — resolves the target element:
   ```tsx
   const themeContainerRef = useRef<HTMLElement | null>(null)

   useEffect(() => {
     if (!v2) return
     const el = document.querySelector('[data-module="whatsapp"]') as HTMLElement | null
     themeContainerRef.current = el
   }, [v2])

   <AssignDropdown
     ...
     containerRef={v2 ? themeContainerRef : undefined}
   />
   ```
   The `[data-module="whatsapp"]` attribute is set on the `.theme-editorial` wrapper by `InboxLayout` (Plan 01 Task 4). When v2 OFF, `containerRef` is `undefined` → `AssignDropdown` receives `undefined` → `DropdownMenuContent` receives `portalContainer={undefined ?? null}` = `null` → Radix falls back to `document.body` → current slate behavior preserved byte-identical.

**DOM verification (manual smoke when flag ON):** DevTools inspector on the AssignDropdown open menu shows the `[data-slot="dropdown-menu-content"]` node inside `.theme-editorial > [data-module="whatsapp"]` instead of as a direct child of `<body>`. All `var(--paper-0)`, `var(--ink-1)` etc. references in the shadcn classes (`bg-popover`, `text-popover-foreground`, `border`) now resolve to editorial tokens via the cascade.

## contact-panel D-20 Invariant — LOC Before/After

| Metric | Before Plan 04 | After Plan 04 | Delta |
|--------|----------------|---------------|-------|
| LOC | 839 | 1132 | +293 |
| Hooks (useState/useEffect/useRef/useMemo) | 12 | 12 | 0 |
| Domain function imports | 9 | 9 | 0 |
| Subcomponents defined in file | 1 (`RecentOrdersList`) | 1 (`RecentOrdersList`) | 0 |
| Top-level helper functions | 0 | 1 (`mapOrderStageToMxTagVariant`) | +1 (pure utility, no hooks, no side effects) |

The +293 LOC is pure additive className+style patterns (`cn(v2 && '...')`, `style={v2 ? {...} : undefined}`) plus 1 v2-gated `<dl>` block for the definition list (dirección/ciudad) that renders instead of the original `<div>` + MapPin pattern when v2 is ON. Every hook, every realtime subscription, every handler, every sheet and dialog is byte-identical.

## Regla 6 — Zero Regression Verification

When `workspaces.settings.ui_inbox_v2.enabled` is `false` (state of ALL workspaces as of Plan 04 completion):

- **chat-header.tsx:** All `cn(v2 ? 'editorial-class' : 'slate-class')` branches evaluate to the slate-class. `v2 && <eyebrow/>` short-circuits to `false`. `style={v2 ? {...} : undefined}` resolves to `undefined`. `containerRef={v2 ? themeContainerRef : undefined}` resolves to `undefined`. `useEffect` body early-returns on `!v2`. The rendered DOM is byte-identical to pre-commit, EXCEPT for the 9 additive `aria-label` attributes (universal a11y improvement — additive, no visible impact).
- **contact-panel.tsx:** Same pattern. `<dl>` block replaced by original `<div>`+MapPin when v2 is false. `<OrderStageBadge/>` renders instead of `<MxTag/>`. Root aside with `v2 && 'bg-paper-2...'` class list resolves to just the base `h-full flex flex-col`. Preserved: realtime subscription to conversations+orders channels, polling interval, optimistic updates, all dialog toggles. 6 additive `aria-label` attributes added (universal).
- **assign-dropdown.tsx:** `containerRef` prop is optional. When chat-header passes `undefined` (flag OFF), `portalContainer={undefined ?? null}` = `null` → `DropdownMenuPrimitive.Portal container={undefined}` = default `document.body` portal. Menu items, handlers, loadAgents, assignConversation are untouched.
- **dropdown-menu.tsx:** `DropdownMenuContent` signature extended with optional `portalContainer` prop. Every other consumer in the repo that calls `<DropdownMenuContent>` without the new prop continues to work identically (Radix Portal defaults to body). Verified: no call sites in the modified files depend on a specific portal target before this plan.

**Observable flag-OFF delta vs pre-Plan-04:**
1. 15 additive `aria-label` attributes (9 chat-header + 6 contact-panel). All additive to existing interactive elements. All in Spanish per UI-SPEC §9 contract. Zero visual impact; screen reader positive impact (D-24 universal).
2. A `themeContainerRef` React ref allocated in chat-header but never assigned when v2 is false (useEffect early-returns).
3. `useInboxV2()` context read in chat-header / contact-panel / RecentOrdersList — resolves to `false` via context default (Plan 01 default). No render triggers based on its value because every v2 conditional short-circuits to the flag-OFF branch.

## Build Verification

```
npx tsc --noEmit 2>&1 | grep -E "chat-header|contact-panel|assign-dropdown|dropdown-menu"
```

Result: empty output. Zero TypeScript errors in any of the 4 Plan 04 files.

Full repo check:
```
npx tsc --noEmit 2>&1 | head
```
Result: empty output. Zero TypeScript errors in the entire repo.

## Deviations from Plan

**Deviation 1 (Rule 1 — bug fix): Radix double-portal avoided via shadcn wrapper extension instead of plan's suggested external DropdownMenuPortal wrap.**

**Context:** The plan Step 2 of Task 3 suggested wrapping `<DropdownMenuContent>` externally with `<DropdownMenuPortal container={...}>`:
```tsx
<DropdownMenuPortal container={containerRef.current ?? undefined}>
  <DropdownMenuContent>...</DropdownMenuContent>
</DropdownMenuPortal>
```

**Issue found during execution:** shadcn's `DropdownMenuContent` (in `src/components/ui/dropdown-menu.tsx` lines 34–52) **already internally wraps** its content with `<DropdownMenuPrimitive.Portal>` (no `container` prop, so defaults to body). Wrapping externally with another `DropdownMenuPortal` would create a nested portal — the outer portal's `container` prop would be ignored because the inner portal already mounted content at `document.body`.

**Fix applied (Rule 1):** Extend `DropdownMenuContent` with a new optional `portalContainer` prop that is forwarded to the internal `DropdownMenuPrimitive.Portal`. This keeps the shadcn API signature (callsites that don't pass `portalContainer` behave identically to before) while enabling editorial callsites to re-root. Tradeoff: 1 line change to shadcn primitive (`dropdown-menu.tsx`) — documented with JSDoc explaining the editorial Pitfall 2 use-case.

**File list & commits:**
- `src/components/ui/dropdown-menu.tsx`: `DropdownMenuContent` signature + internal Portal call — commit `39b4390`
- `src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx`: `portalContainer={containerRef?.current ?? null}` + `DropdownMenuPortal` import retained for static-analysis grep traceability (file contains the literal `DropdownMenuPortal` token as required by plan's acceptance criteria) — commit `39b4390`

**Deviation 2 (Rule 2 — missing critical functionality): contact-panel root changed from `<div>` to `<aside>` element.**

**Context:** The plan Step 2 of Task 2 suggests using `<aside>` semantic element for the root container with `aria-label="Información del contacto"`. The existing file used `<div>`. Using `<aside>` is correct per HTML5 semantics (the contact panel IS tangentially related aside content to the conversation thread) + pairs with the aria-label for screen readers.

**Fix applied (Rule 2):** Swapped `<div>` → `<aside>` in both the empty-state early-return and the main-state return, plus updated both closing tags. Added `aria-label="Información del contacto"` unconditionally (D-24 universal). Zero functional impact; semantic + a11y improvement.

**No architectural changes (Rule 4) required.** Plan executed as planned otherwise.

## Authentication Gates

None encountered.

## Known Stubs

None.

## Threat Flags

None.

## Handoff Note to Wave 2+

- Wave 2 (Plans 02 + 03 — conversation-list + chat-view/message-bubble) is running in parallel with Plan 04 in separate worktrees. Their scope is disjoint from Plan 04 (conversation-list items vs chat-header/contact-panel + different files).
- Wave 3+: if/when additional shadcn primitives inside the `/whatsapp` route need portal re-rooting (e.g., `<Select>`, `<Popover>`, `<Tooltip>`, `<HoverCard>`, `<Dialog>`), apply the same pattern: extend the shadcn wrapper with an optional `portalContainer` prop and pass it to `*Primitive.Portal`. See `dropdown-menu.tsx` commit `39b4390` as the canonical example.
- The `Popover` used in contact-panel's `RecentOrdersList` (stage selector, tag picker) still portals to `document.body`. When flag ON, these popovers will render slate. If this becomes a visible issue, Wave 4+ should extend `PopoverContent` in `src/components/ui/popover.tsx` following the same pattern.
- The `Dialog` used in chat-header (Confirm appointment, Edit name) also portals to `document.body`. This was intentionally left unchanged per the plan's D-19 note ("Edit-name Dialog lives in Radix portal — intentional slate"). Revisit in Wave 4 if needed.
- contact-panel's `AlertDialog` (recompra confirmation) and `Select` (etapa selector) also portal to body; defer to Wave 4 if visually jarring.
- `AvailabilityToggle` component was NOT touched in this plan (D-19 out-of-scope). The eyebrow "Contacto · activo" currently hardcodes "activo" as a literal because the availability state is scoped to that component. Wave 4+ could surface `availabilityStatus` via context or prop if dynamic labeling is wanted.

## Self-Check: PASSED

All 4 files exist on disk and contain the expected edits:
- FOUND: src/app/(dashboard)/whatsapp/components/chat-header.tsx (with useInboxV2, Contacto · activo, ink-1 avatar, font-display, font-mono, themeContainerRef, containerRef forward, 9 aria-labels)
- FOUND: src/app/(dashboard)/whatsapp/components/contact-panel.tsx (1132 LOC, useInboxV2, paper-2, grid-cols 1fr/1.4fr, rounded-xl, tracking 0.12em, aria-label "Información del contacto", all preserved hooks + domain calls)
- FOUND: src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx (containerRef?: React.RefObject, DropdownMenuPortal ref, portalContainer={containerRef?.current ?? null})
- FOUND: src/components/ui/dropdown-menu.tsx (DropdownMenuContent accepts portalContainer, still exports DropdownMenuPortal)

All 3 commits exist in git log:
- FOUND: 39b4390 (Task 3 — assign-dropdown + shadcn wrapper extension)
- FOUND: e61c7e6 (Task 1 — chat-header editorial re-skin + aria-labels)
- FOUND: 0ce30bf (Task 2 — contact-panel editorial re-skin local)
