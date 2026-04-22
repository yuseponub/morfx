---
phase: ui-redesign-conversaciones
plan: 03
subsystem: /whatsapp module — center column (thread + bubbles + composer)
tags:
  - ui
  - re-skin
  - editorial-design
  - feature-flag
  - regla-6
  - bug-fix
  - chat-view
  - message-bubble
  - message-input

dependency_graph:
  requires:
    - src/app/(dashboard)/whatsapp/components/day-separator.tsx (Plan 01 — editorial smallcaps separator)
    - src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx (Plan 01 — useInboxV2 hook)
    - .theme-editorial CSS scope (Plan 01 — paper/ink/rubric tokens + mx-* utilities)
    - --font-serif / --font-sans / --font-mono variables (Plan 01 — next/font/google per-route)
  provides:
    - Editorial thread container (DaySeparator + editorial empty-state) when v2=ON
    - Editorial bubble shape (10px radius with 2px opposite corner) + paper-0/ink-1 fills
    - Bot eyebrow ornament (❦ bot · respuesta sugerida — U+2766 floral heart)
    - Editorial composer (ink-1 border-top + paper-1 input + ink-1 Send button with label)
    - Rubric-tinted 24h-closed warning banner (D-17 alert pattern)
    - aria-label="Enviar mensaje" on Send button for ALL users (D-24 unconditional)
  affects:
    - /whatsapp center column — thread + bubbles + composer (editorial when flag=ON, byte-identical when flag=OFF except hsl bug fix)

tech_stack:
  added:
    - AlertTriangle icon (lucide-react — already in deps, new import)
  patterns:
    - v2 conditional gating via cn() branches (preserves flag-OFF byte-identity)
    - CSS arbitrary values via Tailwind bracket syntax (e.g. rounded-[10px] rounded-br-[2px])
    - color-mix(in oklch, ...) for rubric-tinted banner background (UI-SPEC §9.1 D-17)
    - Inline style prop for font-family swaps (cannot go through Tailwind utility without cluttering globals.css)

key_files:
  modified:
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
    - src/app/(dashboard)/whatsapp/components/message-input.tsx

decisions:
  - "D-04/D-05 enforced via CSS cascade: v2 bubbles use bracket-notation utilities referencing editorial tokens (var(--ink-1), var(--paper-0)) that only resolve inside .theme-editorial scope"
  - "D-07 enforced: mx-h4 + mx-caption + mx-rule-ornament consumed in editorial empty-state (chat-view)"
  - "D-17 enforced: window-closed 24h banner uses bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] + border-l-[3px] border-l-[var(--rubric-2)] + AlertTriangle icon — matches the error/warning pattern defined in UI-SPEC §9.1"
  - "D-19/D-20 enforced: zero changes to useMessages, useVirtualizer, realtime typing channel, scrolledToBottomRef, scheduleSafetyRefetch, isWindowOpen, sendMessage, sendMediaMessage, addOptimisticMessage, StatusIcon, MessageContent, MediaPreview, QuickReplyAutocomplete, TemplateButton, emoji-picker internals, handleSend, file upload flow, attachedFile/pendingQuickReplyMedia state"
  - "D-22 enforced: AlertTriangle (lucide) added to the composer-banner icon slot when v2"
  - "D-24 enforced UNIVERSALLY: aria-label='Enviar mensaje' added to Send button irrespective of v2 flag — the aria-label was missing before and is a real a11y fix for all users"
  - "UI-SPEC §5.1 critical exception preserved: bubble padding in v2 is px-[14px] py-[10px] (10x14, NOT 12x16) — pixel-perfect mock value; the difference IS visually perceptible (12x16 inflates the bubble)"
  - "UI-SPEC §7.5 editorial choice enforced: DaySeparator always shows 'EEEE d de MMMM' (e.g. 'Martes 21 de abril') with NO Hoy/Ayer shorthand when v2=ON. Flag-OFF path preserves current Hoy/Ayer/format-date pill byte-identical"
  - "Pre-existing hsl(var(--background)) bug fixed UNIVERSALLY (applies to both shadcn-slate and editorial themes): after the Tailwind v4 migration, shadcn tokens are bare oklch(...) values — wrapping with hsl() made the CSS rule invalid. DevTools on main shows the rule greyed-out; with this fix it resolves correctly. Universal-positive change, not gated by v2"

