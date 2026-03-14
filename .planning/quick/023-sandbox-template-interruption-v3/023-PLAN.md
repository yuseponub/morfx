---
phase: quick-023
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
autonomous: true

must_haves:
  truths:
    - "When v3 returns multiple templates and user sends message during delay, remaining templates are NOT displayed"
    - "The interrupting user message is processed as a fresh turn through the v3 pipeline"
    - "Debug panel shows interrupted templates count and queued message info"
    - "If no interruption occurs, all templates display normally (no regression)"
  artifacts:
    - path: "src/app/(dashboard)/sandbox/components/sandbox-layout.tsx"
      provides: "Interruption logic in handleSendMessage delay loop"
  key_links:
    - from: "sandbox-layout.tsx handleSendMessage delay loop"
      to: "queuedMessages ref check"
      via: "ref-based check between each template delay"
      pattern: "queuedMessagesRef\\.current\\.length"
---

<objective>
Implement template interruption in the sandbox frontend for the v3 agent.

Purpose: When the v3 engine returns N templates that are displayed with delays, and the user sends a new message during those delays, the remaining templates should be interrupted (not displayed). The new user message should then be processed as a fresh turn. This simulates the production pre-send check behavior but entirely in the frontend.

Output: Modified sandbox-layout.tsx with interruption logic in the template delay loop.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(dashboard)/sandbox/components/sandbox-layout.tsx
@src/lib/agents/engine-adapters/production/messaging.ts
@src/lib/sandbox/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement template interruption in sandbox-layout.tsx delay loop</name>
  <files>src/app/(dashboard)/sandbox/components/sandbox-layout.tsx</files>
  <action>
The current code has these pieces already working:
- Line 62: `queuedMessages` state exists
- Lines 310-313: When v3 is typing and user sends message, it queues the message (does NOT block input)
- Lines 348-364: Delay loop iterates `result.messages`, awaits delay, then adds each assistant message
- Line 368: `setQueuedMessages([])` clears queue after loop (BUG: discards queued messages without processing)
- Line 451: Input is NOT disabled for v3 (`inputDisabled={agentId === 'somnio-sales-v3' ? false : isTyping}`)

The problem: the delay loop never checks `queuedMessages` between templates. Even if the user sent a message during a delay, ALL templates still display.

Changes needed:

1. **Create a `queuedMessagesRef`** (a `useRef<string[]>([])`) that mirrors `queuedMessages` state. The delay loop is async and cannot read React state reliably — it needs a ref.
   - Add: `const queuedMessagesRef = useRef<string[]>([])`
   - Add a `useEffect` to keep it synced: `useEffect(() => { queuedMessagesRef.current = queuedMessages }, [queuedMessages])`
   - In the queue setter (line ~311), ALSO write to the ref directly for immediate visibility:
     ```ts
     setQueuedMessages(prev => {
       const next = [...prev, content]
       queuedMessagesRef.current = next
       return next
     })
     ```

2. **Add interruption check inside the template delay loop** (lines 348-364). After the delay `await` and BEFORE adding the assistant message, check if `queuedMessagesRef.current.length > 0`. If so:
   - Do NOT add the current template or any remaining templates
   - Log to console: `[Sandbox V3] Template sequence interrupted at index ${i}/${result.messages.length} by user message`
   - Add a system note message: `[SANDBOX: Secuencia interrumpida - ${result.messages.length - i} template(s) no enviado(s)]`
   - Break out of the loop
   - Set `isTyping(false)`
   - Store the interrupted info for debug: update debugTurn with `preSendCheck` field before adding to debugTurns

   // PROD-TRANSLATE: En produccion, este check se hace en ProductionMessagingAdapter.hasNewInboundMessage()
   // (src/lib/agents/engine-adapters/production/messaging.ts:62-74) consultando la DB con
   // .gt('timestamp', triggerTimestamp). El equivalente aqui es queuedMessagesRef.current.length > 0.
   // IMPORTANTE: El check de produccion actual NO maneja errores del query (lineas 67-73 no destructuran error).
   // Cuando se traduzca, destructurar { count, error }, retry 1 vez si error, y fail-safe
   // (asumir interrupcion si el query falla, porque es mejor NO enviar que enviar duplicado).

