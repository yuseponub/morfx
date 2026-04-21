---
phase: somnio-recompra-crm-reader
plan: 05
type: execute
wave: 4
depends_on: [01, 02, 03, 04]
files_modified:
  - src/lib/agents/somnio-recompra/types.ts
  - src/lib/agents/engine/v3-production-runner.ts
  - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts
  - src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts
autonomous: true

must_haves:
  truths:
    - "`V3AgentInput` tiene campo opcional `sessionId?: string` (para permitir poll DB sin romper sandbox/tests que no lo pasen)"
    - "`v3-production-runner.ts` linea ~105-117 pasa `sessionId: session.id` al construir `v3Input`"
    - "`somnio-recompra-agent.ts` define helper `pollCrmContext(sessionId, datosFromInput, timeoutMs=3000, intervalMs=500)` con fast-path + poll DB via SessionManager.getState"
    - "Poll fast-path: si `datosFromInput['_v3:crm_context_status']` esta en `['ok','empty','error']`, retorna inmediatamente sin hit DB"
    - "Poll DB: while Date.now() < deadline, await setTimeout(500), getState, check status — max 6 iteraciones (3000/500)"
    - "Timeout final: retorna `{ crmContext: null, status: 'timeout' }`"
    - "`processUserMessage` invoca poll ANTES de `comprehend(...)` solo si `input.sessionId` esta presente"
    - "Al obtener status='ok' + crmContext, merge al `input.datosCapturados` + emit `pipeline_decision:crm_context_used` (D-16)"
    - "Al obtener status='timeout'|'error'|'empty', emit `pipeline_decision:crm_context_missing_after_wait` con field `status` (D-16)"
    - "NO emitir eventos en fast-path (no uso redundante — contexto ya estaba en input)"
    - "Unit test cubre: (a) fast-path status=ok, (b) poll DB finds status=ok en iteracion 2, (c) timeout tras 3s — status=timeout, (d) poll DB finds status=error — retorna inmediatamente"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/types.ts"
      provides: "V3AgentInput extendido con sessionId?"
      contains: "sessionId?: string"
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "v3Input construction pasa session.id"
      contains: "sessionId: session.id"
    - path: "src/lib/agents/somnio-recompra/somnio-recompra-agent.ts"
      provides: "Poll helper + integracion en processUserMessage"
      contains: "pollCrmContext"
    - path: "src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts"
      provides: "Unit test del poll con fake timers"
      contains: "pollCrmContext"
  key_links:
    - from: "src/lib/agents/somnio-recompra/somnio-recompra-agent.ts"
      to: "src/lib/agents/session-manager.ts (getState)"
      via: "dynamic import + poll read every 500ms"
      pattern: "sm\\.getState\\(sessionId\\)"
    - from: "src/lib/agents/engine/v3-production-runner.ts"
      to: "V3AgentInput (src/lib/agents/somnio-recompra/types.ts)"
      via: "sessionId: session.id field pass-through"
      pattern: "sessionId:\\s*session\\.id"
---

<objective>
Wave 4 — Reader-side consumption (agent internals). Extender `V3AgentInput` con `sessionId?`, pasarlo desde `v3-production-runner`, y agregar un poll helper en `somnio-recompra-agent.ts` que espera hasta 3s con intervalos de 500ms a que la Inngest function escriba `_v3:crm_context_status` al session state (D-13, D-14).

Purpose: Este plan resuelve Pitfall 3 (`input.datosCapturados` es snapshot stale — el runner lo construyo al inicio del turno, pero la Inngest function escribe DESPUES). El poll debe leer DIRECTAMENTE de la DB via `SessionManager.getState(sessionId)` en cada iteracion, NO del snapshot.

La decision LOCK de esta fase es:
- **Poll helper location:** Inline en `somnio-recompra-agent.ts` (no hay modulo separado — mantiene logica cerca de `processUserMessage` que es el unico consumer).
- **Fast path:** Si el input ya trae un status marker (race gana el dispatch antes que el turno 1+), skippeamos DB hit.
- **Status markers:** `'ok' | 'empty' | 'error' | 'timeout'` — los 3 primeros vienen de Plan 03, el 4to se genera aqui.
- **Emit observability:** Solo cuando poll DB (fast-path no cuenta como "used" porque no fue "awaited").

