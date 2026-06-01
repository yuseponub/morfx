---
phase: v4-media-audio-image
plan: 02
type: execute
wave: 1
depends_on: [01]   # migration must be applied in prod (Regla 5) before this code is pushed
baseline_sha: "85092058e4495fc0e97ff0be2c6da582ca06c563"
files_modified:
  - src/lib/domain/messages.ts
  - src/lib/whatsapp/types.ts
autonomous: true
requirements:
  - D-03   # Audio→intents: transcript completo a comprehension (transcript is the persisted text)
  - D-04   # Persistencia: solo transcript de audio
  - D-09   # messages.transcription (the column written here)
must_haves:
  truths:
    - "A new domain function setMessageTranscription(ctx, {wamid, transcription}) performs UPDATE ... WHERE wamid AND workspace_id"
    - "The UPDATE goes through the domain layer (createAdminClient), never a raw insert/update elsewhere (Regla 3)"
    - "Message interface exposes transcription: string | null so the inbox fetch (select('*')) types it"
  artifacts:
    - path: "src/lib/domain/messages.ts"
      provides: "setMessageTranscription domain write (UPDATE by wamid, scoped by workspace_id)"
      contains: "export async function setMessageTranscription"
    - path: "src/lib/whatsapp/types.ts"
      provides: "transcription field on Message"
      contains: "transcription: string | null"
  key_links:
    - from: "setMessageTranscription"
      to: "messages table"
      via: "createAdminClient().from('messages').update(...).eq('wamid', ...).eq('workspace_id', ...)"
      pattern: "\\.update\\(.*transcription"
---

<objective>
Add the domain write path (Regla 3) for persisting an audio transcript, and expose the new column
on the `Message` type so the inbox fetch surfaces it.

Purpose: D-04/D-09 — the transcript is stored via the domain layer as an UPDATE keyed by `wamid`
(the message row was already INSERTed by `receiveMessage` BEFORE the media-gate runs — RQ-6 /
Pitfall 2, so this is an UPDATE, never a second INSERT).
Output: `setMessageTranscription()` in `domain/messages.ts` + `transcription` on `Message`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-media-audio-image/RESEARCH.md

<interfaces>
<!-- Extracted from codebase — executor uses these directly, no exploration needed. -->

domain/messages.ts already uses this pattern (receiveMessage, messages.ts:391-466):
```ts
import { createAdminClient } from '@/lib/supabase/admin'
// inside fn:
const supabase = createAdminClient()
await supabase.from('messages').insert({ ...workspace_id: ctx.workspaceId, wamid: params.waMessageId, ... })
```
The row is keyed by `wamid` (the WhatsApp message id). receiveMessage inserts it (messages.ts:399-413)
BEFORE the Inngest media-gate runs. So persisting the transcript is an UPDATE WHERE wamid = ... AND workspace_id = ...

DomainContext / DomainResult are the existing domain types used by every fn in this file
(receiveMessage signature: `(ctx: DomainContext, params: ReceiveMessageParams): Promise<DomainResult<ReceiveMessageResult>>`).
Use the SAME `ctx: DomainContext` shape (it carries `workspaceId`).

Message interface (src/lib/whatsapp/types.ts:69-88) — current fields end with:
```ts
  media_url: string | null
  media_mime_type: string | null
  media_filename: string | null
  template_name: string | null
  sent_by_agent: boolean
  timestamp: string
  created_at: string
}
```
The inbox fetch uses `.select('*')` (src/app/actions/messages.ts) → the new column flows automatically
once it is on the interface.
</interfaces>

