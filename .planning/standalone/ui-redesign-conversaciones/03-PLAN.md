---
phase: ui-redesign-conversaciones
plan: 03
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/app/(dashboard)/whatsapp/components/chat-view.tsx
  - src/app/(dashboard)/whatsapp/components/message-bubble.tsx
  - src/app/(dashboard)/whatsapp/components/message-input.tsx
autonomous: true
requirements:
  - D-04
  - D-05
  - D-07
  - D-17
  - D-19
  - D-20
  - D-22
  - D-24

must_haves:
  truths:
    - "`chat-view.tsx`: cuando v2, los separadores de día se renderizan via `<DaySeparator date={messageDate} />` (UI-SPEC §7.5 estilo `— Martes 21 de abril —`); cuando !v2, se preserva el separador shadcn-pill actual byte-identical"
    - "`chat-view.tsx`: el bug pre-existente `background-color: hsl(var(--background))` en `<style jsx>` se reemplaza por `background-color: var(--background)` (PATTERNS.md flagged — el wrap `hsl()` es invalido cuando los tokens son OKLCH bare values)"
    - "`chat-view.tsx`: cuando v2, empty-state (chat no seleccionado) muestra `mx-h4 'Seleccione una conversación.'` + `mx-caption 'Los mensajes y el contexto del cliente aparecerán aquí.'` + `mx-rule-ornament '· · ·'` (UI-SPEC §9.1) — emoji 💬 se elimina; cuando !v2, empty-state actual se preserva"
    - "`message-bubble.tsx`: cuando v2 + isOwn, bubble usa `bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)] rounded-[10px] rounded-br-[2px]` (corner editorial 2px en bottom-right); cuando v2 + !isOwn, `bg-[var(--paper-0)] border border-[var(--ink-2)] text-[var(--ink-1)] rounded-[10px] rounded-bl-[2px]` (corner 2px en bottom-left)"
    - "`message-bubble.tsx`: cuando v2, padding interno del bubble es `px-[14px] py-[10px]` (UI-SPEC §5.1 excepción CRITICA — 10x14 NO 12x16, mantiene aspecto editorial)"
    - "`message-bubble.tsx`: cuando v2, timestamp usa font-mono 11px text right; bubble own opacity 0.85 color paper-2; bubble in opacity 0.75 color ink-3"
    - "`message-bubble.tsx`: cuando v2 + isAgentMessage (sugerido por bot), eyebrow `<span className='mx-rubric ...'>❦ bot · respuesta sugerida</span>` (caracter U+2766 floral heart) se renderiza arriba del bubble own; cuando !v2 o sin agent flag, NO render del eyebrow editorial — fallback al `<Bot/> + 'Bot'` actual"
    - "`message-input.tsx`: cuando v2, container tiene `border-t border-[var(--ink-1)] bg-[var(--paper-0)]` (header rule editorial); input interior `bg-[var(--paper-1)] border border-[var(--border)] rounded-[4px]` (paper-1 más claro DENTRO de paper-0); send button `bg-[var(--ink-1)] text-[var(--paper-0)] active:translate-y-px` con `aria-label='Enviar mensaje'`"
    - "`message-input.tsx`: cuando v2, ventana cerrada (24h WhatsApp) banner usa `bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border-l-[3px] border-l-[var(--rubric-2)]` con AlertTriangle icon en rubric-2 (UI-SPEC §9.1 D-17 patron de error/warning); cuando !v2, banner amarillo actual se preserva"
    - "Cero cambios funcionales en `useMessages`, `useVirtualizer`, realtime typing channel, `scrolledToBottomRef`, `scheduleSafetyRefetch`, `isWindowOpen`, `sendMessage`, `sendMediaMessage`, `addOptimisticMessage`, `MessageContent`, `StatusIcon`, `MediaPreview`, `QuickReplyAutocomplete`, `TemplateButton`, `emoji-picker` (D-19, D-20)"
    - "Build pasa: `npx tsc --noEmit` clean en los 3 archivos modificados"
  artifacts:
    - path: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      provides: "Editorial day separators + fixed background bug + editorial empty-state"
      contains: "DaySeparator"
    - path: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      provides: "Editorial bubble: 10px radius + 2px corner + paper-0/ink-1 fills + bot eyebrow"
      contains: "rounded-\\[10px\\]"
    - path: "src/app/(dashboard)/whatsapp/components/message-input.tsx"
      provides: "Editorial composer: ink-1 border-top + paper-1 input + ink-1 send + rubric error banner"
      contains: "border-t border-\\[var(--ink-1)\\]"
  key_links:
    - from: "src/app/(dashboard)/whatsapp/components/chat-view.tsx"
      to: "src/app/(dashboard)/whatsapp/components/day-separator.tsx"
      via: "import + usage when v2"
      pattern: "DaySeparator"
    - from: "src/app/(dashboard)/whatsapp/components/message-bubble.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 hook"
      pattern: "useInboxV2"
    - from: "src/app/(dashboard)/whatsapp/components/message-input.tsx"
      to: "src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx"
      via: "useInboxV2 hook"
      pattern: "useInboxV2"
