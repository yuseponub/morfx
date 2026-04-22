---
phase: ui-redesign-conversaciones
plan: 04
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/app/(dashboard)/whatsapp/components/chat-header.tsx
  - src/app/(dashboard)/whatsapp/components/contact-panel.tsx
  - src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx
autonomous: true
requirements:
  - D-04
  - D-05
  - D-07
  - D-19
  - D-20
  - D-22
  - D-24

must_haves:
  truths:
    - "`chat-header.tsx`: cuando v2, avatar 40x40 circle bg `var(--ink-1)` text `var(--paper-0)` font-sans 700 15px (UI-SPEC §7.4 — avatar SOLIDO de tinta, NO paper-3 como conversation-item)"
    - "`chat-header.tsx`: cuando v2, eyebrow `<span className='text-[var(--rubric-2)] text-[10px] uppercase tracking-[0.12em] font-semibold'>Contacto · activo</span>` arriba del nombre + nombre con font-display 600 20px tracking-[-0.01em] color ink-1 + meta line con font-mono 11px color ink-3 (UI-SPEC §7.4)"
    - "`chat-header.tsx`: cuando v2, header tiene `border-b border-[var(--ink-1)] bg-[var(--paper-0)]` (UI-SPEC §7.4 hard rule editorial); cuando !v2, header se preserva byte-identical"
    - "`chat-header.tsx`: cada Button con `variant='ghost' size='icon' className='h-8 w-8'` (~10 instancias) recibe `aria-label` en español (D-24, aplica a TODOS los users — universal a11y) — etiquetas: 'Marcar como leído', 'Archivar conversación', 'Asignar conversación', 'Más acciones', 'Configurar agente', etc.; los `title` props existentes se preservan"
    - "`contact-panel.tsx`: cuando v2, root container bg `var(--paper-2)` + border-l `var(--border)` (cascade lo da gratis pero override explícito si existe `bg-background` hardcoded)"
    - "`contact-panel.tsx`: cuando v2, headings de seccion (Ficha / Pedidos / Historial / Notas / Etiquetas) usan className combinada `font-semibold` (preserved) + cuando v2 también `text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]` con font-sans (UI-SPEC §7.9 smallcaps labels)"
    - "`contact-panel.tsx`: cuando v2, `<dl>` listas usan `grid-cols-[1fr_1.4fr]` items-baseline gap-x-3 gap-y-1; `<dt>` usa text-ink-3 + sans 13 + `<dd>` usa text-ink-1 + sans 13 (UI-SPEC §7.9)"
    - "`contact-panel.tsx`: order cards (cuando v2) tienen `rounded-xl bg-[var(--paper-0)] border border-[var(--border)] shadow-card px-3 py-2` con `.id` en mono 11 ink-3, `.desc` en sans 13 ink-1 line-height 1.4 (UI-SPEC §7.10)"
    - "`assign-dropdown.tsx`: acepta nueva prop opcional `containerRef?: React.RefObject<HTMLElement | null>` y, cuando se provee, envuelve `<DropdownMenuContent>` con `<DropdownMenuPortal container={containerRef.current}>` para re-rootear el portal Radix dentro de `.theme-editorial` (RESEARCH Pitfall 2 + Primitive Map DropdownMenu); cuando containerRef es undefined, el dropdown sigue rendereando con portal default (preserva comportamiento actual byte-identical para non-v2)"
    - "Cero cambios funcionales en `WindowIndicator`, `AssignDropdown` internal logic, `markAsRead`, `archiveConversation`, `toggleConversationAgent`, `getAppointmentForContact`, `confirmAppointment`, `BoldPaymentLinkButton`, GoDentist appointment dialog, `useEffect` realtime subs en contact-panel, `updateContactName`, `getRecentOrders`, `addOrderTag`, `moveOrderToStage`, `recompraOrder`, `getPipelines`, `getActiveProducts`, `CreateOrderSheet`, `CreateContactSheet`, `ViewOrderSheet`, AlertDialog, Select (D-19, D-20)"
    - "contact-panel.tsx mantiene 839 LOC sin refactor estructural (D-20 — solo re-skin LOCAL de className por bloque)"
    - "Build pasa: `npx tsc --noEmit` clean en los 3 archivos modificados"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      provides: "Editorial chat-header: avatar ink-1, eyebrow contacto, mx-h4 nombre, mx-mono meta, ibtn aria-labels"
      contains: "Contacto · activo"
    - path: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      provides: "Editorial panel: paper-2 bg, smallcaps H3, dl 1fr/1.4fr grid, order-card rounded-xl"
      contains: "grid-cols-\\[1fr_1.4fr\\]"
    - path: "src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx"
      provides: "DropdownMenuPortal container prop for editorial portal re-rooting"
      contains: "DropdownMenuPortal"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 hook"
      pattern: "useInboxV2"
    - from: "src/app/(dashboard)/whatsapp/components/chat-header.tsx"
      to: "src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx"
      via: "containerRef prop forwarded"
      pattern: "containerRef"
    - from: "src/app/(dashboard)/whatsapp/components/contact-panel.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 hook"
      pattern: "useInboxV2"