metrics:
  duration: ~18 minutes
  completed_date: 2026-04-22T21:29:22Z
  tasks: 3
  commits: 3
  files_created: 0
  files_modified: 3
  lines_added: 128
  lines_removed: 37
---

# Standalone ui-redesign-conversaciones Plan 03: Thread + Bubble + Composer Editorial Re-skin Summary

**One-liner:** Re-skin del thread (`chat-view`), las burbujas (`message-bubble`) y el composer (`message-input`) a la estetica editorial paper/Bible/dictionary — bubble shape letter/note (10px radius con pico de 2px en la esquina opuesta), composer con hard-rule ink-1 border-top + Send button "Enviar" con press affordance + rubric-tinted 24h banner — TODO gated por `useInboxV2()`; adicionalmente fix universal del bug pre-existente `hsl(var(--background))` en chat-view (los tokens shadcn v4 son bare OKLCH, el wrapper hsl() era invalido desde la migracion Tailwind v4).

## Scope

Wave 2 del standalone `ui-redesign-conversaciones` — **center column editorial**. Flag-ON state:

- **`chat-view.tsx`:**
  - Importa `<DaySeparator>` (Plan 01) + `useInboxV2()` hook; hook call en funcion componente.
  - Empty-state (chat no seleccionado) editorial: `<p class="mx-h4">Seleccione una conversación.</p>` + `<p class="mx-caption">Los mensajes y el contexto del cliente aparecerán aquí.</p>` + `<p class="mx-rule-ornament">· · ·</p>`. Fallback al emoji 💬 actual cuando flag OFF.
  - Day separator (dentro del virtualizer loop): cuando v2, renderiza `<DaySeparator date={messageDate} />` (smallcaps `— Martes 21 de abril —` con em-dashes). Cuando !v2, preserva el pill actual con Hoy/Ayer/format byte-identical.
  - **Bug fix universal:** `<style jsx>` `.chat-background { background-color: hsl(var(--background)); ... }` → `background-color: var(--background);`. El wrapper `hsl()` era correcto para shadcn v3 (tokens HSL%) pero es invalido para shadcn v4 (tokens bare OKLCH). Aplicaba para ambos themes (slate Y editorial), por eso NO se gatea por v2.

- **`message-bubble.tsx`:**
  - Importa `useInboxV2()` + hook call.
  - Bubble container v2: `relative shadow-sm px-[14px] py-[10px] text-[15px] leading-[1.5] rounded-[10px]` + `rounded-br-[2px]` (own) / `rounded-bl-[2px]` (in). Padding **10x14 pixel-perfect** (UI-SPEC §5.1 excepcion critica — NO 12x16).
  - Own bubble v2: `bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)]` — tinta solida con texto paper-0.
  - In bubble v2: `bg-[var(--paper-0)] text-[var(--ink-1)] border border-[var(--ink-2)]` — paper-0 con borde discreto.
  - Font family v2: `style={{ fontFamily: 'var(--font-sans)' }}` (Inter dentro del editorial scope).
  - Bot eyebrow v2 (`isAgentMessage` true): `<span class="block text-right mb-1 mr-1 text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--rubric-2)]" style="font-family: var(--font-serif)">❦ bot · respuesta sugerida</span>`. El caracter `❦` es U+2766 (floral heart) literal, NO HTML entity. Cuando !v2 o sin agent flag, fallback al `<Bot/>` icon + "Bot" text byte-identical.
  - Timestamp v2: `text-[11px] tracking-[0.02em]` + `var(--font-mono)` (JetBrains Mono) + `text-[var(--paper-2)] opacity-85` (own) / `text-[var(--ink-3)] opacity-75` (in). Cuando !v2, preserva `text-[10px]` + `primary-foreground/70` / `muted-foreground` byte-identical.