---

<objective>
Wave 2 — Re-skin the chat thread (container + day separators + ruled paper background fix), the message bubbles (in/own with editorial corners + mono timestamps + bot eyebrow ornament), and the composer (paper border-top + paper-1 input + ink-1 Send + rubric warning banner). All gated by `useInboxV2()`.

**Purpose:** Convert the center column to editorial. Bubble shape (10px radius with 2px opposite corner) is the most visually distinctive element of the editorial look — it screams "letter/note" instead of "WhatsApp". Send button + composer become the editorial press affordance.

This plan also fixes a pre-existing bug in `chat-view.tsx:287`: `hsl(var(--background))` is invalid when tokens are bare OKLCH (which they are since the Tailwind v4 migration). Fix is to drop the `hsl()` wrapper — works for both shadcn-slate AND editorial themes.

**Output:** Three re-skinned components. Thread + bubble + composer are editorial when flag ON. Bug fixed for ALL users (slate or editorial). When flag OFF, every other behavior is byte-identical.
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
@src/app/(dashboard)/whatsapp/components/chat-view.tsx
@src/app/(dashboard)/whatsapp/components/message-bubble.tsx
@src/app/(dashboard)/whatsapp/components/message-input.tsx

# Wave 0 outputs:
@src/app/(dashboard)/whatsapp/components/inbox-v2-context.tsx
@src/app/(dashboard)/whatsapp/components/day-separator.tsx

<interfaces>
<!-- From Wave 0: -->

useInboxV2 hook:
```typescript
import { useInboxV2 } from './inbox-v2-context'
const v2 = useInboxV2()
```

DaySeparator component:
```typescript
<DaySeparator date={messageDate} />
// Renders: `<div className="flex justify-center py-3"><span className="mx-smallcaps text-[var(--ink-3)] ...">— Martes 21 de abril —</span></div>`
```

`.theme-editorial` provides via globals.css:
- `mx-rubric` for the bot eyebrow
- `mx-h4`, `mx-caption`, `mx-rule-ornament` for empty-state
- `--paper-0`, `--paper-1`, `--paper-2`, `--ink-1`, `--ink-2`, `--ink-3`, `--rubric-2` tokens

Existing component contracts to preserve (D-19, D-20):

`message-bubble.tsx` props (preserve):
```typescript
interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  showAvatar?: boolean
  isAgentMessage?: boolean
  // ... etc — read full file to enumerate
}
```

`message-input.tsx` exports + props (preserve all server actions: sendMessage, sendMediaMessage; preserve QuickReplyAutocomplete, TemplateButton, emoji-picker callsites — no changes to their internal logic).

