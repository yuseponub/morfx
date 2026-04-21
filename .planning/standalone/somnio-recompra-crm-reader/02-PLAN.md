---
phase: somnio-recompra-crm-reader
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/inngest/events.ts
  - src/lib/agents/crm-reader/types.ts
  - src/lib/agents/crm-reader/index.ts
autonomous: true

must_haves:
  truths:
    - "El tipo `RecompraPreloadEvents` existe en `src/inngest/events.ts` con el event name literal `'recompra/preload-context'`"
    - "El event payload requiere `sessionId: string`, `contactId: string`, `workspaceId: string`, `invoker: 'somnio-recompra-v1'` (literal string, NO string genérico)"
    - "El tipo `AllAgentEvents` (line ~748) incluye `& RecompraPreloadEvents` al final del union"
    - "El tipo `ReaderInput` tiene campo opcional `abortSignal?: AbortSignal`"
    - "`processReaderMessage` pasa `input.abortSignal` a `generateText({ abortSignal })` (AI SDK v6 nativo)"
    - "`npx tsc --noEmit` sale clean sobre los 3 archivos modificados (tipos funcionan)"
    - "Callers existentes de `processReaderMessage` siguen compilando sin cambios (abortSignal es opcional)"
  artifacts:
    - path: "src/inngest/events.ts"
      provides: "Event schema tipado para `recompra/preload-context` — elimina necesidad de `(inngest.send as any)` (Pitfall 8)"
      contains: "RecompraPreloadEvents"
    - path: "src/lib/agents/crm-reader/types.ts"
      provides: "ReaderInput extendido con `abortSignal?: AbortSignal` opcional (mitigacion Pitfall 5)"
      contains: "abortSignal?: AbortSignal"
    - path: "src/lib/agents/crm-reader/index.ts"
      provides: "processReaderMessage cableado con abortSignal via generateText"
      contains: "abortSignal: input.abortSignal"
  key_links:
    - from: "src/inngest/events.ts"
      to: "src/inngest/client.ts (AllAgentEvents consumer)"
      via: "union type extension en line ~748"
      pattern: "AllAgentEvents.*RecompraPreloadEvents"
    - from: "src/lib/agents/crm-reader/index.ts"
      to: "ai-sdk/generateText (@ai-sdk/anthropic)"
      via: "abortSignal prop nativo v6"
      pattern: "abortSignal:\\s*input\\.abortSignal"
---

<objective>
Wave 1 — Type foundations. Registrar el evento Inngest nuevo `recompra/preload-context` en el schema tipado del repo (elimina `(inngest.send as any)`) y extender `ReaderInput` con `abortSignal?: AbortSignal` opcional para que el Plan 03 pueda hacer timeout limpio de 12s sin recurrir a Promise.race hack.

