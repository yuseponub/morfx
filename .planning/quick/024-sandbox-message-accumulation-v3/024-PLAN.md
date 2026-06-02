---
phase: quick-024
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
autonomous: true

must_haves:
  truths:
    - "When user sends messages during delay and NO templates were sent yet (interruptedAtIndex===0), all messages are combined and processed as one turn"
    - "When user sends messages after at least 1 template was sent (interruptedAtIndex>0), only last queued message is processed solo (current behavior)"
    - "System note reflects accumulation when combining, interruption when not"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx"
      provides: "Two-path post-interruption logic"
      contains: "interruptedAtIndex === 0"
  key_links:
    - from: "post-loop processing block"
      to: "handleSendMessage recursive call"
      via: "combined content string when interruptedAtIndex===0"
      pattern: "content.*queued\\.join"
---

<objective>
Implement message accumulation in sandbox v3: when interruption happens before any template is sent (interruptedAtIndex===0), combine original + queued messages into one turn. When interruption happens after sending templates, keep current behavior (process last queued only).

Purpose: Simulates production behavior where multiple fast messages before agent responds should be treated as one combined input.
Output: Updated sandbox-layout.tsx with two-path post-interruption logic.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Two-path post-interruption logic with accumulation</name>
  <files>src/app/(dashboard)/sandbox/components/sandbox-layout.tsx</files>
  <action>
  Modify the post-loop processing block (lines ~432-442) to implement two paths:

  **Path A: interruptedAtIndex === 0 (no templates sent)**
  - Combine original `content` + all queued messages: `[content, ...queued].join('\n')`
  - Add system note BEFORE recursive call: `[SANDBOX: Mensajes acumulados - ${queued.length + 1} mensaje(s) combinado(s)]`
  - Call `handleSendMessage(combinedContent, { skipAddUser: true })`
  - The `content` variable is available in scope (parameter of handleSendMessage)

  **Path B: interruptedAtIndex > 0 OR no interruption (interrupted===false)**
  - Keep current behavior: take last queued message, process solo
  - System note already exists from the interruption loop (no change)

  Also update the interruption system note inside the for-loop (line ~388):
  - When `interruptedAtIndex === 0`: change note to `[SANDBOX: Secuencia interrumpida en index 0 - acumulando ${queued.length + 1} mensaje(s)]` — wait, the queued ref may not have all messages yet at this point. Instead, keep the generic interruption note in the loop and add the accumulation note in the post-loop Path A block.

  Actually, simpler approach: Leave the for-loop system note as-is (it correctly says how many templates were not sent). In Path A post-loop, REPLACE it by removing the last system note and adding the accumulation one. No — that's fragile. Better: in the for-loop, when `interruptedAtIndex === 0`, use a different note text: `[SANDBOX: Secuencia interrumpida antes de enviar - acumulando mensajes]`. When `interruptedAtIndex > 0`, keep current text.

  Add PROD-TRANSLATE comment above the two-path block:
  ```
  // PROD-TRANSLATE: En produccion, antes de procesar templates en el Inngest job,
  // consultar si hay mensajes mas recientes. Si sentCount === 0 y hay mensajes nuevos,
  // combinar todos los mensajes pendientes y re-procesar como un solo turno.
  // Si sentCount > 0, procesar el mensaje nuevo como turno independiente.
  ```
  </action>
  <verify>
  1. `npx tsc --noEmit` passes (no type errors)
  2. Manual review: search for `interruptedAtIndex === 0` in sandbox-layout.tsx — must exist
  3. Manual review: search for `Mensajes acumulados` — must exist in system note
  4. Manual review: search for `PROD-TRANSLATE` — the new comment must exist near the two-path block
  </verify>
  <done>
  - When interruptedAtIndex===0 and queued messages exist: combined content is passed to recursive handleSendMessage call with accumulation system note
  - When interruptedAtIndex>0 and queued messages exist: last queued message processed solo (unchanged behavior)
  - PROD-TRANSLATE comment documents production equivalent
  - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- Code review confirms two distinct paths based on interruptedAtIndex value
- System notes differentiate accumulation (index 0) from interruption (index > 0)
- PROD-TRANSLATE comment present
</verification>

<success_criteria>
- sandbox-layout.tsx has two-path post-interruption logic
- Path A (interruptedAtIndex===0): combines original + queued, processes as one turn
- Path B (interruptedAtIndex>0): processes last queued solo (unchanged)
- Appropriate system notes for each path
- PROD-TRANSLATE comment for production guidance
- No other files modified
</success_criteria>

<output>
After completion, create `.planning/quick/024-sandbox-message-accumulation-v3/024-SUMMARY.md`
</output>