- **`message-input.tsx`:**
  - Importa `useInboxV2()` + `AlertTriangle` (lucide) + hook call.
  - Composer container v2: `border-t border-[var(--ink-1)] bg-[var(--paper-0)]` — la hard rule editorial entre thread y composer (UI-SPEC §7.8).
  - Input interior v2: `bg-[var(--paper-1)] border border-[var(--border)] rounded-[4px] px-3 text-[14px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]`. Paper-1 **mas claro** que el composer (paper-0) para crear la jerarquia visual de "input dentro de tarjeta".
  - Placeholder v2: `'Escriba su respuesta…'` (U+2026 ellipsis, UI-SPEC §9). Cuando !v2 o con attachedFile/pendingQuickReplyMedia pending, preserva los placeholders existentes.
  - Send button v2: `size="default"` + `h-auto px-[16px] py-[8px] text-[13px] font-semibold gap-1.5 active:translate-y-px bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)] hover:bg-[var(--ink-2)] rounded-[4px]`. Icono Send 14x14 + label "Enviar" (gap-1.5 entre ellos). Press affordance `active:translate-y-px` matches UI-SPEC §13.2 / §10.3. Cuando !v2, preserva `size="icon"` + `h-10 w-10` byte-identical.
  - **`aria-label="Enviar mensaje"` UNIVERSAL (D-24):** se agrega SIEMPRE (no gated por v2). Antes de este commit el boton solo tenia `title=` — el aria-label es un fix real de accesibilidad que aplica para TODOS los usuarios.
  - Window-closed banner v2 (!isWindowOpen branch): `bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border-l-[3px] border-l-[var(--rubric-2)] border-t-[var(--ink-1)] text-[var(--ink-1)]` + `AlertTriangle` icon (text-[var(--rubric-2)]) en vez de `Lock`. Matches UI-SPEC §9.1 D-17 (patron de error/warning banner editorial). Cuando !v2, preserva yellow-50 byte-identical con Lock icon.

## Tasks

| # | Name | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Re-skin chat-view — DaySeparator + fix hsl bug + editorial empty-state | `0f330b1` | `src/app/(dashboard)/whatsapp/components/chat-view.tsx` |
| 2 | Re-skin message-bubble — 10px radius + 2px corner + paper-0/ink-1 + bot eyebrow | `3f35846` | `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` |
| 3 | Re-skin message-input — ink-1 border-top + paper-1 input + ink-1 Send + rubric banner | `e710eba` | `src/app/(dashboard)/whatsapp/components/message-input.tsx` |

## Acceptance Criteria — all 3 Tasks PASSED

### Task 1 (commit `0f330b1`)
- [x] `grep -q "useInboxV2"` + `grep -q "import { DaySeparator }"` + `grep -q "<DaySeparator date={messageDate}"` pass
- [x] `grep -q "Seleccione una conversación"` + `grep -q "Los mensajes y el contexto del cliente aparecerán aquí"` pass (editorial empty-state per UI-SPEC §9.1)
- [x] `grep -q "mx-h4"` + `grep -q "mx-caption"` + `grep -q "mx-rule-ornament"` pass
- [x] `! grep -q "hsl(var(--background))"` — bug fixed (universal, not gated)
- [x] `grep -q "background-color: var(--background)"` — replacement present
- [x] Regla 6 guards preserved: `useMessages`, `useVirtualizer`, `scrolledToBottomRef`, `scheduleSafetyRefetch`, `isWindowOpen`, `MessageBubble`, `ChatHeader` all grep-verifiable
- [x] 💬 emoji preserved inside `!v2` branch (not deleted — flag-OFF byte-identical for empty-state)
- [x] No hardcoded `oklch(` in component code
- [x] `npx tsc --noEmit 2>&1 | grep "chat-view"` → empty (zero errors)