---

<objective>
Wave 3 — Re-skin the chat-header (avatar ink-1 solido, eyebrow Contacto, h-contact 20px serif, mono meta, ibtn aria-labels) and the contact-panel (paper-2 bg, smallcaps section headings, definition list 1fr/1.4fr grid, order cards rounded-xl). Add Radix portal `container` prop to `assign-dropdown.tsx` so its DropdownMenu content renders inside `.theme-editorial` instead of in slate.

**Purpose:** Convert the rightmost columns to editorial. chat-header is high-density UI with ~10 icon buttons that all need aria-labels (D-24 — universal a11y improvement). contact-panel is the largest single component (839 LOC) — re-skin is LOCAL className adjustments per block, NO structural refactor (D-20). The DropdownMenu portal fix is the one genuinely new pattern (RESEARCH Pitfall 2) — needed so the assign menu doesn't render slate inside an editorial-themed inbox.

**Output:** Three components re-skinned. Universal aria-label improvements (apply with or without flag). DropdownMenu portal can re-root into the themed wrapper when a containerRef is provided.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-redesign-conversaciones/CONTEXT.md
@.planning/standalone/ui-redesign-conversaciones/RESEARCH.md
@.planning/standalone/ui-redesign-conversaciones/UI-SPEC.md
@.planning/standalone/ui-redesign-conversaciones/PATTERNS.md
@.planning/standalone/ui-redesign-conversaciones/01-PLAN.md

# In-scope source files:
@src/app/(dashboard)/whatsapp/components/chat-header.tsx
@src/app/(dashboard)/whatsapp/components/contact-panel.tsx
@src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx

# Wave 0 outputs:
@src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
@src/app/(dashboard)/whatsapp/components/icon-button.tsx
@src/app/(dashboard)/whatsapp/components/mx-tag.tsx

<interfaces>
<!-- From Wave 0: -->

useInboxV2 hook:
```typescript
import { useInboxV2 } from './inbox-v2-context'
const v2 = useInboxV2()
```

`<MxTag>`, `<IconButton>` available from Wave 0.

`.theme-editorial` provides via globals.css:
- `--paper-0..3`, `--ink-1..3`, `--rubric-2`, `--border` tokens
- `--font-display`, `--font-sans`, `--font-mono`
- `--shadow-card` for order cards
- `mx-h3`, `mx-h4`, `mx-caption`, `mx-mono`, `mx-smallcaps`, `mx-rubric` utilities

Existing chat-header.tsx props (preserve all):
```typescript
interface ChatHeaderProps {
  conversation: ConversationWithDetails
  onTogglePanel: () => void
  onOpenAgentConfig?: () => void
  onToggleDebug?: () => void
  isDebugOpen?: boolean
}
```