**Regla 6 CRITICAL:** La inyeccion en `comprehension-prompt.ts` vive en Plan 06. Este plan NO escribe el crm_context en el prompt final — solo lo poblea en `input.datosCapturados`. Si flag esta en false, la funcion Inngest no escribe nada, el poll no encuentra status, retorna timeout, y el evento `crm_context_missing_after_wait` se emite (fine — observabilidad limpia). Comportamiento en produccion identico a hoy hasta Plan 06+07.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-crm-reader/CONTEXT.md — D-13 (poll 500ms x 3s), D-14 (timeout procede), D-15 (nunca re-dispatch), D-16 (crm_context_used, crm_context_missing_after_wait)
@.planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pitfall 3 (snapshot stale), §Ejemplo 4 (poll helper propuesto verbatim), §Claude's Discretion (locked: sleep loop)
@.planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 4 — Comprehension Inject + Agent Poll
@src/lib/agents/somnio-recompra/somnio-recompra-agent.ts (processUserMessage, processSystemEvent)
@src/lib/agents/somnio-recompra/types.ts lines 130-150 (V3AgentInput)
@src/lib/agents/engine/v3-production-runner.ts lines 100-130 (v3Input construction)
@src/lib/agents/session-manager.ts — getState signature, updateCapturedData (Pitfall 2 helper)
@src/lib/observability/index.ts — getCollector + recordEvent

<interfaces>
<!-- Current V3AgentInput (src/lib/agents/somnio-recompra/types.ts:133-147) -->
export interface V3AgentInput {
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  currentMode: string
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas?: AccionRegistrada[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
}

<!-- Current v3Input construction (src/lib/agents/engine/v3-production-runner.ts:105-117) -->
const v3Input: V3AgentInput = {
  message: effectiveMessage,
  history,
  currentMode: session.current_mode,
  intentsVistos,
  templatesEnviados: inputTemplatesEnviados,
  datosCapturados: inputDatosCapturados,
  packSeleccionado: session.state.pack_seleccionado as string | null,
  accionesEjecutadas,
  turnNumber,
  workspaceId: this.config.workspaceId,
}

<!-- SessionManager.getState signature (src/lib/agents/session-manager.ts) -->
async getState(sessionId: string): Promise<{
  datos_capturados: Record<string, unknown>
  ...other fields
}>
// Returns the full row from session_state table.

<!-- Poll helper design (RESEARCH §Ejemplo 4 verbatim) -->
async function pollCrmContext(
  sessionId: string,
  datosFromInput: Record<string, string>,
  timeoutMs = 3000,
  intervalMs = 500
): Promise<{ crmContext: string | null; status: 'ok' | 'empty' | 'error' | 'timeout' }>
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extender V3AgentInput con sessionId? + pasarlo desde v3-production-runner</name>
  <read_first>
    - src/lib/agents/somnio-recompra/types.ts (entero — buscar `V3AgentInput` interface)
    - src/lib/agents/engine/v3-production-runner.ts lines 100-135 (construccion de v3Input + llamada a processMessage del agent)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 4 — small 1-line edit en runner
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Pitfall 3 (por que necesitamos sessionId)
  </read_first>
  <action>
    **Edit 1 — `src/lib/agents/somnio-recompra/types.ts`:**

    Localizar la interface `V3AgentInput` (actualmente lines ~133-147). Agregar campo `sessionId?: string` al final:

    ANTES:
    ```typescript
    export interface V3AgentInput {
      message: string
      history: { role: 'user' | 'assistant'; content: string }[]
      currentMode: string
      intentsVistos: string[]
      templatesEnviados: string[]
      datosCapturados: Record<string, string>
      packSeleccionado: string | null
      accionesEjecutadas?: AccionRegistrada[]
      turnNumber: number
      workspaceId: string
      systemEvent?: SystemEvent
    }
    ```