<facts>
- RQ-6 (HIGH): message INSERT happens in `receiveMessage` (messages.ts:399-413) keyed by `wamid`, BEFORE the media-gate. Transcription = UPDATE by `wamid`, never insert (Pitfall 2).
- Regla 3: ALL mutations go through domain. This function is the ONLY place the transcription column is written.
- domain/messages.ts today has NO update-an-existing-message function (only send*/receiveMessage/getLastInbound/getInboundConversations). This adds the first one.
</facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add setMessageTranscription domain function</name>
  <files>src/lib/domain/messages.ts, src/lib/domain/__tests__/messages-transcription.test.ts</files>
  <read_first>
    - `src/lib/domain/messages.ts:391-466` (receiveMessage — copy the createAdminClient + DomainContext + DomainResult + error-handling shape exactly).
    - `src/lib/domain/messages.ts:1-30` (imports: confirm `createAdminClient`, `DomainContext`, `DomainResult` are already imported here).
  </read_first>
  <behavior>
    - setMessageTranscription({workspaceId}, {wamid, transcription}) issues UPDATE messages SET transcription=$transcription WHERE wamid=$wamid AND workspace_id=$workspaceId.
    - Returns DomainResult success on a matched row.
    - Filters by BOTH wamid AND workspace_id (workspace isolation — never trust an unscoped wamid).
    - On Supabase error, returns { success: false, error } (no throw), mirroring receiveMessage.
    - Empty/missing wamid → returns { success: false } early (no UPDATE) — defensive.
  </behavior>
  <action>
    Add an exported `setMessageTranscription` to `src/lib/domain/messages.ts`:

    ```ts
    export async function setMessageTranscription(
      ctx: DomainContext,
      params: { wamid: string; transcription: string }
    ): Promise<DomainResult<{ updated: boolean }>> {
      if (!params.wamid) {
        return { success: false, error: 'missing wamid' }
      }
      const supabase = createAdminClient()
      try {
        const { error } = await supabase
          .from('messages')
          .update({ transcription: params.transcription })
          .eq('wamid', params.wamid)
          .eq('workspace_id', ctx.workspaceId)   // Regla 3 workspace isolation
        if (error) {
          console.error('[domain/messages] setMessageTranscription failed:', error.message)
          return { success: false, error: error.message }
        }
        return { success: true, data: { updated: true } }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error('[domain/messages] setMessageTranscription failed:', msg)
        return { success: false, error: msg }
      }
    }
    ```

    Match the exact import names already present in the file (do NOT introduce a new supabase import).
    Add a unit test file `src/lib/domain/__tests__/messages-transcription.test.ts` that mocks
    `createAdminClient` (vitest, following the mocking pattern used by other domain tests in this repo —
    grep an existing `src/lib/domain/__tests__/*.test.ts` first for the mock shape) and asserts:
    (a) the chained `.update().eq('wamid', ...).eq('workspace_id', ...)` is called with the right args;
    (b) empty wamid returns `{ success: false }` without calling update;
    (c) a supabase error returns `{ success: false, error }`.
  </action>
  <acceptance_criteria>
    - `grep -c "export async function setMessageTranscription" src/lib/domain/messages.ts` returns 1.
    - `grep -E "\.eq\('wamid'" src/lib/domain/messages.ts` AND `grep -E "\.eq\('workspace_id'" src/lib/domain/messages.ts` both present inside the new function (workspace isolation).
    - No raw `@supabase/supabase-js` import added; reuses existing `createAdminClient`.
    - `npx vitest run src/lib/domain/__tests__/messages-transcription.test.ts` passes (3 cases).
    - `npx tsc --noEmit` clean for the touched files.
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Add transcription to the Message interface</name>
  <files>src/lib/whatsapp/types.ts</files>
  <read_first>
    - `src/lib/whatsapp/types.ts:69-88` (Message interface — add the field alongside the other nullable media fields).
  </read_first>
  <action>
    Add `transcription: string | null` to the `Message` interface (place it near `media_filename` /
    `media_url` for cohesion). This is the only change — the inbox fetch already uses `.select('*')`
    (RQ-5) so the column flows through automatically once typed.
  </action>
  <acceptance_criteria>
    - `grep -c "transcription: string | null" src/lib/whatsapp/types.ts` returns 1.
    - `npx tsc --noEmit` clean (no consumer breaks — it's an additive nullable field).
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `setMessageTranscription` exists, scoped by `wamid` + `workspace_id`, no raw supabase import (Regla 3).
- `Message.transcription` typed; inbox fetch (`select('*')`) surfaces it (RQ-5).
- Per-commit `npx tsc --noEmit` clean; domain unit test green.
- Regla 6: no non-v4 agent code touched (this is a domain + types change consumed only by the v4 branch in Wave 2).
</verification>

<success_criteria>
- A domain write path for the transcript exists and is workspace-isolated.
- The Message type carries the transcript for the UI (Wave 4).
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-media-audio-image/02-SUMMARY.md` documenting the
new domain function signature and the Message field, for Waves 3-4 to consume.
</output>