Purpose: Los 3 edits son additivos (0 breaking changes). Plans 03-04 dependen de estas firmas tipadas para escribir codigo typesafe. La decision LOCK de esta fase es:
- **Event name:** `recompra/preload-context` (literal, matches CONTEXT.md D-04 + RESEARCH.md recomendacion).
- **AbortSignal extension:** SI (3-line edit clean; alternativa Promise.race es hack-adjacent per RESEARCH.md Don't Hand-Roll).

Output: Type-safe foundations para Plans 03-04. Cero cambio de comportamiento runtime en produccion (solo tipos — callers actuales siguen sin pasar `abortSignal`).

**Regla 6:** Los edits son puramente additivos. Ningun caller actual pasa `abortSignal`, por tanto `processReaderMessage` se comporta identico a hoy en produccion. Zero riesgo para el agente crm-reader en produccion (plans 44-01..44-09).
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — D-04 (event name), D-05 (await pattern), §Claude's Discretion (AbortSignal)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pattern 2 (event schema registration), §Pitfall 5 (timeout via AbortSignal), §Pitfall 8 (event NO registrado), §Open Q 4 y Q 5 (recomendaciones locked)
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 1 — Event Schema Registration + Reader AbortSignal
@src/inngest/events.ts — schema canonico, pattern V3TimerEvents en lines 715-748
@src/lib/agents/crm-reader/types.ts — ReaderInput actual (no abortSignal)
@src/lib/agents/crm-reader/index.ts — processReaderMessage actual (no pasa abortSignal a generateText)

<interfaces>
<!-- Source: src/inngest/events.ts:715-748 (canonical pattern for new event type) -->
export type V3TimerEvents = {
  'agent/v3.timer.started': {
    data: {
      sessionId: string
      conversationId: string
      workspaceId: string
      level: number
      timerDurationMs: number
      phoneNumber: string
      contactId: string
    }
  }
  'agent/v3.timer.cancelled': {
    data: {
      sessionId: string
      reason: string
    }
  }
}

export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents
  & RobotEvents & GodentistEvents & V3TimerEvents
//                                                 ^^^^^^^^^^^^^^^
//                                  aqui se agrega ` & RecompraPreloadEvents`

<!-- Source: src/lib/agents/crm-reader/types.ts:30-34 (ReaderInput actual) -->
export interface ReaderInput {
  workspaceId: string
  messages: ReaderMessage[]
  invoker?: string
}

<!-- Source: src/lib/agents/crm-reader/index.ts:36-54 (generateText call actual, sin abortSignal) -->
const result = await generateText({
  model: anthropic(MODEL_ID),
  system: systemPrompt,
  messages,
  tools,
  stopWhen: stepCountIs(MAX_STEPS),
  temperature: 0,
})
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Registrar evento `recompra/preload-context` en schema tipado</name>
  <read_first>
    - src/inngest/events.ts (linea 710 hasta el final — entender el patron de V3TimerEvents y el union AllAgentEvents)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pattern 2 (shape literal del nuevo type) y §Pitfall 8 (por que registrar)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 1 (shape exacto)
  </read_first>
  <action>
    Editar `src/inngest/events.ts`:

    **1. Insertar justo antes de `export type AllAgentEvents = ...` (actualmente en linea ~748) el siguiente bloque:**

    ```typescript
    /**
     * Somnio recompra — CRM reader preload events.
     * Emitted by webhook-processor after session creation to trigger async
     * enrichment of session state with CRM context via the crm-reader agent.
     * See: .planning/standalone/somnio-recompra-crm-reader/CONTEXT.md D-04/D-05.
     */
    export type RecompraPreloadEvents = {
      /**
       * Emitted by src/lib/agents/production/webhook-processor.ts after the
       * V3ProductionRunner creates a new recompra session (version === 0 equivalent).
       * Consumed by src/inngest/functions/recompra-preload-context.ts which calls
       * processReaderMessage and writes `_v3:crm_context` + `_v3:crm_context_status`
       * into session_state.datos_capturados via SessionManager.updateCapturedData.
       *
       * Idempotent: Inngest function early-returns if `_v3:crm_context_status`
       * already present in datos_capturados (D-15).
       * Concurrency-keyed by sessionId (limit 1) to dedupe rapid retries.
       */
      'recompra/preload-context': {
        data: {
          sessionId: string
          contactId: string
          workspaceId: string
          invoker: 'somnio-recompra-v1'
        }
      }
    }
    ```

    **2. Actualizar el union `AllAgentEvents` en la siguiente linea (actualmente ~748):**

    ANTES:
    ```typescript
    export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents
    ```

    DESPUES:
    ```typescript
    export type AllAgentEvents = AgentEvents & IngestEvents & AutomationEvents & RobotEvents & GodentistEvents & V3TimerEvents & RecompraPreloadEvents
    ```

    NOTAS CRITICAS:
    - El event name es `'recompra/preload-context'` LITERAL — NO usar guion bajo, NO usar camelCase, NO agregar namespace distinto. Este literal se usa verbatim en Plans 03 (consumer function `{ event: 'recompra/preload-context' }`) y 04 (webhook dispatch `inngest.send({ name: 'recompra/preload-context', ... })`).
    - `invoker: 'somnio-recompra-v1'` es LITERAL STRING TYPE, no `string`. Esto previene que otro bot accidentalmente despache este event con un invoker distinto.
    - `contactId: string` NO valida UUID en TypeScript — la validacion runtime con zod vive en Plan 03 (RESEARCH §Security Domain V5).
    - NO cambiar el orden del union — `RecompraPreloadEvents` al final es convention del archivo.
    - NO agregar al helper `AgentEventData` — ese helper trabaja sobre `AllAgentEvents` por genericidad.

    Verificar tipos:
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "(events\\.ts|inngest)" || echo "No type errors in events.ts"
    ```
  </action>
  <verify>
    <automated>grep -q "export type RecompraPreloadEvents" src/inngest/events.ts</automated>
    <automated>grep -q "'recompra/preload-context'" src/inngest/events.ts</automated>
    <automated>grep -q "invoker: 'somnio-recompra-v1'" src/inngest/events.ts</automated>
    <automated>grep -E "AllAgentEvents\s*=.*RecompraPreloadEvents" src/inngest/events.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-events.log; ! grep -E "(events\.ts|src/inngest)" /tmp/tsc-events.log | grep -v "error TS2" || echo "tsc clean for events.ts"</automated>
  </verify>
  <acceptance_criteria>
    - `src/inngest/events.ts` exporta `RecompraPreloadEvents` con el shape exacto (4 campos en data, invoker literal).
    - El union `AllAgentEvents` termina con `& RecompraPreloadEvents`.
    - `npx tsc --noEmit` NO introduce ningun error nuevo asociado a `events.ts` o `inngest/` (errores pre-existentes de vitest/somnio quedan igual).
    - Comentario JSDoc documenta el flujo: webhook-processor → Inngest function → session state write.
    - NO se elimino o modifico ningun type existente (additive only).
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra-crm-reader): register 'recompra/preload-context' event in inngest schema`.
    - `src/inngest/events.ts` queda listo para ser importado por Plans 03-04.
  </done>
</task>

<task type="auto">
  <name>Task 2: Extender ReaderInput con `abortSignal?` opcional + cablear a generateText</name>
  <read_first>
    - src/lib/agents/crm-reader/types.ts (entero — archivo es corto, <100 lineas)
    - src/lib/agents/crm-reader/index.ts lines 30-60 (processReaderMessage signature + generateText call)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pitfall 5 (AbortSignal nativo AI SDK v6), §Open Q 5 (extend vs Promise.race — LOCKED extend)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 1 — Reader AbortSignal
  </read_first>
  <action>
    **Edit 1 — `src/lib/agents/crm-reader/types.ts`:**

    Localizar la interface `ReaderInput` (actualmente lines 30-34):

    ```typescript
    export interface ReaderInput {
      workspaceId: string
      messages: ReaderMessage[]
      invoker?: string
    }
    ```

    Reemplazar por (1 linea agregada al final de la interface):

    ```typescript
    export interface ReaderInput {
      workspaceId: string
      messages: ReaderMessage[]
      invoker?: string
      /** Optional abort signal for upstream timeouts (e.g. 12s budget in Inngest preload function). Pitfall 5 mitigation — AI SDK v6 generateText supports nativo. */
      abortSignal?: AbortSignal
    }
    ```

    **Edit 2 — `src/lib/agents/crm-reader/index.ts`:**

    Localizar la llamada a `generateText` (actualmente lines 36-54 segun RESEARCH). Agregar `abortSignal: input.abortSignal` al objeto de opciones:

    ANTES:
    ```typescript
    const result = await generateText({
      model: anthropic(MODEL_ID),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      temperature: 0,
    })
    ```

    DESPUES:
    ```typescript
    const result = await generateText({
      model: anthropic(MODEL_ID),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      temperature: 0,
      abortSignal: input.abortSignal,  // Pitfall 5 — pass-through opcional, undefined hoy para callers existentes
    })
    ```

    NOTAS CRITICAS:
    - `abortSignal` es opcional — callers existentes (si los hay: HTTP route `/api/v1/crm-bots/reader` pending Plan 07 Phase 44) pasan `undefined` por default y se comportan identico a hoy. Backward compat total.
    - NO tocar `buildReaderSystemPrompt`, `createReaderTools`, o el mapping `input.messages as unknown as ModelMessage[]` — todo lo demas queda igual.
    - NO cambiar MAX_STEPS ni `temperature: 0` — el scope del reader esta locked por Phase 44.
    - AI SDK v6 (`ai@^6.0.86`) soporta `abortSignal` nativo en `generateText`. Si `input.abortSignal === undefined`, el comportamiento es identico a no pasar la opcion.

    Verificar que los callers existentes (si existen) siguen compilando:
    ```bash
    grep -rn "processReaderMessage(" src/ --include="*.ts" | grep -v "crm-reader/"
    ```
    (cualquier caller deberia seguir compilando porque `abortSignal` es `?`).

    TypeScript check:
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "crm-reader" || echo "clean"
    ```
  </action>
  <verify>
    <automated>grep -E "abortSignal\?\s*:\s*AbortSignal" src/lib/agents/crm-reader/types.ts</automated>
    <automated>grep -E "abortSignal:\s*input\.abortSignal" src/lib/agents/crm-reader/index.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-reader.log; ! grep -E "src/lib/agents/crm-reader" /tmp/tsc-reader.log || echo "no new tsc errors in crm-reader"</automated>
    <automated>CALLERS=$(grep -rn "processReaderMessage(" src/ --include="*.ts" 2>/dev/null | grep -v "crm-reader/"); echo "Callers found: $CALLERS"; npx tsc --noEmit 2>&1 | grep -v "vitest\|somnio.*test" | grep "error TS" | head -5 || echo "no caller breakage"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/crm-reader/types.ts` `ReaderInput` interface tiene el campo `abortSignal?: AbortSignal` con JSDoc.
    - `src/lib/agents/crm-reader/index.ts` `generateText({...})` call incluye `abortSignal: input.abortSignal` en las opciones.
    - `npx tsc --noEmit` NO introduce errores nuevos relacionados a `crm-reader/`.
    - Callers existentes de `processReaderMessage` (si los hay en HTTP routes/integration tests) siguen compilando — la extension es 100% additive + optional.
    - NO se modifico el comportamiento default (cuando `abortSignal` es undefined, generateText se comporta exactamente como antes).
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(crm-reader): extend ReaderInput with optional abortSignal for upstream timeout control`.
    - 2 archivos modificados, ambos edits additivos y 100% backward-compatible.
  </done>
</task>

</tasks>

<verification>
- `src/inngest/events.ts` tiene `RecompraPreloadEvents` y `AllAgentEvents` incluye el union.
- `src/lib/agents/crm-reader/types.ts` tiene `abortSignal?: AbortSignal` en `ReaderInput`.
- `src/lib/agents/crm-reader/index.ts` pasa `input.abortSignal` a `generateText`.
- `npx tsc --noEmit` clean sobre los 3 archivos modificados (ignorar errores pre-existentes de vitest/somnio fuera de scope).
- Callers existentes siguen compilando sin cambio.
- Cero cambio de comportamiento runtime en produccion (solo tipos + pass-through de option opcional).
</verification>

<success_criteria>
- Plan 03 puede escribir `inngest.send({ name: 'recompra/preload-context', data: {...} })` con type safety real (sin `as any`).
- Plan 03 puede instanciar `AbortController` + pasar `signal` a `processReaderMessage({ abortSignal })` sin hackear con Promise.race.
- Event schema queda canonicamente registrado (mismo nivel que V3TimerEvents, GodentistEvents, etc.).
- Regla 6 preservada: cero cambio de comportamiento en produccion para el agente crm-reader (Phase 44 y 44.1 ya desplegados).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/02-SUMMARY.md` documenting:
- Commit hashes de Task 1 + Task 2
- Literal del bloque `RecompraPreloadEvents` agregado (copiar desde events.ts post-edit)
- Firma final de `ReaderInput` post-edit
- Resultado de `npx tsc --noEmit` (clean / errores pre-existentes irrelevantes)
- Confirmacion: "Plans 03-04 desbloqueados para escribir codigo typesafe sobre el nuevo event + abortSignal"
</output>