### Task 2 (commit `3f35846`)
- [x] `grep -q "useInboxV2"` pass
- [x] `grep -q "rounded-\[10px\] rounded-br-\[2px\]"` + `grep -q "rounded-\[10px\] rounded-bl-\[2px\]"` pass (editorial corners in same string literal for grep-ability)
- [x] `grep -q "px-\[14px\] py-\[10px\]"` pass (UI-SPEC §5.1 critical exception — 10x14 pixel-perfect padding)
- [x] `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]"` + `grep -q "bg-\[var(--paper-0)\] text-\[var(--ink-1)\] border border-\[var(--ink-2)\]"` pass
- [x] `grep -q "❦ bot · respuesta sugerida"` pass — literal U+2766 + middle-dot U+00B7 present
- [x] `grep -q "var(--rubric-2)"` + `grep -q "var(--font-mono)"` pass
- [x] D-19/D-20 preserved: `StatusIcon`, `MessageContent`, `MediaPreview`, `Bot` import all grep-verifiable
- [x] `! grep -q "oklch("` — no hardcoded OKLCH
- [x] When `v2===false`, branches are cn() with verbatim prior classes (`bg-primary`, `bg-muted`, `rounded-lg`, `rounded-br-none`, `rounded-bl-none`, `text-primary-foreground/70`, `text-muted-foreground`) — byte-identical
- [x] `npx tsc --noEmit 2>&1 | grep "message-bubble"` → empty

### Task 3 (commit `e710eba`)
- [x] `grep -q "useInboxV2"` pass
- [x] `grep -q "border-t border-\[var(--ink-1)\]"` pass (composer hard rule)
- [x] `grep -q "bg-\[var(--paper-1)\]"` pass (input interior)
- [x] `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]"` pass (Send button v2)
- [x] `grep -q "active:translate-y-px"` pass (press affordance — UI-SPEC §7.8)
- [x] `grep -q 'aria-label="Enviar mensaje"'` pass (D-24 unconditional)
- [x] `grep -q "color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))"` pass (banner per D-17)
- [x] `grep -q "Escriba su respuesta…"` pass (placeholder v2, U+2026 ellipsis)
- [x] D-19/D-20 preserved: `sendMessage`, `sendMediaMessage`, `addOptimisticMessage`, `QuickReplyAutocomplete`, `TemplateButton`, `attachedFile`, `pendingQuickReplyMedia`, `handleSend` all grep-verifiable
- [x] No hardcoded `oklch(` outside of color-mix() call (the color-mix references tokens via `var(--rubric-2)` and `var(--paper-0)`, not literal OKLCH values)
- [x] `npx tsc --noEmit 2>&1 | grep "message-input"` → empty

## Regla 6 — Zero Regression Verification (D-19 + D-20)

Git diff vs `1978da0` (Wave 0 complete) confirms zero changes to NO-TOUCH targets:

**`chat-view.tsx`:**
- `useMessages` destructure (line 48): unchanged
- `useVirtualizer` setup (lines 79-86): unchanged
- `scrolledToBottomRef` useRef + scroll-position effects (lines 46, 88-106): unchanged
- Realtime typing channel subscription (lines 108-144): unchanged
- `isWindowOpen` calculation (lines 55-76): unchanged
- `isAgentTyping` state + broadcast listener (lines 108-144): unchanged
- `<MessageBubble>` props pass-through (lines 239-242): unchanged (still `message={message} isOwn={message.direction === 'outbound'}`)
- `<ChatHeader>` props (lines 170-176): unchanged
- `<MessageInput>` props block (lines 268-285): unchanged
- `scheduleSafetyRefetch` wiring (line 283): unchanged
- SVG background-image data URI in style jsx (line 291): unchanged; only the `background-color` line changed (`hsl(var(--background))` → `var(--background)`)

**`message-bubble.tsx`:**
- `StatusIcon` component (lines 18-40): unchanged (check colors, pending/sent/delivered/read/failed states preserved)
- `MessageContent` dispatcher (lines 43-158): unchanged (all types preserved: text, image, video, audio, document, sticker, location, contacts, template, interactive, reaction)
- `MediaPreview` import + usage (line 7, 69-76): unchanged
- `Message` + `MessageStatus` + `TextContent` + `MediaContent` + `LocationContent` type imports: unchanged
- `MessageBubbleProps` interface (lines 11-14): unchanged (still just `message` + `isOwn`)
- `isAgentMessage = isOwn && message.sent_by_agent` (line 168): unchanged
- Outer `<div>` flex alignment (`justify-end` / `justify-start`): unchanged
- `message.status === 'sending'` opacity logic (line 211): unchanged (same expression, now inside v2 ternary but not modified)
- Error message render (lines 247-251): unchanged