    DESPUES:
    ```typescript
    export interface V3AgentInput {
      message: string
      history: { role: 'user' | 'assistant'; content: string }[]
      currentMode: string
      intentsVistos: string[]
      templatesEnviados: string[]
      datosCapturados: Record<string, string>
      packSeleccionado: string | null
      accionesEjecutadas?: AccionRegistrada[]
      turnNumber: number
      workspaceId: string
      systemEvent?: SystemEvent
      /**
       * Session id (row id from agent_sessions table).
       * Required for crm_context poll in processUserMessage (Pitfall 3 mitigation):
       * input.datosCapturados is a snapshot taken at turn start; the Inngest
       * function may write `_v3:crm_context_status` AFTER snapshot. Poll DB directly.
       * Optional for backward compatibility with sandbox/tests that construct V3AgentInput manually.
       */
      sessionId?: string
    }
    ```

    **Edit 2 — `src/lib/agents/engine/v3-production-runner.ts`:**

    Localizar el bloque de construccion de `v3Input` (lines ~105-117). Agregar `sessionId: session.id`:

    ANTES:
    ```typescript
    const v3Input: V3AgentInput = {
      message: effectiveMessage,
      history,
      currentMode: session.current_mode,
      intentsVistos,
      templatesEnviados: inputTemplatesEnviados,
      datosCapturados: inputDatosCapturados,
      packSeleccionado: session.state.pack_seleccionado as string | null,
      accionesEjecutadas,
      turnNumber,
      workspaceId: this.config.workspaceId,
      // systemEvent: undefined — only for timers, not user messages
    }
    ```

    DESPUES:
    ```typescript
    const v3Input: V3AgentInput = {
      message: effectiveMessage,
      history,
      currentMode: session.current_mode,
      intentsVistos,
      templatesEnviados: inputTemplatesEnviados,
      datosCapturados: inputDatosCapturados,
      packSeleccionado: session.state.pack_seleccionado as string | null,
      accionesEjecutadas,
      turnNumber,
      workspaceId: this.config.workspaceId,
      sessionId: session.id,   // ★ NEW: enables crm_context poll in agent (Pitfall 3)
      // systemEvent: undefined — only for timers, not user messages
    }
    ```

    NOTAS CRITICAS:
    - El campo es `?:` (opcional) por backward-compat con tests/sandbox que construyen `V3AgentInput` manualmente. Production siempre lo pasa.
    - NO tocar el resto del bloque — `turnNumber`, `accionesEjecutadas`, etc estan bien.
    - `session.id` viene del SessionManager — verificar que es `string` (uuid). Si hay cast necesario, revisar line ~90 del runner donde `session` se obtiene.
    - NO arreglar el bug latente en `:131` del runner (`saveState({'_v3:agent_module': ...})` top-level — deuda tecnica A6, fuera de scope).