Existing assign-dropdown.tsx — needs ONE additive prop:
```typescript
// CURRENT (preserve all current props):
interface AssignDropdownProps {
  conversation: ConversationWithDetails
  // ... etc
}
// ADD:
containerRef?: React.RefObject<HTMLElement | null>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin chat-header.tsx — avatar ink-1, eyebrow Contacto, mx-h4 name, mx-mono meta, universal aria-labels on ibtn</name>
  <files>src/app/(dashboard)/whatsapp/components/chat-header.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/chat-header.tsx (full 471 LOC — pay attention to: avatar at lines 207–211, info block at lines 214–239 [name, phone, meta], action buttons at lines 314–401, AssignDropdown call around line 307)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.4 (chat header full spec), §9 ibtn aria-labels table
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 13. chat-header.tsx` lines 688–727
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/chat-header.tsx` with FOUR changes:

    **Step 1 — Add imports + hook + containerRef:**
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    import { useRef } from 'react'  // if not already imported
    // ... inside component:
    const v2 = useInboxV2()
    const themeContainerRef = useRef<HTMLElement | null>(null)
    ```

    Right after the component mounts, set the ref to the `.theme-editorial` ancestor:
    ```typescript
    useEffect(() => {
      if (!v2) return
      // The .theme-editorial wrapper lives in InboxLayout (Wave 0). Find it via DOM closest.
      const el = (document.querySelector('[data-module="whatsapp"]') as HTMLElement | null)
      themeContainerRef.current = el
    }, [v2])
    ```

    (Verify `useEffect` is imported from 'react'; if not, add it.)

    **Step 2 — Re-skin the avatar (around lines 207–211).** Current likely:
    ```tsx
    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
      {getInitials(displayName)}
    </div>
    ```
    Change to:
    ```tsx
    <div
      className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
        v2
          ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
          : 'bg-primary/10 text-primary'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: '15px' } : undefined}
    >
      {getInitials(displayName)}
    </div>
    ```

    UI-SPEC §7.4 critical: chat-header avatar uses ink-1 SOLIDO bg + paper-0 text + sans 700 15px. This is DIFFERENT from conversation-item avatar (paper-3 bg + ink-1 border + sans 700 13px). The chat-header avatar is the "main" subject identifier; the list-item avatar is a "thumbnail".

    **Step 3 — Re-skin the info block (around lines 214–239).** Current typically renders:
    ```tsx
    <div className="flex flex-col">
      <p className="font-medium">{displayName}</p>
      <span className="text-xs text-muted-foreground">{phone} · {lastReplyMeta}</span>
    </div>
    ```
    Wrap with v2 conditional. When v2: render eyebrow above name, then h-contact 20px serif name, then mono 11px meta line:
    ```tsx
    <div className="flex flex-col min-w-0">
      {v2 && (
        <span
          className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--rubric-2)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Contacto · {availabilityStatus /* or 'activo' if no status field */}
        </span>
      )}
      <p
        className={cn(
          'truncate',
          v2
            ? 'text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink-1)] leading-tight'
            : 'font-medium'
        )}
        style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
      >
        {displayName}
      </p>
      <span
        className={cn(
          'truncate',
          v2
            ? 'text-[11px] text-[var(--ink-3)]'
            : 'text-xs text-muted-foreground'
        )}
        style={v2 ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : undefined}
      >
        {phone}{lastReplyMeta && ` · ${lastReplyMeta}`}
      </span>
    </div>
    ```

    **CRITICAL — eyebrow text:** UI-SPEC §9 specifies `Contacto · activo` / `Contacto · inactivo` / `Contacto · snoozed`. If the existing component knows the contact's availability state (via the existing `<AvailabilityToggle>` data — which is OUT-OF-SCOPE per D-19 to modify), use it. If not accessible, default to `'activo'` literal — research a future improvement to surface the state more precisely. The medium-dot is U+00B7 (NOT a normal period).

    **Step 4 — Re-skin the header container.** The outer container `<div>` of the chat-header (root wrapper) currently has classes like `flex items-center gap-2 p-3 border-b bg-background` or similar. Add v2 conditional:
    ```tsx
    <div className={cn(
      'flex items-center gap-2 p-3 border-b',
      v2 ? 'bg-[var(--paper-0)] border-b-[var(--ink-1)] gap-3 px-5 py-[14px]' : 'bg-background'
    )}>
    ```
    Per UI-SPEC §7.4: `padding: 14px 20px` (rounded to `12px 20px` per UI-SPEC §5.1 grid alignment but kept 14px for vertical to preserve chat-header proportions); `border-bottom: 1px solid var(--ink-1)` hard rule; `bg: var(--paper-0)`.

    **Step 5 — Add `aria-label` to EVERY ibtn (UNCONDITIONAL — applies to all users for D-24 universal a11y).** Search the file for `<Button variant="ghost" size="icon"` — there are ~10 instances. For each, add an `aria-label="..."` Spanish label per UI-SPEC §9 ibtn aria-labels table. Examples:

    - `handleMarkAsRead` button: `aria-label="Marcar como leído"`
    - Archive button: `aria-label="Archivar conversación"`
    - `<AssignDropdown>` trigger button: `aria-label="Asignar conversación"`
    - More-actions menu: `aria-label="Más acciones"`
    - `<AvailabilityToggle>` if it has a button: `aria-label` pre-existing or add `aria-label="Cambiar disponibilidad"`
    - `<BoldPaymentLinkButton>` (out-of-scope to modify internally, but its trigger): `aria-label="Cobrar con BOLD"` if not present
    - GoDentist confirm button (if present): `aria-label="Confirmar cita GoDentist"`
    - Agent config trigger: `aria-label="Configurar agente"`
    - Debug panel trigger (super-user only): `aria-label="Abrir panel de debug"`
    - Toggle right panel: `aria-label="Mostrar información del contacto"`

    The existing `title=` attributes are preserved (provide tooltip on hover). aria-label adds screen-reader support.

    **Step 6 — Pass containerRef to AssignDropdown.** Locate the `<AssignDropdown ... />` call (around line 307). Add a new prop:
    ```tsx
    <AssignDropdown
      conversation={conversation}
      // ... existing props ...
      containerRef={v2 ? themeContainerRef : undefined}
    />
    ```

    **Step 7 — Optional: swap inline avatar for `<IconButton>` wrapper.** RESEARCH suggests using `<IconButton>` (Wave 0) for cleaner markup. THIS IS OPTIONAL — leaving the inline `<Button variant="ghost" size="icon">` is acceptable since it inherits via `.theme-editorial` cascade (button bg → paper-0, hover → paper-3). Skip the swap to minimize diff size.

    **DO NOT MODIFY (D-19, D-20):**
    - `WindowIndicator`, `AvailabilityToggle`, `BoldPaymentLinkButton` internals (only styling via cascade + aria-label additions on their containing buttons if they have any)
    - `AssignDropdown` internal logic — ONLY add the `containerRef` prop in this task; the receiving end is Task 3
    - `markAsRead`, `archiveConversation`, `toggleConversationAgent` callbacks
    - `getAppointmentForContact`, `confirmAppointment` GoDentist logic
    - `<ConversationTagInput>` callsite at line 244 (cascade re-skins it for free)
    - Edit-name `Dialog` (lives in Radix portal — intentional slate)
    - Any `useState`, `useEffect`, refs, callbacks
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && grep -q "Contacto · " src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && grep -q "var(--font-display)" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && grep -q "var(--font-mono)" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && grep -q "themeContainerRef" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && grep -q "containerRef={" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx && [ "$(grep -c 'aria-label=' src/app/\(dashboard\)/whatsapp/components/chat-header.tsx)" -ge 5 ] && npx tsc --noEmit 2>&1 | grep "chat-header" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx`.
    - `grep -q "Contacto · " src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (eyebrow text — uses U+00B7 medium dot).
    - `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (avatar SOLIDO ink-1).
    - `grep -q "var(--font-display)" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (name uses display font when v2).
    - `grep -q "var(--font-mono)" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (meta line uses mono when v2).
    - `grep -q "themeContainerRef" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (ref to theme-editorial wrapper).
    - `grep -q "containerRef={" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (forwarded to AssignDropdown).
    - `grep -c "aria-label=" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` returns ≥ 5 (universal aria-labels added per UI-SPEC §9).
    - The file STILL contains: `WindowIndicator`, `AvailabilityToggle`, `markAsRead`, `archiveConversation`, `toggleConversationAgent`, `BoldPaymentLinkButton`, `ConversationTagInput`, `AssignDropdown`, `getAppointmentForContact` — verify all preserved (Regla 6).
    - `! grep "oklch(" src/app/\(dashboard\)/whatsapp/components/chat-header.tsx` (no hardcoded OKLCH).
    - `npx tsc --noEmit` clean for `chat-header.tsx`.
  </acceptance_criteria>
  <done>chat-header is editorial when flag ON: avatar ink-1 solido, eyebrow Contacto, mx-h4-style name, mx-mono meta, ink-1 hard rule bottom border. aria-labels added to all ibtn unconditionally. AssignDropdown receives containerRef when v2. When flag OFF, byte-identical except for added aria-labels (universal positive). Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin contact-panel.tsx — paper-2 bg, smallcaps section H3, dl 1fr/1.4fr grid, order-card rounded-xl (NO structural refactor)</name>
  <files>src/app/(dashboard)/whatsapp/components/contact-panel.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/contact-panel.tsx (full 839 LOC — read all imports lines 7–36 and skim the structure for: root container, section headings (`Ficha`, `Pedidos`, `Historial`, `Notas`, `Etiquetas`), `<dl>` lists for contact fields, order cards, timeline items if present)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.9 (contact-panel), §7.10 (order card), §7.11 (timeline)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 14. contact-panel.tsx` lines 730–763
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/contact-panel.tsx` with LOCAL className adjustments per block (NO structural refactor — D-20 strict).

    **Step 1 — Add imports + hook:**
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    // ... inside component body:
    const v2 = useInboxV2()
    ```

    **Step 2 — Re-skin the root container.** Find the outermost `<div>` or `<aside>` of the component (usually right inside the function return). Wrap its className with v2 conditional adding paper-2 bg + border-l + scroll behavior. The container likely has classes like `bg-background` or `bg-card`; the cascade resolves these to editorial values, but UI-SPEC §7.9 specifically wants `paper-2` (which is `--muted` per the §4 mapping). If `bg-muted` is already applied, no change needed; if `bg-background` is applied, override to `bg-[var(--paper-2)]` when v2:
    ```tsx
    <aside
      aria-label="Información del contacto"
      className={cn(
        'h-full overflow-y-auto',
        v2 ? 'bg-[var(--paper-2)] border-l border-[var(--border)]' : 'bg-background border-l'
        // preserve other existing classes
      )}
    >
    ```

    Add `aria-label="Información del contacto"` UNCONDITIONALLY (universal a11y per UI-SPEC §12.2).

    **Step 3 — Re-skin section headings.** Search the file for section heading patterns. Common pattern: `<h3 className="font-semibold text-sm">Ficha</h3>` or `<div className="text-sm font-semibold uppercase">Pedidos</div>`. For EACH section heading (Ficha, Pedidos, Historial, Notas, Etiquetas, possibly others like Mensajes / Eventos), append v2 styling:
    ```tsx
    <h3
      className={cn(
        'font-semibold mb-2',  // preserve existing
        v2 && 'text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)] mb-3'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      Ficha
    </h3>
    ```

    Use `cn()` to ADD v2 classes; preserve existing typography classes for !v2 branch.

    **Step 4 — Re-skin definition list (`<dl>` for contact fields like nombre, teléfono, ciudad).** Find the markup that lists contact fields. It likely uses a flexbox/grid pattern. Convert to semantic `<dl>` with editorial grid when v2:

    Pattern to look for (your file may already use `<dl>` or may use `<div><label/><value/></div>`). Apply this where the contact info fields are rendered:
    ```tsx
    <dl className={cn(
      'gap-y-1',
      v2 ? 'grid grid-cols-[1fr_1.4fr] gap-x-3 items-baseline' : 'grid grid-cols-2 gap-x-2'
    )}>
      <dt
        className={cn(v2 && 'text-[var(--ink-3)] font-medium text-[13px]')}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        Teléfono
      </dt>
      <dd
        className={cn(v2 && 'text-[var(--ink-1)] font-medium text-[13px] m-0')}
        style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
      >
        {contact.phone}
      </dd>
      {/* ... other fields ... */}
    </dl>
    ```

    Phone, ID, dates use mono. Names, cities, emails use sans. Apply per-field discretion.

    **Step 5 — Re-skin order cards (UI-SPEC §7.10).** Find where individual orders are rendered (look for `getRecentOrders` usage and the JSX that maps over orders). Each order card should, when v2, get:
    ```tsx
    <div className={cn(
      'transition-colors',
      v2
        ? 'rounded-xl bg-[var(--paper-0)] border border-[var(--border)] px-3 py-2 shadow-[0_1px_0_var(--border)]'
        : 'rounded-md border bg-card p-3'  // current
    )}>
      {/* Order top row: ID + status pill */}
      <div className={cn('flex justify-between gap-2', v2 && 'mb-1')}>
        <span
          className={cn(v2 && 'text-[11px] text-[var(--ink-3)] tracking-[0.02em]')}
          style={v2 ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : undefined}
        >
          #{order.short_id /* or order number */}
        </span>
        {/* Status: use <MxTag> when v2; map status to variant per UI-SPEC §7.10 */}
        {v2 ? (
          <MxTag variant={mapOrderStatusToVariant(order.status)}>{order.status}</MxTag>
        ) : (
          /* preserve current status badge */
          <Badge variant={...}>{order.status}</Badge>
        )}
      </div>
      <p className={cn(v2 && 'text-[13px] leading-[1.4] text-[var(--ink-1)]')}>{order.description}</p>
      {/* meta + acciones — apply editorial classes similarly */}
    </div>
    ```

    Helper to map order status to MxTag variant (define inline or at top of file):
    ```typescript
    function mapOrderStatusToVariant(status: string): 'gold' | 'verdigris' | 'rubric' | 'indigo' | 'ink' {
      switch (status) {
        case 'pendiente_pago':
        case 'pendiente pago':
          return 'gold'
        case 'entregado':
        case 'enviado':
          return 'verdigris'
        case 'cancelado':
        case 'refund':
          return 'rubric'
        default:
          return 'ink'
      }
    }
    ```

    Add `import { MxTag } from './mx-tag'` if rendering `<MxTag>` inline.

    **Step 6 — Re-skin notes / quote (UI-SPEC §7.9 .note pattern).** If the contact-panel renders contact notes (often as `<div className="text-sm">{note.content}</div>`), wrap in v2 conditional:
    ```tsx
    <div
      className={cn(
        v2 && 'border-l-2 border-[var(--ink-1)] pl-[10px] text-[13px] text-[var(--ink-2)] leading-[1.5]'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
      {note.content}
    </div>
    ```

    **Step 7 — Re-skin timeline if present (UI-SPEC §7.11).** If the panel has an event timeline (look for `tl-item` or similar, or a list of events with timestamps), apply editorial styling per UI-SPEC §7.11. If no timeline exists, skip this step.

    **DO NOT MODIFY (D-19, D-20 — STRICT — 839 LOC preserved structurally):**
    - ANY hook: `useState`, `useEffect`, `useRef`, `useMemo`, `useRouter`
    - `createClient` realtime subscriptions (lines 94–120+)
    - Domain action calls: `updateContactName`, `getRecentOrders`, `addOrderTag`, `moveOrderToStage`, `recompraOrder`, `getPipelines`, `getActiveProducts`
    - Sheets: `<CreateOrderSheet>`, `<CreateContactSheet>`, `<ViewOrderSheet>` (props + callsites preserved)
    - `AlertDialog`, `Select` (Radix portal — intentional slate; no portal container fix here unless contact-panel demonstrably renders dropdowns that visually clash; defer to Wave 4 if so)
    - `<TagBadge>`, `<WindowIndicator>`, `<OrderStageBadge>`, `<CreateTaskButton>` internals
    - The 839-LOC structure: NO splitting into subcomponents, NO renaming of any function/variable, NO moving any block

    The change is purely className+style additions per block. Each modification is a `cn()` extension or a v2-conditional wrap. Diff should show many small additions, no deletions of meaningful code.
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx && grep -q "bg-\[var(--paper-2)\]" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx && grep -q "grid-cols-\[1fr_1.4fr\]" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx && grep -q "rounded-xl" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx && grep -q "tracking-\[0.12em\]" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx && grep -q "aria-label=\"Información del contacto\"" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx && [ "$(wc -l < src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx)" -ge 800 ] && npx tsc --noEmit 2>&1 | grep "contact-panel" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx`.
    - `grep -q "bg-\[var(--paper-2)\]" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx` (root paper-2).
    - `grep -q "grid-cols-\[1fr_1.4fr\]" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx` (dl grid per UI-SPEC §7.9).
    - `grep -q "rounded-xl" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx` (order card 12px radius per UI-SPEC §7.10).
    - `grep -q "tracking-\[0.12em\]" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx` (smallcaps section headings).
    - `grep -q "aria-label=\"Información del contacto\"" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx` (universal a11y).
    - The file STILL contains: `useState`, `useEffect`, `useRef`, `useMemo`, `getRecentOrders`, `updateContactName`, `addOrderTag`, `moveOrderToStage`, `recompraOrder`, `getPipelines`, `getActiveProducts`, `CreateOrderSheet`, `CreateContactSheet`, `ViewOrderSheet`, `WindowIndicator`, `OrderStageBadge`, `TagBadge`, `CreateTaskButton`, `AlertDialog`, `Select` — verify all preserved (Regla 6).
    - File LOC count: `wc -l src/app/(dashboard)/whatsapp/components/contact-panel.tsx` returns ≥ 800 (was 839; allow ±50 for class additions; if less than 800, structural refactor occurred — VIOLATION D-20).
    - `! grep "oklch(" src/app/\(dashboard\)/whatsapp/components/contact-panel.tsx` (no hardcoded OKLCH outside color-mix).
    - `npx tsc --noEmit` clean for `contact-panel.tsx`.
  </acceptance_criteria>
  <done>contact-panel is editorial when flag ON: paper-2 bg, smallcaps section headings, dl 1fr/1.4fr grid for contact fields, order cards rounded-xl with shadow-card, mx-mono for IDs/phones, MxTag pills for order status. NO structural refactor (839 LOC preserved). aria-label on root for universal a11y. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Add containerRef portal prop to assign-dropdown.tsx (DropdownMenuPortal re-rooting per RESEARCH Pitfall 2)</name>
  <files>src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx (full file — pay attention to props interface, the DropdownMenu structure typically at the bottom of the return, and any DropdownMenuContent usage)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `### Pitfall 2` lines 1097–1112 (token leakage outside .theme-editorial — Radix portal caveat)
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `## Shadcn Primitive Inheritance Map` row "DropdownMenu" lines 213–214
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 13.D` "DropdownMenu portal" lines 718–727 + special note lines 924–928
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/assign-dropdown.tsx` with TWO additive changes:

    **Step 1 — Add the `containerRef` optional prop to the props interface:**
    ```typescript
    interface AssignDropdownProps {
      // ... existing props preserved verbatim ...
      /**
       * Optional ref to a DOM element used as the Radix DropdownMenu portal container.
       * When provided, the dropdown content renders INSIDE this element (so it inherits
       * the editorial token scope from `.theme-editorial`). When undefined (default),
       * the dropdown renders via the default portal attached to document.body
       * (current behavior — slate styling).
       *
       * Pattern documented in:
       * - RESEARCH.md Pitfall 2 + Primitive Inheritance Map "DropdownMenu" row
       * - chat-header.tsx forwards a ref to the .theme-editorial wrapper when v2 is on.
       */
      containerRef?: React.RefObject<HTMLElement | null>
    }
    ```
    Destructure `containerRef` from props in the component signature. Default to `undefined` (no behavior change when not provided).

    **Step 2 — Wrap `<DropdownMenuContent>` with `<DropdownMenuPortal>` only when `containerRef` is provided.** The current component likely uses:
    ```tsx
    <DropdownMenu>
      <DropdownMenuTrigger asChild>...</DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* menu items */}
      </DropdownMenuContent>
    </DropdownMenu>
    ```
    shadcn's `DropdownMenuContent` (from `@/components/ui/dropdown-menu`) automatically wraps in a `DropdownMenuPortal` internally. To override that, you import the raw Radix primitive's `DropdownMenuPortal` (re-exported from shadcn) and provide a `container` prop.

    Add the import:
    ```typescript
    import { DropdownMenuPortal } from '@/components/ui/dropdown-menu'
    ```
    (Verify this export exists; if shadcn's `dropdown-menu.tsx` re-exports `DropdownMenuPortal` it should be there. If not present, add the export to `src/components/ui/dropdown-menu.tsx` — that file IS in scope as a one-line `export { DropdownMenuPortal } from '@radix-ui/react-dropdown-menu'` extension.)

    Then change the structure to:
    ```tsx
    <DropdownMenu>
      <DropdownMenuTrigger asChild>...</DropdownMenuTrigger>
      {containerRef ? (
        <DropdownMenuPortal container={containerRef.current ?? undefined}>
          <DropdownMenuContent>
            {/* menu items — preserve verbatim */}
          </DropdownMenuContent>
        </DropdownMenuPortal>
      ) : (
        <DropdownMenuContent>
          {/* menu items — same content, default portal */}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
    ```

    To avoid duplicating menu items, extract them into a variable:
    ```tsx
    const menuItemsContent = (
      <DropdownMenuContent /* preserve all current props */>
        {/* all current items here */}
      </DropdownMenuContent>
    )

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>...</DropdownMenuTrigger>
        {containerRef
          ? <DropdownMenuPortal container={containerRef.current ?? undefined}>{menuItemsContent}</DropdownMenuPortal>
          : menuItemsContent}
      </DropdownMenu>
    )
    ```

    **Step 3 — If `dropdown-menu.tsx` doesn't re-export `DropdownMenuPortal`,** add the export. Check first:
    ```bash
    grep "DropdownMenuPortal" src/components/ui/dropdown-menu.tsx
    ```
    If absent, append (preserving the file's other exports):
    ```typescript
    import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
    // ... at the end:
    export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
    ```
    (Or follow the existing re-export pattern in `dropdown-menu.tsx` — typically functions are re-exported as `function X({ ... }) { return <DropdownMenuPrimitive.X ... /> }`.)

    **DO NOT MODIFY (D-19):**
    - The list of menu items, their order, their click handlers
    - The trigger button JSX (only the wrapping changes)
    - The `conversation`, `user`, or workspace-related logic
    - Any data fetching, mutation calls
    - The DropdownMenu open/close state, `onOpenChange` if present
  </action>
  <verify>
    <automated>grep -q "containerRef?: React.RefObject" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx && grep -q "DropdownMenuPortal" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx && grep -q "container=" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx && (grep -q "DropdownMenuPortal" src/components/ui/dropdown-menu.tsx) && npx tsc --noEmit 2>&1 | grep -E "assign-dropdown|dropdown-menu" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "containerRef?: React.RefObject" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx` (new prop declared).
    - `grep -q "DropdownMenuPortal" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx` (portal wrapper used).
    - `grep -q "container=" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx` (container prop applied).
    - `grep -q "containerRef ?" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx` OR `grep -q "containerRef &&" src/app/\(dashboard\)/whatsapp/components/assign-dropdown.tsx` (conditional portal — default behavior preserved when ref absent).
    - `grep -q "DropdownMenuPortal" src/components/ui/dropdown-menu.tsx` (re-export exists; if it didn't before, this task added it).
    - The menu items themselves are unchanged — their click handlers, callbacks, conversation logic preserved (Regla 6). Verify that all handlers / state setters present in the original file are still present.
    - `npx tsc --noEmit` clean for `assign-dropdown.tsx` and `dropdown-menu.tsx`.
    - When `containerRef` is undefined (default — non-v2 case), the rendered DOM tree is byte-identical to current (the conditional `containerRef ? <Portal>...</Portal> : <Content/>` falls through to the no-portal-wrap path which is what shadcn's `DropdownMenuContent` does internally).
  </acceptance_criteria>
  <done>AssignDropdown accepts optional `containerRef` and uses Radix `DropdownMenuPortal` to re-root content inside the editorial scope when provided. When undefined (default), preserves current behavior. chat-header (Task 1) forwards the ref when v2 is on. Build clean.</done>
</task>

</tasks>

<verification>
After all 3 tasks:

1. `npx tsc --noEmit 2>&1 | grep -E "chat-header|contact-panel|assign-dropdown|dropdown-menu" | (! grep -E "error|Error")` returns 0.
2. Manual smoke (with flag ON):
   - chat-header avatar: dark ink-1 circle with paper-0 white initials.
   - Eyebrow "Contacto · activo" in rubric-2 small-caps above the contact name.
   - Contact name in EB Garamond serif at 20px.
   - Phone + last-reply meta in JetBrains Mono at 11px ink-3.
   - Click the AssignDropdown — its menu opens with editorial paper-0 background + ink-1 text (because the portal re-rooted inside .theme-editorial). Without the containerRef fix, the menu would render slate.
   - Hover any ibtn — bg becomes paper-3.
   - Tab through chat-header buttons — focus ring is ink-1 dark outline.
   - contact-panel root has paper-2 bg.
   - Section headings ("Ficha", "Pedidos", "Historial") in tiny uppercase smallcaps ink-3.
   - Contact phone field uses JetBrains Mono.
   - Order cards: paper-0 background, rounded-xl, shadow-card, status pill is an MxTag (gold for pendiente, verdigris for entregado, etc.).
3. Manual smoke (with flag OFF):
   - chat-header byte-identical to current (slate avatar, no eyebrow, original styling).
   - contact-panel byte-identical to current.
   - AssignDropdown menu opens with current slate styling (because no containerRef passed).
4. Screen reader test (VoiceOver / NVDA): focus chat-header buttons → hear Spanish aria-labels ("Marcar como leído", "Asignar conversación", etc.).
5. Git diff for D-19 NO-TOUCH targets (`WindowIndicator`, `AvailabilityToggle`, realtime subscriptions, `markAsRead`, `archiveConversation`, `getRecentOrders`, `updateContactName`, sheets): zero changes.
</verification>

<success_criteria>
- All 3 tasks pass automated verify.
- Build clean.
- With flag ON, chat-header + contact-panel + AssignDropdown menu all render editorial.
- With flag OFF, byte-identical except for added universal aria-labels (positive).
- contact-panel maintains its 839 LOC structure (D-20 — no refactor).
- AssignDropdown menu re-roots into theme-editorial when containerRef provided.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-conversaciones/04-SUMMARY.md` with:
- Commits (one per task)
- Pixel-diff vs mock for chat-header + contact-panel
- Confirmation of DropdownMenu portal re-rooting (DevTools inspection: when v2 ON, the menu DOM is INSIDE `.theme-editorial`; when v2 OFF, it's at body level)
- contact-panel LOC count before/after (must be ≥ 800 — D-20 invariant)
- aria-label coverage in chat-header (count via grep)
- Handoff to Wave 4: states + a11y polish + portal coverage for any remaining Radix consumers.
</output>