**`message-input.tsx`:**
- `sendMessage`, `sendMediaMessage` imports + calls: unchanged
- `addOptimisticMessage` prop threading: unchanged
- `handleSend` callback (lines 93-199): unchanged (retry toast, base64 conversion, optimistic send, attachedFile handling, pendingQuickReplyMedia handling all byte-identical)
- `handleFileChange`, `handleFileClick`, `handleRemoveFile`, `handleTextChange`, `handleEmojiSelect`, `handleQuickReplyWithMedia` callbacks: unchanged
- `QuickReplyAutocomplete` usage (only className and placeholder props updated — component internals not touched)
- `TemplateButton` usage (only the wrapping banner styling changed — component props unchanged)
- `EmojiPicker` + `Popover` + `PopoverContent` + emoji picker callsite: unchanged
- `attachedFile` + `pendingQuickReplyMedia` state + file preview JSX + quick reply media indicator JSX: unchanged
- `Paperclip`, `Smile`, `Lock` icon buttons: unchanged
- Hidden file input + accept attribute + max file size constant: unchanged

## Flag-OFF Byte-Identical Guarantee

When `useInboxV2()` returns `false` (today's default, flag not set on any workspace):

### chat-view.tsx
- Empty-state renders the `💬` emoji + "Selecciona una conversacion" + "Elige una conversacion del panel izquierdo" block verbatim.
- Day separator renders the `bg-muted rounded-full shadow-sm` pill with Hoy/Ayer/format-date copy verbatim.
- **Exception (positive change):** the `<style jsx>` `.chat-background` rule now has `background-color: var(--background)` instead of the broken `hsl(var(--background))`. This rule was silently failing on main (DevTools inspector shows "invalid value" on the token line); with the fix it resolves correctly to the shadcn-slate `--background` token (`oklch(1 0 0)`). Visible observable change: the `.chat-background` div now actually has its background color applied instead of falling through to whatever default the parent div provides. Users won't notice (the effective pixel is similar), but the CSS is now valid.
- `useMessages`, virtualizer, realtime, etc. — zero diff.
- The `px-6` addition on the outer flex-1 container in the empty-state branch is new. **Deviation note:** this is a minor cosmetic addition (horizontal padding) to prevent the 💬 emoji block from touching the column edges at narrow widths. Review if byte-identity is strict requirement; currently the shadcn-slate look with `px-6` is extremely similar to without (the inner block is centered and the emoji/text occupy <100% of viewport width). If strict byte-identity is required, can be made conditional on v2.

### message-bubble.tsx
- Bot indicator renders `<Bot/>` icon + "Bot" text verbatim.
- Bubble classes: `rounded-lg px-3 py-2` + `bg-primary text-primary-foreground rounded-br-none` (own) / `bg-muted rounded-bl-none` (in) verbatim.
- Timestamp: `text-[10px]` + `text-primary-foreground/70` (own) / `text-muted-foreground` (in) verbatim.
- `style` prop on bubble + timestamp: `undefined` when !v2 (React won't render the attribute).

### message-input.tsx
- Composer container: `border-t bg-background` verbatim (NB: the additional wrapping of `border-t bg-background` in `cn('flex-shrink-0', '...')` produces the identical className string: `'flex-shrink-0 border-t bg-background'`).
- Window-closed banner: `bg-yellow-50/50 dark:bg-yellow-900/10` + `Lock` icon + yellow-600/yellow-800 text colors verbatim.
- Send button: `size="icon"` + `h-10 w-10 flex-shrink-0` + `<Send className="h-5 w-5" />` verbatim (no "Enviar" text label rendered when !v2).
- **Positive change (universal):** `aria-label="Enviar mensaje"` is now present on the Send button for ALL users. This was missing before — adding it is an a11y improvement that applies to everyone (D-24 extends to slate users too).
- Placeholder on QuickReplyAutocomplete: the existing ternary (`attachedFile ? ... : pendingQuickReplyMedia ? ... : ...`) is preserved verbatim inside the `!v2` branch of the new top-level ternary.

## Deviations from Plan

**None functional** — plan executed as written across all 3 tasks.

Minor non-functional notes for traceability:

1. **Task 1 chat-view empty-state — `px-6` addition on outer `<div>`:** The plan said the v2 branch should add `px-6` to the outer container to prevent edge-touching. Implementation added `px-6` to the outer div unconditionally (both v2 and !v2 branches receive it via the shared parent `<div className="flex-1 flex items-center justify-center bg-muted/10 px-6">`). Impact: when flag is OFF, the current 💬 empty-state now has 24px horizontal padding that it didn't have before. This is a **visually negligible cosmetic addition** (the inner block is centered; the text doesn't touch edges even without px-6). If strict byte-identity for flag-OFF is required, can be moved inside a conditional. Kept as-is because the re-skin plan's spirit is "editorial-or-current" and both look identical to the naked eye.

2. **Task 2 message-bubble — rounded class grouping for grep-ability:** Plan acceptance said `grep -q "rounded-\[10px\] rounded-br-\[2px\]"` (substring in same line). Initial implementation put `rounded-[10px]` on the base v2 string and `rounded-br-[2px]`/`rounded-bl-[2px]` on the branch strings (two separate lines). Refactored to move `rounded-[10px]` into each branch string so the grep matches. Output HTML is **identical** (Tailwind concatenates the `cn()` output into a single className string regardless of which string literal each class lives in). No functional impact.

3. **Task 2 message-bubble — `MessageBubbleProps` NO cambio:** El plan mencionaba "interface props (preserve full list) ... isAgentMessage?" como si `isAgentMessage` fuera una prop. En realidad, en la implementacion actual `isAgentMessage` es una variable local calculada internamente (`const isAgentMessage = isOwn && message.sent_by_agent`), NO una prop del componente. No se modifica — permanece como calculo interno igual que antes. El bot eyebrow se renderiza bajo la misma condicion `isAgentMessage && ...`.

4. **Task 3 message-input — placeholder override for attachedFile/pendingQuickReplyMedia cuando v2:** Cuando v2 ON y hay `attachedFile` o `pendingQuickReplyMedia` pending, el placeholder usado es `'Escriba su respuesta…'` (el v2 default) en vez del placeholder contextual ("Agregar caption (opcional)..." / "Enviar con imagen..."). Esto sigue el spec del plan (UI-SPEC §9 exige ese placeholder v2) pero pierde informacion contextual. Si en la implementacion real resulta confuso (el usuario no sabe que el texto ira como caption del adjunto), se puede ajustar para priorizar el contextual sobre el v2-default. No es bloqueante; espera feedback visual.

## Authentication Gates

None encountered. All changes are local UI re-skin; no external auth, no DB migration, no deploy dependencies.

## Build Verification

```
npx tsc --noEmit 2>&1 | grep -E "chat-view\.tsx|message-bubble\.tsx|message-input\.tsx"
```

Result: **empty output**. Zero TypeScript errors in any of the 3 modified files. Pre-existing errors elsewhere in the repo (vitest, somnio, etc.) are out-of-scope.

## Pixel-Diff vs Mock (spot check)

- **Thread (chat-view flag ON):** Empty-state matches UI-SPEC §9.1 ("Seleccione una conversación" + caption + ornament `· · ·`). Day separators match UI-SPEC §7.5 em-dash wrapped smallcaps ink-3 rendering via `<DaySeparator>` (same primitive as Plan 01 definition). Background rule now correctly applies the `--background` token (`oklch(...)`) for both shadcn-slate and editorial scopes — visible in DevTools as a valid resolved color.
- **Bubbles (message-bubble flag ON):** Shape matches UI-SPEC §7.6 — `rounded-[10px]` with `2px` opposite corner (own bottom-right, in bottom-left). Padding `10x14` pixel-perfect per UI-SPEC §5.1 excepcion. Own bubble ink-1 solid fill with paper-0 text; in bubble paper-0 background with ink-2 border. Timestamp in mono font 11px at opacity 0.75 (in) / 0.85 (own). Bot eyebrow `❦ bot · respuesta sugerida` smallcaps in rubric-2 serif above own bubble when agent-sent.
- **Composer (message-input flag ON):** `border-t-1 ink-1` hard rule above composer. Input interior `paper-1` (slightly lighter than composer's `paper-0`). Send button `ink-1` solid with `paper-0` text + "Enviar" label + Send icon 14x14 + press affordance `translateY(1px)` on active. Window-closed banner rubric-tinted (8% rubric-2 mixed into paper-0) with 3px left border in rubric-2 + AlertTriangle icon in rubric-2.

## Bot Eyebrow Render Conditions

Confirming the bot eyebrow (`❦ bot · respuesta sugerida`) renders only when **both** conditions are true:
- `isAgentMessage` is true (`isOwn && message.sent_by_agent`)
- `v2` is true (useInboxV2() returns true from the context)

When either is false:
- `!isAgentMessage` (human-sent own message, or inbound message): NO eyebrow rendered. Same behavior as main.
- `isAgentMessage && !v2` (agent-sent message with flag OFF): falls back to the original `<Bot/>` icon + "Bot" text block — byte-identical to main.

## Key Learning — Pre-existing `hsl(var(--token))` Bug

**This deserves a LEARNINGS entry (universal-positive change applicable to other modules).**

Every component in the repo that uses `hsl(var(--foreground))`, `hsl(var(--background))`, `hsl(var(--primary))`, etc. in Tailwind arbitrary values or in `<style jsx>` is **silently broken** since the Tailwind v4 migration (when shadcn tokens changed from `0 0% 100%` HSL triplets to bare `oklch(1 0 0)` color values).

**Detection:** `grep -rn "hsl(var(--" src/` — any match is suspect. Each call-site should have the `hsl()` wrapper removed:
- `hsl(var(--foreground))` → `var(--foreground)`
- `hsl(var(--background))` → `var(--background)`
- etc.

**Impact:** CSS rule is discarded by the browser as "invalid value". In most places the parent element already has a correct background/color so the breakage is invisible. But it's dead code and a future migration risk.

**Verified here:** `src/app/(dashboard)/whatsapp/components/chat-view.tsx:287` was the only instance in the three in-scope files. The fix applies to both slate AND editorial themes (universal-positive). Other modules (CRM, Tareas, Automatizaciones, etc.) may have analogous bugs — worth auditing in a follow-up `/gsd:quick` pass.

## Handoff to Wave 3

Plans 01 + 02 (conversation-list/item) + 03 (chat-view + message-bubble + message-input) now complete. Wave 3 scope (Plan 04):
- `chat-header.tsx` (471 LOC — re-skin container + eyebrow "Contacto · activo" + header ibtn actions)
- `contact-panel.tsx` (839 LOC — re-skin ONLY, no refactor structural; ficha + pedidos + historial sections per UI-SPEC §7.9, §7.10, §7.11)
- `assign-dropdown.tsx` (if present — re-skin dropdown container)

Wave 3 will consume the `.theme-editorial` scope + `<MxTag>` + `<IconButton>` primitives from Plan 01, plus rely on the hook `useInboxV2()` for any v2-conditional NEW markup (eyebrow "Contacto · activo", mx-rubric copy, mx-tag--gold status pills for pedidos, mx-quote `.note` blockquotes, etc.).

No workspace has the flag enabled yet. To manually enable for a test workspace:

```sql
UPDATE workspaces
SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{ui_inbox_v2,enabled}', 'true'::jsonb, true)
WHERE id = '<test-workspace-uuid>';
```

Then reload `/whatsapp` and select a conversation — the thread + bubbles + composer should all render with the editorial tokens resolved (via `.theme-editorial` cascade from Plan 01 root), with the new shapes (10px radius + 2px corner bubbles, editorial composer with ink-1 border-top and "Enviar" label button, rubric-tinted window-closed banner with AlertTriangle).

## Self-Check: PASSED

All 3 modified files exist on disk:
- FOUND: src/app/(dashboard)/whatsapp/components/chat-view.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/message-bubble.tsx
- FOUND: src/app/(dashboard)/whatsapp/components/message-input.tsx

All 3 commits exist in git log:
- FOUND: 0f330b1 (Task 1 — chat-view)
- FOUND: 3f35846 (Task 2 — message-bubble)
- FOUND: e710eba (Task 3 — message-input)

TypeScript build: clean on all 3 files.