    Verify tipo:
    ```bash
    npx tsc --noEmit 2>&1 | grep -E "(v3-production-runner|somnio-recompra/types)" | head -5 || echo "clean"
    ```
  </action>
  <verify>
    <automated>grep -q "sessionId?:\s*string" src/lib/agents/somnio-recompra/types.ts</automated>
    <automated>grep -E "sessionId:\s*session\.id" src/lib/agents/engine/v3-production-runner.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p05t1.log; ! grep -E "(src/lib/agents/somnio-recompra/types|src/lib/agents/engine/v3-production-runner)" /tmp/tsc-p05t1.log | grep "error TS" || echo "no new errors"</automated>
  </verify>
  <acceptance_criteria>
    - `V3AgentInput` tiene `sessionId?: string` con JSDoc que referencia Pitfall 3 y `processUserMessage` poll.
    - `v3-production-runner.ts` construye `v3Input` con `sessionId: session.id` (pass-through).
    - `npx tsc --noEmit` clean (cero nuevos errores en los 2 archivos).
    - NO se modifico ningun otro campo de `V3AgentInput` o del `v3Input` construction.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra): thread sessionId into V3AgentInput for crm_context poll in agent`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Agregar pollCrmContext helper + wire en processUserMessage</name>
  <read_first>
    - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts (entero — entender processUserMessage pipeline actual, ubicar donde se llama comprehend)
    - .planning/standalone/somnio-recompra-crm-reader/RESEARCH.md §Ejemplo 4 (poll helper verbatim)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 4 — shape exacto
    - src/lib/agents/session-manager.ts — getState signature + datos_capturados shape
    - src/lib/observability/index.ts — getCollector().recordEvent signature
  </read_first>
  <action>
    Editar `src/lib/agents/somnio-recompra/somnio-recompra-agent.ts`. Agregar el helper `pollCrmContext` (top del archivo, cerca de otros helpers/imports) y cablear la llamada al inicio de `processUserMessage` (antes de `comprehend(...)`).

    **Parte A — Agregar el helper (top-level function):**

    Ubicar un lugar apropiado en el archivo — cerca del top, despues de los imports y antes de `processMessage`/`processUserMessage`. Usar el patron de dynamic import para evitar circular deps (RESEARCH §Shared Patterns).

    ```typescript
    /**
     * Poll session_state for the CRM context marker set by the recompra-preload-context
     * Inngest function (see src/inngest/functions/recompra-preload-context.ts).
     *
     * Fast path: if input.datosCapturados already contains a status marker, return
     * immediately (no DB hit).
     *
     * Poll path (Pitfall 3): input.datosCapturados is a snapshot taken at turn start
     * by v3-production-runner; the Inngest function may have written AFTER that snapshot.
     * Poll DB every `intervalMs` up to `timeoutMs`.
     *
     * Returns:
     * - { crmContext, status: 'ok' }    — reader wrote non-empty text
     * - { crmContext: '', status: 'empty' }   — reader returned empty
     * - { crmContext: '', status: 'error' }   — reader threw (marker written in Plan 03 catch)
     * - { crmContext: null, status: 'timeout' } — poll timed out, Inngest function still running or crashed
     *
     * D-13: timeoutMs=3000, intervalMs=500 (6 iterations max).
     * D-14: on timeout, caller proceeds without context (comprehension falls back).
     */
    export async function pollCrmContext(
      sessionId: string,
      datosFromInput: Record<string, string>,
      timeoutMs = 3000,
      intervalMs = 500,
    ): Promise<{
      crmContext: string | null
      status: 'ok' | 'empty' | 'error' | 'timeout'
    }> {
      // Fast path: status already present in input snapshot (dispatch won the race before turn 1+).
      const existingStatus = datosFromInput['_v3:crm_context_status']
      if (
        existingStatus === 'ok' ||
        existingStatus === 'empty' ||
        existingStatus === 'error'
      ) {
        return {
          crmContext: datosFromInput['_v3:crm_context'] ?? null,
          status: existingStatus as 'ok' | 'empty' | 'error',
        }
      }

      // Poll DB (input snapshot is stale — Pitfall 3).
      const { SessionManager } = await import('@/lib/agents/session-manager')
      const sm = new SessionManager()
      const deadline = Date.now() + timeoutMs

      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        try {
          const state = await sm.getState(sessionId)
          const datos = (state.datos_capturados ?? {}) as Record<string, string>
          const status = datos['_v3:crm_context_status']
          if (status === 'ok' || status === 'empty' || status === 'error') {
            return {
              crmContext: datos['_v3:crm_context'] ?? null,
              status: status as 'ok' | 'empty' | 'error',
            }
          }
        } catch {
          // Swallow and retry — transient DB errors should not abort the poll.
          // If session doesn't exist (shouldn't happen — v3-production-runner just created it),
          // we'll fall through to timeout and the comprehension proceeds without context.
        }
      }

      return { crmContext: null, status: 'timeout' }
    }
    ```

    **Parte B — Wire en processUserMessage:**

    Localizar la funcion `processUserMessage` en el archivo. Identificar donde se llama a `comprehend(...)` (Capa 2 Haiku). Insertar el bloque del poll INMEDIATAMENTE ANTES de la llamada a `comprehend`, solo si `input.sessionId` esta presente (preserva backward-compat sandbox).

    Shape del bloque a insertar (usando Ejemplo 4 de RESEARCH literalmente):

    ```typescript
    // ★ CRM context poll (standalone: somnio-recompra-crm-reader, D-13/D-14)
    // Waits up to 3s (500ms intervals) for the Inngest function to persist the
    // CRM context. If the dispatch already won the race (fast path), returns instantly.
    if (input.sessionId) {
      const { crmContext, status } = await pollCrmContext(
        input.sessionId,
        input.datosCapturados,
      )
      const fastPathHit = input.datosCapturados['_v3:crm_context_status'] !== undefined

      if (status === 'ok' && crmContext) {
        // Merge into input.datosCapturados so comprehension-prompt (Plan 06) picks it up.
        input.datosCapturados['_v3:crm_context'] = crmContext
        input.datosCapturados['_v3:crm_context_status'] = 'ok'

        // Only emit `crm_context_used` when we actually waited (NOT on fast path — fast path
        // means the context was already in the snapshot, no waiting happened).
        if (!fastPathHit) {
          getCollector()?.recordEvent('pipeline_decision', 'crm_context_used', {
            agent: 'somnio-recompra-v1',
            sessionId: input.sessionId,
            contextLength: crmContext.length,
          })
        }
      } else if (status === 'timeout' || status === 'error' || status === 'empty') {
        // Timeout or reader produced no context — proceed without (D-14).
        // Emit only when we waited (not fast-path) so metrics reflect real DB polling.
        if (!fastPathHit) {
          getCollector()?.recordEvent('pipeline_decision', 'crm_context_missing_after_wait', {
            agent: 'somnio-recompra-v1',
            sessionId: input.sessionId,
            status,
          })
        }
      }
    }
    // ... existing comprehend() call below, unchanged ...
    ```

    **NOTAS CRITICAS sobre el wire:**
    - Ubicar el bloque ANTES de la llamada a `comprehend(...)` — el merge a `input.datosCapturados` debe ocurrir antes de que comprehension lea esos datos.
    - Guard `if (input.sessionId)` — sandbox/tests que construyen V3AgentInput sin sessionId siguen funcionando identico.
    - La decision de emitir eventos SOLO cuando NO fue fast-path evita ruido en observability (el caso fast-path significa que el dispatch termino antes del turno 1+, no fue "missing after wait").
    - NO tocar el resto de processUserMessage — la llamada a `comprehend`, `mergeAnalysis`, `sales-track`, etc. se mantienen igual.
    - `getCollector` debe estar importado — verificar top del archivo (el agent ya usa observability en otros puntos).
    - La funcion `pollCrmContext` debe ser exportada (`export async function`) porque el test file la importara en Task 3.

    Verificar:
    ```bash
    npx tsc --noEmit 2>&1 | grep "somnio-recompra-agent" || echo "clean"
    ```
  </action>
  <verify>
    <automated>grep -q "export async function pollCrmContext" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "sm\\.getState(sessionId)" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "_v3:crm_context_status" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "crm_context_used" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "crm_context_missing_after_wait" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "timeoutMs\s*=\s*3000" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "intervalMs\s*=\s*500" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "if (input.sessionId)" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>grep -q "status: 'timeout'" src/lib/agents/somnio-recompra/somnio-recompra-agent.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | tee /tmp/tsc-p05t2.log; ! grep "src/lib/agents/somnio-recompra/somnio-recompra-agent" /tmp/tsc-p05t2.log | grep "error TS" || echo "clean"</automated>
  </verify>
  <acceptance_criteria>
    - `pollCrmContext` exportada con firma exacta: `(sessionId, datosFromInput, timeoutMs=3000, intervalMs=500) => Promise<{crmContext, status}>`.
    - Fast path: retorna inmediatamente si `datosFromInput['_v3:crm_context_status']` esta en `['ok','empty','error']`.
    - Poll path: while-loop con `await setTimeout(500)` + `sm.getState(sessionId)` + check de status.
    - Timeout: retorna `{ crmContext: null, status: 'timeout' }` tras pasar deadline.
    - Import dinamico: `await import('@/lib/agents/session-manager')`.
    - `processUserMessage` llama `pollCrmContext(input.sessionId, input.datosCapturados)` ANTES de `comprehend`.
    - Guardado por `if (input.sessionId)` — no corre si falta.
    - Merge a `input.datosCapturados` solo cuando `status === 'ok' && crmContext`.
    - Eventos emitidos: `crm_context_used` (status ok + waited) / `crm_context_missing_after_wait` (status timeout|error|empty + waited) — NO emitidos en fast-path.
    - `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `feat(somnio-recompra): add pollCrmContext helper + wire into processUserMessage pre-comprehend`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Unit test de pollCrmContext con fake timers + SessionManager mock</name>
  <read_first>
    - src/lib/agents/somnio-recompra/somnio-recompra-agent.ts (post Task 2 — para validar que `pollCrmContext` es exportable)
    - src/lib/agents/somnio/__tests__/char-delay.test.ts (analog de test con timing — patron vitest fake timers)
    - .planning/standalone/somnio-recompra-crm-reader/PATTERNS.md §Wave 0 — test de poll-with-backoff
  </read_first>
  <action>
    Crear `src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts`.

    Este test usa `vi.useFakeTimers()` para simular el paso del tiempo en el poll sin esperas reales, y mockea `SessionManager.getState` para controlar los resultados de cada iteracion.

    **Contenido completo:**

    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

    // Mock SessionManager BEFORE importing the module under test (vi.mock hoists).
    const mockGetState = vi.fn()

    vi.mock('@/lib/agents/session-manager', () => ({
      SessionManager: vi.fn().mockImplementation(() => ({
        getState: mockGetState,
      })),
    }))

    // Import AFTER mocks.
    import { pollCrmContext } from '../somnio-recompra-agent'

    describe('pollCrmContext', () => {
      beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
      })

      afterEach(() => {
        vi.useRealTimers()
      })

      it('fast-path: returns immediately when datosFromInput already has status=ok', async () => {
        const result = await pollCrmContext('session-123', {
          '_v3:crm_context': 'Ultimo pedido: 2x Somnio entregado 2026-04-10...',
          '_v3:crm_context_status': 'ok',
        })

        expect(result).toEqual({
          crmContext: 'Ultimo pedido: 2x Somnio entregado 2026-04-10...',
          status: 'ok',
        })
        expect(mockGetState).not.toHaveBeenCalled()
      })

      it('fast-path: returns immediately when datosFromInput already has status=error', async () => {
        const result = await pollCrmContext('session-123', {
          '_v3:crm_context': '',
          '_v3:crm_context_status': 'error',
        })

        expect(result).toEqual({ crmContext: '', status: 'error' })
        expect(mockGetState).not.toHaveBeenCalled()
      })

      it('fast-path: returns immediately when datosFromInput has status=empty', async () => {
        const result = await pollCrmContext('session-123', {
          '_v3:crm_context': '',
          '_v3:crm_context_status': 'empty',
        })

        expect(result).toEqual({ crmContext: '', status: 'empty' })
        expect(mockGetState).not.toHaveBeenCalled()
      })

      it('poll-path: finds status=ok on 2nd DB iteration (after ~1000ms)', async () => {
        // First call (after 500ms): no status yet
        // Second call (after 1000ms): status=ok
        mockGetState
          .mockResolvedValueOnce({ datos_capturados: {} })
          .mockResolvedValueOnce({
            datos_capturados: {
              '_v3:crm_context': 'reader output texto',
              '_v3:crm_context_status': 'ok',
            },
          })

        const promise = pollCrmContext('session-123', {})

        // Advance 500ms → first getState call returns empty
        await vi.advanceTimersByTimeAsync(500)
        // Advance another 500ms → second getState returns ok
        await vi.advanceTimersByTimeAsync(500)

        const result = await promise
        expect(result).toEqual({ crmContext: 'reader output texto', status: 'ok' })
        expect(mockGetState).toHaveBeenCalledTimes(2)
      })

      it('poll-path: times out after 3000ms when status never appears → status=timeout', async () => {
        // All getState calls return empty datos_capturados
        mockGetState.mockResolvedValue({ datos_capturados: {} })

        const promise = pollCrmContext('session-123', {})

        // Advance past deadline (3000ms total). Exceed by a bit so Date.now() is past deadline.
        await vi.advanceTimersByTimeAsync(3100)

        const result = await promise
        expect(result).toEqual({ crmContext: null, status: 'timeout' })
        // At least 6 iterations should have happened (3000/500 = 6).
        expect(mockGetState.mock.calls.length).toBeGreaterThanOrEqual(6)
      })

      it('poll-path: returns immediately on status=error from DB (no more iterations)', async () => {
        // First iteration returns status=error.
        mockGetState.mockResolvedValueOnce({
          datos_capturados: {
            '_v3:crm_context': '',
            '_v3:crm_context_status': 'error',
          },
        })

        const promise = pollCrmContext('session-123', {})
        await vi.advanceTimersByTimeAsync(500)

        const result = await promise
        expect(result).toEqual({ crmContext: '', status: 'error' })
        expect(mockGetState).toHaveBeenCalledTimes(1)
      })

      it('poll-path: swallows transient getState errors and retries until timeout', async () => {
        mockGetState
          .mockRejectedValueOnce(new Error('transient db'))
          .mockRejectedValueOnce(new Error('transient db'))
          .mockResolvedValue({ datos_capturados: {} }) // subsequent calls return empty

        const promise = pollCrmContext('session-123', {})
        await vi.advanceTimersByTimeAsync(3100)

        const result = await promise
        expect(result.status).toBe('timeout')
        // errors swallowed, poll continued through timeout
        expect(mockGetState.mock.calls.length).toBeGreaterThanOrEqual(3)
      })
    })
    ```

    Correr:
    ```bash
    npm run test -- src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts
    ```

    Expected: 7 tests PASS.

    NOTAS CRITICAS:
    - `vi.useFakeTimers()` en `beforeEach` y `useRealTimers()` en `afterEach` — aislar cada test.
    - `vi.advanceTimersByTimeAsync(ms)` es la API de vitest para avanzar tiempo + resolver promises que esperen timers.
    - El test de timeout avanza 3100ms (excede 3000ms) para asegurar que Date.now() supere el deadline al siguiente check.
    - El test de transient errors verifica que `catch {}` swallow funciona sin crashear.
    - Los tests de fast-path NO llaman a vi.advanceTimersByTimeAsync porque el helper retorna sincrono en ese branch (no hay await setTimeout).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts 2>&1 | tee /tmp/test-p05t3.log; grep -qE "(7 passed|Tests\\s+7 passed)" /tmp/test-p05t3.log</automated>
    <automated>grep -q "useFakeTimers" src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts</automated>
    <automated>grep -q "advanceTimersByTimeAsync" src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - Archivo del test existe.
    - Contiene al menos 7 tests: 3 fast-path (ok/error/empty) + 1 poll success + 1 timeout + 1 poll error (DB status=error) + 1 transient swallow.
    - Usa `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(...)` para simular tiempo.
    - Mockea `SessionManager` con `vi.mock('@/lib/agents/session-manager', ...)`.
    - Todos los tests pasan (7/7).
  </acceptance_criteria>
  <done>
    - Commit atomico con mensaje `test(somnio-recompra): add crm-context-poll unit test with fake timers`.
    - Push a Vercel NO hace falta todavia (este codigo aun no esta usado en produccion — comprehension-prompt de Plan 06 es quien lo consume; pushear con flag=false en main es safe pero ideal pushear Plan 06 tambien en la misma ventana).
  </done>
</task>

</tasks>

<verification>
- `V3AgentInput` tiene `sessionId?: string`.
- `v3-production-runner` pasa `session.id`.
- `pollCrmContext` exportado con firma exacta.
- Fast-path + poll path implementados + timeout.
- Wire en `processUserMessage` antes de `comprehend`, guardado por `if (input.sessionId)`.
- Eventos `crm_context_used` y `crm_context_missing_after_wait` emitidos solo cuando poll DB real (no fast-path).
- 7 unit tests pasan.
- TypeScript clean.
- Cero cambio de prompt final (eso viene en Plan 06).
</verification>

<success_criteria>
- En sandbox / tests sin sessionId: comportamiento identico a hoy (guard salta el poll).
- En produccion con flag=false: poll siempre retorna `status='timeout'` (la Inngest function no escribio nada), emite `crm_context_missing_after_wait` una vez por turno — NO impacto funcional porque el comprehension (Plan 06) lee el marker antes de inyectar y tambien gateeara con flag.
- En produccion con flag=true (Plan 07): el dispatch + function corren antes del turno 1+ en 80%+ casos → fast-path gana → cero poll DB. El restante 20% hace poll 1-2 iteraciones y obtiene status=ok.
- Regla 6: cero cambio observable en produccion hasta que Plan 06 inyecte al prompt + Plan 07 active flag.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-crm-reader/05-SUMMARY.md` documenting:
- Commit hashes (3 commits: types extension, poll helper, test)
- Numero de linea del helper `pollCrmContext` en somnio-recompra-agent.ts post-edit
- Numero de linea del call-site dentro de processUserMessage
- Output de `npm run test -- crm-context-poll.test.ts` (7/7 passed copiado verbatim)
- Confirmacion: "Poll helper listo, pero solo tiene efecto observable cuando Plan 06 (comprehension inject) + Plan 07 (flag=true) esten activos"
</output>