3. **After the loop, process queued messages** instead of discarding them. Replace `setQueuedMessages([])` with:
   - Grab queued messages from ref: `const queued = queuedMessagesRef.current`
   - Clear both state and ref: `setQueuedMessages([]); queuedMessagesRef.current = []`
   - If `queued.length > 0`, take the LAST message only (the most recent user intent) and call `handleSendMessage(queued[queued.length - 1])` recursively
   - IMPORTANT: To prevent infinite recursion, add a guard. Use a ref `isProcessingRef` that is checked at the beginning of handleSendMessage. If already true, queue the message instead of processing.
   - Actually, the existing `isTyping` check at line 310 already handles this — when we call handleSendMessage recursively, isTyping will be false (we set it false before recursing), so it will go through the normal path.

   // PROD-TRANSLATE: En produccion, los mensajes interrumpidos se guardan como "pending templates"
   // en la sesion y el nuevo mensaje inbound se procesa por el webhook como un nuevo ciclo completo.
   // No hay recursion — el webhook crea un nuevo Inngest job. Aqui simulamos eso con recursion
   // porque el sandbox es un loop de UI sin webhook ni cola de jobs.

4. **Populate `preSendCheck` in debugTurn** when interruption occurs. Before pushing to debugTurns, if interrupted:
   ```ts
   result.debugTurn.preSendCheck = {
     perTemplate: result.messages.map((_, idx) => ({
       index: idx,
       checkResult: idx < i ? 'ok' as const : 'interrupted' as const,
       newMessageFound: idx === i,
     })),
     interrupted: true,
     pendingSaved: result.messages.length - i,
   }
   ```
   This reuses the existing `DebugPreSendCheck` type from sandbox types.

   // PROD-TRANSLATE: En produccion, el DebugAdapter.recordPreSendCheck() registra el resultado
   // real del query a la DB. Aqui lo construimos manualmente porque el check es un ref, no un query.

5. **Fail-safe principle**: If there is ANY doubt (race condition, ref stale, etc.), do NOT display the template. The check `queuedMessagesRef.current.length > 0` is fail-safe because:
   - If ref updates late, worst case we display one extra template (acceptable, not catastrophic)
   - The ref is updated synchronously in the setState callback, so it should be immediate
   - If for some reason the ref check fails, we default to the existing behavior (no regression)

Do NOT:
- Touch any file in src/lib/agents/engine-adapters/production/
- Touch engine-v3.ts, somnio-v3-agent.ts, or any v3 backend code
- Touch the v1 or v2 code paths
- Change the SandboxMessagingAdapter (it's a no-op and should stay that way)
- Disable the input for v3 — it must remain enabled during processing
  </action>
  <verify>
  1. `npx tsc --noEmit` passes (no type errors)
  2. Manual test in sandbox with v3:
     - Send a message that triggers multiple templates (e.g., "quiero comprar" which triggers promos)
     - While templates are appearing with delays, quickly type and send a new message
     - Verify: remaining templates stop appearing, new message processes fresh
     - Verify: debug panel shows preSendCheck with interrupted: true
  3. Non-interruption test: send a message and do NOT interrupt — all templates should display normally
  </verify>
  <done>
  - v3 template sequence is interrupted when user sends message during delay display
  - Interrupted sequence shows system note with count of templates not sent
  - New user message processes as fresh turn after interruption
  - Debug panel shows preSendCheck info for interrupted turns
  - Non-interrupted sequences work exactly as before (no regression)
  - Each key section has PROD-TRANSLATE comment explaining production equivalent
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit`
2. Interruption works: send message during template delays -> remaining templates stop
3. Fresh processing: interrupted message triggers new v3 pipeline turn
4. No regression: templates without interruption display normally with delays
5. Debug visibility: preSendCheck populated in debug panel for interrupted turns
6. PROD-TRANSLATE comments present at: ref check, post-loop processing, debug recording
</verification>

<success_criteria>
- Template interruption works for v3 in sandbox
- Fail-safe: when in doubt, do NOT display template
- PROD-TRANSLATE comments at every key decision point
- Zero changes to production code, v1, or v2
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/023-sandbox-template-interruption-v3/023-SUMMARY.md`
</output>