`chat-view.tsx` virtualization (`useVirtualizer`), realtime typing channel, `scrolledToBottomRef`, `scheduleSafetyRefetch` — strictly preserve (D-19).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Re-skin chat-view.tsx — DaySeparator + chat-background bug fix + editorial empty-state</name>
  <files>src/app/(dashboard)/whatsapp/components/chat-view.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/chat-view.tsx (full 293 LOC — pay attention to lines 12 [imports], 144–154 [empty-state], 170–174 [chat-background div], 225–234 [day separator], 284–290 [style jsx with the `hsl(var(--background))` bug])
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.5 (thread / day separator / ruled paper note)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 12. chat-view.tsx` lines 640–684
    - .planning/standalone/ui-redesign-conversaciones/RESEARCH.md `### Pitfall 6` (paper texture safari note — informs the "ruled paper deferred" decision)
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/chat-view.tsx` with FOUR changes:

    **Step 1 — Add imports.** At the top, add:
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    import { DaySeparator } from './day-separator'
    ```
    And inside the component body:
    ```typescript
    const v2 = useInboxV2()
    ```

    **Step 2 — Fix the pre-existing `hsl(var(--background))` bug (PATTERNS.md flagged this for ALL users).** Locate the `<style jsx>` block (around lines 284–290) which currently contains:
    ```css
    .chat-background {
      background-color: hsl(var(--background));
      background-image: url("data:image/svg+xml,...");
      ...
    }
    ```
    Change `hsl(var(--background))` to `var(--background)`. The `hsl()` wrapper was correct for shadcn v3 (tokens were `H S L%` format) but is invalid for shadcn v4 (tokens are bare `oklch(...)` values). After this fix, the rule resolves correctly in BOTH `:root` (slate) and `.theme-editorial` (paper-1) scopes. This fixes a real bug — when DevTools is opened on the current main, the background-color rule shows "invalid value" and falls through to whatever default; user just doesn't notice because the parent div has its own background.

    **Step 3 — Replace the inline day separator (around lines 225–234).** The current block is:
    ```tsx
    {showDateSeparator && (
      <div className="flex justify-center py-3">
        <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
          {isToday(messageDate) ? 'Hoy' : isYesterday(messageDate) ? 'Ayer' : format(messageDate, "d 'de' MMMM, yyyy", { locale: es })}
        </span>
      </div>
    )}
    ```
    Replace with a v2-conditional:
    ```tsx
    {showDateSeparator && (
      v2 ? (
        <DaySeparator date={messageDate} />
      ) : (
        <div className="flex justify-center py-3">
          <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
            {isToday(messageDate)
              ? 'Hoy'
              : isYesterday(messageDate)
                ? 'Ayer'
                : format(messageDate, "d 'de' MMMM, yyyy", { locale: es })}
          </span>
        </div>
      )
    )}
    ```
    Note: `DaySeparator` always shows the full weekday + date format ("Martes 21 de abril"), not "Hoy" / "Ayer" — this is the UI-SPEC §7.5 editorial choice (no shorthand for today/yesterday). If a future revision wants "Hoy" / "Ayer" support inside DaySeparator, that's a follow-up to day-separator.tsx itself, not here.

    **Step 4 — Re-skin the empty-state (around lines 144–154).** The current block typically looks like:
    ```tsx
    <div className="flex-1 flex items-center justify-center bg-muted/10">
      <div className="mb-4 text-6xl opacity-20">💬</div>
      <p>...</p>
    </div>
    ```
    Wrap with v2 conditional:
    ```tsx
    <div className="flex-1 flex items-center justify-center px-6">
      {v2 ? (
        <div className="flex flex-col items-center text-center gap-3">
          <p className="mx-h4">Seleccione una conversación.</p>
          <p className="mx-caption">Los mensajes y el contexto del cliente aparecerán aquí.</p>
          <p className="mx-rule-ornament">· · ·</p>
        </div>
      ) : (
        // Preserve current empty-state JSX byte-identical (the 💬 emoji + text)
      )}
    </div>
    ```

    **Optional Step 5 — When v2, the `--paper-grain` + `--paper-fibers` textures already paint the entire `.theme-editorial` root via `background-image` (Wave 0). The local `.chat-background` SVG noise inside `<style jsx>` could be redundant. SAFE OPTION (recommended): leave the style jsx with the bug fix (`var(--background)`) — the SVG layer adds modest texture overlap with editorial root but is not visually broken.** Do NOT introduce additional ruled-paper background lines (RESEARCH Open Question 3 explicitly defers ruled paper to v2 of this re-skin).

    **DO NOT MODIFY (D-19, D-20):**
    - `useMessages`, `useVirtualizer` setup
    - Realtime typing channel subscriptions
    - `scrolledToBottomRef`, `scheduleSafetyRefetch`, `isWindowOpen` calculation
    - Virtual list measurement, scroll restoration
    - `<ChatHeader>` props block (lines 159–165)
    - `<MessageBubble>` props pass-through
    - The `<style jsx>` SVG `background-image` data URI (just the `hsl(var(--background))` → `var(--background)` swap)
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && grep -q "import { DaySeparator }" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && grep -q "<DaySeparator date={messageDate}" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && grep -q "Seleccione una conversación" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && ! grep -q "hsl(var(--background))" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && grep -q "background-color: var(--background)" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx && npx tsc --noEmit 2>&1 | grep "chat-view" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx`.
    - `grep -q "DaySeparator" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (component imported AND rendered).
    - `! grep -q "hsl(var(--background))" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (bug fixed).
    - `grep -q "background-color: var(--background)" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (bug fix replacement).
    - `grep -q "Seleccione una conversación" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (editorial empty-state copy per UI-SPEC §9.1).
    - `grep -q "Los mensajes y el contexto del cliente aparecerán aquí" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx`.
    - `grep -q "mx-h4" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` AND `grep -q "mx-caption" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` AND `grep -q "mx-rule-ornament" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx`.
    - The file STILL contains: `useMessages`, `useVirtualizer`, `scrolledToBottomRef`, `scheduleSafetyRefetch`, `isWindowOpen`, `MessageBubble`, `ChatHeader` — verify with grep (Regla 6).
    - The 💬 emoji empty-state markup is preserved INSIDE the `!v2` branch (not deleted).
    - `! grep "oklch(" src/app/\(dashboard\)/whatsapp/components/chat-view.tsx` (no hardcoded OKLCH in component code).
    - `npx tsc --noEmit` clean for `chat-view.tsx`.
  </acceptance_criteria>
  <done>chat-view uses DaySeparator when flag ON; empty-state is editorial when flag ON; pre-existing `hsl(var(--background))` bug is fixed for ALL users; non-v2 path is byte-identical except for the bug fix. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Re-skin message-bubble.tsx — editorial bubble (10px radius + 2px corner + paper-0/ink-1 fills + bot eyebrow)</name>
  <files>src/app/(dashboard)/whatsapp/components/message-bubble.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/message-bubble.tsx (full 226 LOC — pay attention to lines 18–40 [StatusIcon — DO NOT TOUCH], 45–157 [MessageContent dispatcher — DO NOT TOUCH], 169–174 [bubble container outer wrapping], 177–182 [current Bot indicator], 184–192 [bubble container with isOwn alternation], 199–214 [timestamp + status])
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.6 (full bubble spec)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 15. message-bubble.tsx` lines 767–821
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/message-bubble.tsx` with THREE changes:

    **Step 1 — Add imports + hook call:**
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    // ... inside component body:
    const v2 = useInboxV2()
    ```

    **Step 2 — Re-skin the bubble container className (around lines 184–192).** The current alternation is:
    ```tsx
    <div
      className={cn(
        'relative rounded-lg px-3 py-2 shadow-sm',
        isOwn
          ? 'bg-primary text-primary-foreground rounded-br-none'
          : 'bg-muted rounded-bl-none',
        message.status === ('sending' as any) && 'opacity-70'
      )}
    >
    ```
    Change to:
    ```tsx
    <div
      className={cn(
        'relative shadow-sm',
        v2
          ? cn(
              'px-[14px] py-[10px] rounded-[10px] text-[15px] leading-[1.5]',
              isOwn
                ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)] rounded-br-[2px]'
                : 'bg-[var(--paper-0)] text-[var(--ink-1)] border border-[var(--ink-2)] rounded-bl-[2px]'
            )
          : cn(
              'rounded-lg px-3 py-2',
              isOwn
                ? 'bg-primary text-primary-foreground rounded-br-none'
                : 'bg-muted rounded-bl-none'
            ),
        message.status === ('sending' as any) && 'opacity-70'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
    >
    ```

    **CRITICAL — UI-SPEC §5.1 excepción:** padding when v2 is exactly `10px 14px` (NOT `12px 16px`). Per UI-SPEC: "10/14 es pixel-perfect del mock para que el texto no flote y las esquinas se vean tipográficas. La diferencia vs 12/16 SÍ se percibe (bubble se siente inflado)". Use `px-[14px] py-[10px]` arbitrary values.

    Border-radius is `10px` overall with the OPPOSITE corner of the "tail" reduced to `2px`:
    - Own bubble (right side, "tail" on bottom-right): `rounded-[10px] rounded-br-[2px]`
    - In bubble (left side, "tail" on bottom-left): `rounded-[10px] rounded-bl-[2px]`

    **Step 3 — Re-skin the bot eyebrow (around lines 177–182).** The current pattern is:
    ```tsx
    {isAgentMessage && (
      <div className="flex items-center gap-1 mb-0.5 mr-1">
        <Bot className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Bot</span>
      </div>
    )}
    ```
    Wrap in v2 conditional:
    ```tsx
    {isAgentMessage && (
      v2 ? (
        <span
          className="block text-right mb-1 mr-1 text-[11px] uppercase tracking-[0.08em] font-semibold text-[var(--rubric-2)]"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          ❦ bot · respuesta sugerida
        </span>
      ) : (
        <div className="flex items-center gap-1 mb-0.5 mr-1">
          <Bot className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Bot</span>
        </div>
      )
    )}
    ```

    The `❦` character is U+2766 FLORAL HEART. Use the literal Unicode character in the JSX (NOT an HTML entity — would render as `&#10086;`). Use a serif font for the eyebrow (matches handoff §6 — eyebrow uses small-caps serif via mx-rubric utility class).

    **Step 4 — Re-skin the timestamp + status icons (around lines 199–214).** The current line typically reads:
    ```tsx
    <span className={cn('text-[10px]', isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
      {formatTime(message.created_at)}
    </span>
    {/* StatusIcon */}
    ```
    Change to:
    ```tsx
    <span
      className={cn(
        v2
          ? cn(
              'text-[11px] tracking-[0.02em]',
              isOwn ? 'text-[var(--paper-2)] opacity-85' : 'text-[var(--ink-3)] opacity-75'
            )
          : cn(
              'text-[10px]',
              isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
            )
      )}
      style={v2 ? { fontFamily: 'var(--font-mono)', fontWeight: 500 } : undefined}
    >
      {formatTime(message.created_at)}
    </span>
    ```

    **DO NOT MODIFY (D-19, D-20 — explicit list):**
    - `StatusIcon` component (lines 18–40) — preserve check colors exactly
    - `MessageContent` dispatcher (lines 45–157) — handles media/template/quickReply/reactions/location all preserved
    - `MediaPreview` import + usage (line 7, 69–76)
    - `Message` type, props interface
    - The bubble's outer wrapper `<div>` that handles `flex justify-end/start` for own/in alignment
    - The `message.status === 'sending'` opacity logic
    - Click handlers, long-press handlers (none should exist)
    - Reaction renderers, quote/reply renderers
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && grep -q "rounded-\[10px\] rounded-br-\[2px\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && grep -q "rounded-\[10px\] rounded-bl-\[2px\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && grep -q "px-\[14px\] py-\[10px\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && grep -q "❦ bot · respuesta sugerida" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && grep -q "var(--font-mono)" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx && npx tsc --noEmit 2>&1 | grep "message-bubble" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx`.
    - `grep -q "rounded-\[10px\] rounded-br-\[2px\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (own bubble corner).
    - `grep -q "rounded-\[10px\] rounded-bl-\[2px\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (in bubble corner).
    - `grep -q "px-\[14px\] py-\[10px\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (UI-SPEC §5.1 excepción CRITICA — 10x14 padding).
    - `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (own bubble fill).
    - `grep -q "bg-\[var(--paper-0)\] text-\[var(--ink-1)\] border border-\[var(--ink-2)\]" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (in bubble fill + border).
    - `grep -q "❦ bot · respuesta sugerida" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (literal U+2766 + medium-dot).
    - `grep -q "var(--rubric-2)" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (bot eyebrow color).
    - `grep -q "var(--font-mono)" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (timestamp uses mono).
    - The file STILL contains: `StatusIcon`, `MessageContent`, `MediaPreview`, `formatTime`, `Bot` icon import — verify all are preserved.
    - `! grep "oklch(" src/app/\(dashboard\)/whatsapp/components/message-bubble.tsx` (no hardcoded OKLCH).
    - When `v2 === false`, the visible classes are byte-identical to current (preserve the original cn() branches verbatim).
    - `npx tsc --noEmit` clean for `message-bubble.tsx`.
  </acceptance_criteria>
  <done>Bubble is editorial when flag ON: 10px radius with 2px opposite corner, paper-0 in / ink-1 own, mono 11px timestamp, ❦ bot eyebrow ornament for agent messages. When flag OFF, byte-identical to current. Build clean.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Re-skin message-input.tsx — editorial composer (border-top ink-1 + paper-1 input + ink-1 send + rubric warning banner)</name>
  <files>src/app/(dashboard)/whatsapp/components/message-input.tsx</files>
  <read_first>
    - src/app/(dashboard)/whatsapp/components/message-input.tsx (full 441 LOC — pay attention to: composer container around line 289, window-closed branch at lines 264–286, QuickReplyAutocomplete at lines 409–424, Send button at lines 427–436)
    - .planning/standalone/ui-redesign-conversaciones/UI-SPEC.md §7.8 (composer full spec), §9.1 D-17 (error banner pattern)
    - .planning/standalone/ui-redesign-conversaciones/PATTERNS.md `### 16. message-input.tsx` lines 824–868
  </read_first>
  <action>
    Modify `src/app/(dashboard)/whatsapp/components/message-input.tsx` with FOUR changes:

    **Step 1 — Add imports + hook:**
    ```typescript
    import { useInboxV2 } from './inbox-v2-context'
    // ... inside component:
    const v2 = useInboxV2()
    ```

    **Step 2 — Re-skin the composer container (around line 289).** Current:
    ```tsx
    <div className="flex-shrink-0 border-t bg-background">
    ```
    Change to:
    ```tsx
    <div className={cn(
      'flex-shrink-0',
      v2 ? 'border-t border-[var(--ink-1)] bg-[var(--paper-0)]' : 'border-t bg-background'
    )}>
    ```
    The `border-t border-[var(--ink-1)]` is the editorial "hard rule" between thread and composer per UI-SPEC §7.8.

    **Step 3 — Re-skin the input interior (around lines 409–424).** The QuickReplyAutocomplete renders a textarea inside this container; its className typically reads `min-h-[40px] max-h-[120px] py-2 ...`. Wrap the existing className with v2 conditional adding paper-1 background + editorial border + radius:

    Find the className prop on `<QuickReplyAutocomplete>` (or whatever input component is used inside the composer; if it's an `<Input>` or raw `<textarea>` modify its className directly). Add the v2 styling:
    ```tsx
    className={cn(
      // existing classes preserved verbatim
      'min-h-[40px] max-h-[120px] py-2 px-3 ...',
      v2 && 'bg-[var(--paper-1)] border border-[var(--border)] rounded-[4px] text-[14px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]'
    )}
    ```
    If `QuickReplyAutocomplete` does not accept className overrides at the inner textarea level, target the wrapper around it via a `cn` on the parent flex row.

    **Placeholder when v2:** Per UI-SPEC §9, the placeholder MUST be `Escriba su respuesta…` (with U+2026 ellipsis). If the existing placeholder is something else, override it via the prop when v2:
    ```tsx
    placeholder={v2 ? 'Escriba su respuesta…' : currentPlaceholder}
    ```

    **Step 4 — Re-skin the Send button (around lines 427–436).** Current:
    ```tsx
    <Button
      size="icon"
      className="h-10 w-10 flex-shrink-0"
      onClick={handleSend}
      disabled={(!text.trim() && !attachedFile && !pendingQuickReplyMedia) || isLoading}
      title="Enviar mensaje"
    >
      <Send className="h-5 w-5" />
    </Button>
    ```
    Change to add `aria-label` (D-24 — applies to ALL users; was missing) AND v2 styling:
    ```tsx
    <Button
      size={v2 ? 'default' : 'icon'}
      className={cn(
        'flex-shrink-0',
        v2
          ? 'h-auto px-[16px] py-[8px] text-[13px] font-semibold gap-1.5 active:translate-y-px bg-[var(--ink-1)] text-[var(--paper-0)] border border-[var(--ink-1)] hover:bg-[var(--ink-2)] rounded-[4px]'
          : 'h-10 w-10'
      )}
      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      onClick={handleSend}
      disabled={(!text.trim() && !attachedFile && !pendingQuickReplyMedia) || isLoading}
      title="Enviar mensaje"
      aria-label="Enviar mensaje"
    >
      <Send className={v2 ? 'h-[14px] w-[14px]' : 'h-5 w-5'} />
      {v2 && <span>Enviar</span>}
    </Button>
    ```

    UI-SPEC §7.8: when v2, button shows icon + "Enviar" text label (`gap 6px` between them via `gap-1.5`). Padding `8px 16px` (rounded from mock's `8px 14px` per UI-SPEC §5.1 grid alignment). Press affordance via `active:translate-y-px`.

    **Step 5 — Re-skin the window-closed branch (around lines 264–286).** Current:
    ```tsx
    <div className="flex-shrink-0 px-4 py-3 border-t bg-yellow-50/50 dark:bg-yellow-900/10">
      {/* yellow warning banner */}
    </div>
    ```
    Change to v2-conditional editorial banner per UI-SPEC §9.1 D-17:
    ```tsx
    <div className={cn(
      'flex-shrink-0 px-4 py-3 border-t',
      v2
        ? 'bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border-l-[3px] border-l-[var(--rubric-2)] border-t-[var(--ink-1)] text-[var(--ink-1)]'
        : 'bg-yellow-50/50 dark:bg-yellow-900/10'
    )}>
      {/* preserve internal content; if there's an icon, swap to AlertTriangle when v2 */}
    </div>
    ```

    If the banner has an icon today (likely a yellow Info or AlertTriangle), update the icon color to `text-[var(--rubric-2)]` when v2. The banner copy ("La ventana de 24 horas ha expirado..." or similar) stays the same — only visual styling changes.

    **DO NOT MODIFY (D-19, D-20):**
    - `sendMessage`, `sendMediaMessage` server actions
    - `addOptimisticMessage`, optimistic send retry toast
    - `QuickReplyAutocomplete` component internals (only its callsite className)
    - `TemplateButton` component internals (only its callsite className via cascade)
    - `emoji-picker.tsx` (intentional slate per CONTEXT — modal exclusion via Radix portal)
    - File upload flow, base64 conversion, `attachedFile` state
    - `pendingQuickReplyMedia` state, quick reply media flow
    - The `text` state, `setText`, `handleSend` handler logic
    - `isLoading` state propagation
    - The `<TemplateButton>` and emoji picker `<Popover>` callsites (only re-skin their host icon buttons via cascade — see Wave 4 ARIA pass for any aria-label additions)
  </action>
  <verify>
    <automated>grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && grep -q "border-t border-\[var(--ink-1)\]" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && grep -q "bg-\[var(--paper-1)\]" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && grep -q "active:translate-y-px" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && grep -q "aria-label=\"Enviar mensaje\"" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && grep -q "color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))" src/app/\(dashboard\)/whatsapp/components/message-input.tsx && npx tsc --noEmit 2>&1 | grep "message-input" | (! grep -E "error|Error")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -q "useInboxV2" src/app/\(dashboard\)/whatsapp/components/message-input.tsx`.
    - `grep -q "border-t border-\[var(--ink-1)\]" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (composer hard rule).
    - `grep -q "bg-\[var(--paper-1)\]" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (input interior).
    - `grep -q "bg-\[var(--ink-1)\] text-\[var(--paper-0)\]" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (Send button v2).
    - `grep -q "active:translate-y-px" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (press affordance UI-SPEC §7.8).
    - `grep -q "aria-label=\"Enviar mensaje\"" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (D-24 — applied to all users).
    - `grep -q "color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (warning banner per D-17).
    - `grep -q "Escriba su respuesta…" src/app/\(dashboard\)/whatsapp/components/message-input.tsx` (placeholder per UI-SPEC §9).
    - The file STILL contains: `sendMessage`, `sendMediaMessage`, `addOptimisticMessage`, `QuickReplyAutocomplete`, `TemplateButton`, `attachedFile`, `pendingQuickReplyMedia`, `handleSend` — verify all preserved.
    - `! grep "oklch(0\." src/app/\(dashboard\)/whatsapp/components/message-input.tsx | grep -v "color-mix"` (no hardcoded literal OKLCH outside color-mix calls — color-mix uses var() refs).
    - `npx tsc --noEmit` clean for `message-input.tsx`.
  </acceptance_criteria>
  <done>Composer is editorial when flag ON: ink-1 border-top, paper-1 input, ink-1 Send button with text label + press affordance, rubric-tinted warning banner. `aria-label` added unconditionally on Send (D-24). When flag OFF, byte-identical to current except for the aria-label. Build clean.</done>
</task>

</tasks>

<verification>
After all 3 tasks:

1. `npx tsc --noEmit 2>&1 | grep -E "chat-view|message-bubble|message-input" | (! grep -E "error|Error")` returns 0.
2. Manual smoke (with flag ON):
   - Day separator: scroll up in a long thread — see `— Martes 21 de abril —` smallcaps separators between days; "Hoy" / "Ayer" labels NO longer appear (intentional editorial choice).
   - Bubble own (right): ink-1 dark bg + paper-0 text + 10px radius with 2px corner on bottom-right.
   - Bubble in (left): paper-0 bg + ink-2 border + ink-1 text + 10px radius with 2px corner on bottom-left.
   - Bubble padding tighter than current (10x14 not 12x16) — visible difference.
   - Send button shows "Enviar" text + Send icon, ink-1 bg + paper-0 text. Press shows 1px down translate.
   - Bot eyebrow (when agent suggests message): `❦ bot · respuesta sugerida` smallcaps in rubric-2 color above own bubble.
   - Window-closed banner (24h WhatsApp expired): rubric-tinted background + 3px left border in rubric-2 + AlertTriangle icon in rubric-2.
3. Manual smoke (with flag OFF):
   - Day separator: pill-shape with "Hoy" / "Ayer" / `21 de abril, 2026` (current behavior preserved).
   - Bubble: rounded-lg, primary/muted colors, no editorial corner cuts.
   - Send button: shadcn icon-only ghost button.
   - Bot indicator: original Bot icon + "Bot" text.
   - Window-closed banner: yellow background.
4. Pre-existing bug fixed for ALL users: in DevTools, on the chat-background div, `background-color` resolves to `oklch(...)` value (not "invalid").
5. Git diff for D-19 NO-TOUCH targets (`useMessages`, `useVirtualizer`, realtime, `sendMessage`, `MessageContent`, `MediaPreview`, etc.): zero changes.
</verification>

<success_criteria>
- All 3 tasks pass automated verify.
- Build clean.
- With flag ON, thread + bubbles + composer match UI-SPEC §7.5 / §7.6 / §7.8 / §9.1.
- With flag OFF, byte-identical except for the `hsl()` bug fix (which is a positive change).
- D-19 / D-20 NO-TOUCH targets verifiable unchanged.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-redesign-conversaciones/03-SUMMARY.md` with:
- Commits (one per task)
- Note the pre-existing `hsl()` bug fix (deserves explicit mention in LEARNINGS — universal-positive change)
- Pixel-diff vs mock for thread + bubbles + composer
- Confirmation that bot eyebrow renders only when `isAgentMessage && v2` (otherwise falls back to existing Bot icon)
- Handoff to Wave 3: chat-header + contact-panel.
</output>
