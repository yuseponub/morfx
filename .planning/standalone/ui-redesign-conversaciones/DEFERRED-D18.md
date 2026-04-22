# DEFERRED — D-18 Snoozed Conversation State

**Status:** Deferred from Phase `ui-redesign-conversaciones` Plan 05 Task 2.
**Captured on:** 2026-04-22 (during Wave 2 execution).

## Reason

Discovery grep on the mandated source paths returned **zero hits** for any of the candidate snooze field names:

```bash
grep -rnE 'bot_mute_until|muted_until|snoozed_until|snooze_until|mute_until' \
  src/lib/whatsapp/types.ts \
  src/hooks/ \
  src/app/actions/conversations* \
  2>/dev/null
```

Output (verbatim):

```
(empty — zero matches)
```

Broader follow-up grep (defensive, to exclude false-negatives from alternate spellings):

```bash
grep -rnE 'bot_mute|muted|snoozed|snooze' src/lib/whatsapp/types.ts src/hooks/use-conversations.ts
```

Output:

```
(empty — zero matches)
```

The `ConversationWithDetails` type does not currently expose a snooze-capable field, and `useConversations` does not surface one either. There is no client-side data source from which to derive `isSnoozed`.

## D-18 UI Contract (CONTEXT)

From `.planning/standalone/ui-redesign-conversaciones/CONTEXT.md` + UI-SPEC §11 state matrix:

- Item in list con opacidad `0.6` + ícono `Moon` lucide (12x12) junto al timestamp mono.
- Pill `<MxTag variant="ink">` con label `"snoozed hasta {fecha}"` donde `{fecha}` se formatea con `format(d, "d MMM HH:mm", { locale: es })` en `America/Bogota` (Regla 2).

## Minimum plumbing required to un-defer

1. **Schema (Supabase migration):** Add column
   ```sql
   ALTER TABLE conversations
   ADD COLUMN bot_mute_until TIMESTAMPTZ NULL;
   CREATE INDEX idx_conversations_bot_mute_until
     ON conversations (bot_mute_until)
     WHERE bot_mute_until IS NOT NULL;
   ```
   (Standard-compliant with Regla 5 — apply to prod BEFORE deploying UI that reads the field.)
2. **Type:** Add `bot_mute_until: string | null` to `ConversationWithDetails` in `src/lib/whatsapp/types.ts` (ISO timestamp, nullable).
3. **Hook SELECT projection:** Include `bot_mute_until` in the `useConversations` fetch (whichever server action hydrates the list) and also in the per-conversation `getConversation` action.
4. **Domain mutation (Regla 3):** Add `snoozeConversation(conversationId, until)` / `unsnoozeConversation(conversationId)` in `src/lib/domain/conversations.ts` (createAdminClient + workspace_id filter + emit automation trigger if applicable).
5. **Server actions:** Wrap domain calls in server actions inside `src/app/actions/conversations.ts`.
6. **UI trigger:** Add an icon button (e.g., `Moon`) in `chat-header.tsx` or a context-menu item in `conversation-item.tsx` that prompts for duration (30min / 1h / 3h / hasta-mañana) and calls the mutation.
7. **Automation rule:** When `bot_mute_until > NOW()`, the conversational agent should skip responding (Regla 6 — changes production agent behavior, must be opt-in via workspace setting or explicit user action).

## UI to wire after field exists

Code sketch (exactly as Plan 05 Task 2 Step 2a proposes — deferred, NOT shipped):

```tsx
import { Moon } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { MxTag } from './mx-tag'

const isSnoozed = v2 && conversation.bot_mute_until
  && new Date(conversation.bot_mute_until) > new Date()

// Inside <button> className:
isSnoozed && 'opacity-60'

// Next to timestamp <RelativeTime>:
{isSnoozed && (
  <Moon className="h-3 w-3 text-[var(--ink-3)]" aria-label="Silenciada" />
)}

// After tags block:
{isSnoozed && (
  <MxTag variant="ink" className="mt-1">
    snoozed hasta {format(new Date(conversation.bot_mute_until!), "d MMM HH:mm", { locale: es })}
  </MxTag>
)}
```

## Handoff to Plan 06 (LEARNINGS.md)

Plan 06 Task 4 MUST include a LEARNINGS.md note stating:

> **D-18 (snoozed conversation state) — DEFERRED**: No snooze field on `ConversationWithDetails` at the time of Plan 05 execution. Discovery grep on `src/lib/whatsapp/types.ts` + `src/hooks/` + `src/app/actions/conversations*` returned zero hits for `bot_mute_until|muted_until|snoozed_until|snooze_until|mute_until`. See `.planning/standalone/ui-redesign-conversaciones/DEFERRED-D18.md` for the full un-defer plumbing checklist (7 steps: migration → types → hook SELECT → domain → server action → UI trigger → agent rule).
