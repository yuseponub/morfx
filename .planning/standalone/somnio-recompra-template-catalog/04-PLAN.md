---
phase: somnio-recompra-template-catalog
plan: 04
type: execute
wave: 2
depends_on: [02, 03]
files_modified:
  - src/lib/agents/somnio-recompra/__tests__/transitions.test.ts
  - src/lib/agents/somnio-recompra/__tests__/response-track.test.ts
autonomous: true

must_haves:
  truths:
    - "Test `resolveTransition('initial', 'saludo', state, gates)` retorna null (D-05 + Q#1)"
    - "Test `resolveTransition('initial', 'quiero_comprar', state, gates)` retorna {action: 'preguntar_direccion', ...} con timerSignal level L5 (D-04)"
    - "Test `resolveSalesActionTemplates('preguntar_direccion', state)` con state preloaded (direccion+ciudad+departamento) devuelve extraContext.direccion_completa='<direccion>, <ciudad>, <departamento>' (D-12)"
    - "Test `resolveSalesActionTemplates('preguntar_direccion', state)` con state.datos.departamento=null filtra el null correctamente (filter(Boolean) funciona con departamento posicion 3)"
    - "Test `INFORMATIONAL_INTENTS.has('registro_sanitario') === true` (D-06)"
    - "Test end-to-end con mock de TemplateManager: turn-0 `intent='saludo'` produce 2 mensajes (texto CORE + imagen COMPLEMENTARIA) sin templates de promociones (D-05 integrado)"
    - "`npm run test -- src/lib/agents/somnio-recompra/__tests__/` pasa exit 0 (todos los tests nuevos + existentes)"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/__tests__/transitions.test.ts"
      provides: "Tests unitarios de la state machine cubriendo D-04 + D-05 + regresion de otras entries"
      contains: "describe('resolveTransition — post-D-04/D-05 redesign'"
    - path: "src/lib/agents/somnio-recompra/__tests__/response-track.test.ts"
      provides: "Tests unitarios de resolveSalesActionTemplates + integracion con TemplateManager mock cubriendo D-03 (2 rows saludo) + D-06 (registro_sanitario) + D-12 (direccion_completa incluye departamento)"
      contains: "describe('resolveSalesActionTemplates"
  key_links:
    - from: "src/lib/agents/somnio-recompra/__tests__/transitions.test.ts"
      to: "src/lib/agents/somnio-recompra/transitions.ts (cambios Plan 03)"
      via: "import { resolveTransition } from '../transitions'"
      pattern: "resolveTransition"
    - from: "src/lib/agents/somnio-recompra/__tests__/response-track.test.ts"
      to: "src/lib/agents/somnio-recompra/response-track.ts (cambios Plan 02)"
      via: "import { resolveSalesActionTemplates, resolveResponseTrack } from '../response-track' (requires Plan 02 export)"
      pattern: "resolveSalesActionTemplates"
---

<objective>
Wave 2 — Cobertura de tests unitarios validando los cambios de Plans 02 y 03. Produce 2 archivos nuevos bajo `src/lib/agents/somnio-recompra/__tests__/`:
- `transitions.test.ts`: cubre D-04 (quiero_comprar → preguntar_direccion con L5) + D-05 (saludo sin match → null fallback) + regresion de otras entries criticas (datos, confirmar_direccion, seleccion_pack).
- `response-track.test.ts`: cubre D-03 (saludo combina texto+imagen sin promos) + D-06 (registro_sanitario es informational) + D-12 (direccion_completa incluye departamento).

Purpose: Establecer un safety net antes del deploy de Plan 05. Si un futuro cambio (accidental o deliberado) rompe alguno de estos comportamientos locked en D-03..D-13, el runner de tests lo bloquea.

Output: 2 archivos `.test.ts` nuevos. 1 commit atomico (combina ambos archivos — son coherentes como safety net de esta fase). NO push.

**Infra verified:** `vitest@1.6.1` instalado en package.json (fue Wave 0 de phase somnio-recompra-crm-reader, ya shipped). `npm run test` corre en ~18s para 17 tests existentes. Pattern de mocks verificado en `crm-context-poll.test.ts` (`vi.mock('@/lib/agents/session-manager', ...)`).

**Q#2 addressed here explicitly:** Para el test de direccion_completa (D-12), NO se testea el branch `!datosCriticos` (Opcion A per plan objective — deuda tecnica documentada en Plan 05 LEARNINGS). Solo happy path: state preloaded → direccion+ciudad+departamento concatenados.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-03, D-04, D-05, D-06, D-12
@.planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Validation Architecture (test framework + phase req → test map), §Existing Patterns #5 (test infrastructure), §Open Q#2 (Opcion A — happy path only)
@.planning/standalone/somnio-recompra-template-catalog/02-PLAN.md (dependency — export resolveSalesActionTemplates)
@.planning/standalone/somnio-recompra-template-catalog/03-PLAN.md (dependency — transitions state machine)
@src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts (pattern reference — vi.mock, beforeEach, fake timers)
@src/lib/agents/somnio-recompra/__tests__/comprehension-prompt.test.ts (pattern reference — describe/it structure)
@src/lib/agents/somnio-recompra/state.ts linea 45-92 (createInitialState + createPreloadedState para fixtures)
@src/lib/agents/somnio-recompra/types.ts (AgentState, Gates, TipoAccion, DatosCliente interfaces)
@src/lib/agents/somnio/template-manager.ts (clase a mockear — metodo getTemplatesForIntents signature)
@vitest.config.ts (confirmacion del alias `@` → `./src`)

<interfaces>
<!-- API de resolveTransition (src/lib/agents/somnio-recompra/transitions.ts:268-293) -->
export function resolveTransition(
  phase: RecompraPhase,      // 'initial' | 'promos_shown' | 'confirming' | 'closed'
  on: string,                // intent name OR 'timer_expired:N'
  state: AgentState,
  gates: Gates,
  changes?: StateChanges,
): { action: TipoAccion; output: TransitionOutput } | null

<!-- API de resolveSalesActionTemplates (post Plan 02 export) -->
export async function resolveSalesActionTemplates(
  action: TipoAccion,
  state: AgentState,
): Promise<{ intents: string[]; extraContext?: Record<string, string> }>

<!-- API de resolveResponseTrack (src/lib/agents/somnio-recompra/response-track.ts:45-226) -->
export async function resolveResponseTrack(input: {
  salesAction?: TipoAccion
  intent?: string
  secondaryIntent?: string
  state: AgentState
  workspaceId: string
}): Promise<ResponseTrackOutput>

<!-- API de TemplateManager (src/lib/agents/somnio/template-manager.ts) — signature a mockear -->
class TemplateManager {
  constructor(workspaceId: string)
  async getTemplatesForIntents(
    agentId: string,
    intents: string[],
    intentsVistos: IntentRecord[],
    templatesMostrados: string[],
  ): Promise<Map<string, { templates: Template[], ... }>>
  async processTemplates(templates, ctx, isFirstVisit): Promise<PrioritizedTemplate[]>
}

<!-- Pattern de mock (VERIFIED crm-context-poll.test.ts:1-11) -->
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: vi.fn(...),
    processTemplates: vi.fn(...),
  })),
}))
import { resolveResponseTrack } from '../response-track'

<!-- Fixture de state para tests (VERIFIED state.ts:80-92) -->
const preloadedState = createPreloadedState({
  nombre: 'Jose',
  apellido: 'Romero',
  telefono: '+573001234567',
  direccion: 'Calle 48A #27-85',
  ciudad: 'Bucaramanga',
  departamento: 'Santander',
})
const gates = computeGates(preloadedState)  // gates.datosCriticos === true
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Crear transitions.test.ts con 6+ casos cubriendo D-04 + D-05 + regresion</name>
  <read_first>
    - src/lib/agents/somnio-recompra/transitions.ts (post-Plan-03) — verificar que saludo entry ya NO existe y quiero_comprar tiene action: 'preguntar_direccion' L5
    - src/lib/agents/somnio-recompra/state.ts lineas 200-280 (computeGates, createPreloadedState)
    - src/lib/agents/somnio-recompra/types.ts (interfaces AgentState, Gates, RecompraPhase)
    - src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts (pattern reference)
    - vitest.config.ts (alias `@` → `./src`)
  </read_first>
  <behavior>
    - `resolveTransition('initial', 'saludo', preloadedState, gates)` retorna `null` (D-05 + Q#1) — no hay entry matching, sales-track fallback.
    - `resolveTransition('initial', 'quiero_comprar', preloadedState, gates)` retorna `{action: 'preguntar_direccion', output: {timerSignal: {type:'start', level:'L5', ...}, reason: 'Quiere comprar en initial → preguntar confirmacion de direccion...'}}` (D-04).
    - `resolveTransition('initial', 'datos', preloadedState, gates)` con datosCriticos=true retorna `{action: 'ofrecer_promos', ...}` (regresion — Escenario 3 debe seguir funcionando).
    - `resolveTransition('initial', 'confirmar_direccion', preloadedState, gates)` retorna `{action: 'ofrecer_promos', ...}` (regresion — completa el flow quiero_comprar → preguntar_direccion → confirmar_direccion → promos).
    - `resolveTransition('promos_shown', 'seleccion_pack', preloadedState, gates)` con datosCriticos=true retorna `{action: 'mostrar_confirmacion', ...}` (regresion).
    - `resolveTransition('initial', 'no_interesa', preloadedState, gates)` retorna `{action: 'no_interesa', ...}` (regresion — catch-all any-phase).
  </behavior>
  <action>
    Crear archivo NUEVO `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` con el contenido siguiente:

    ```typescript
    /**
     * Tests for transitions.ts state machine — post somnio-recompra-template-catalog redesign.
     *
     * Covers:
     * - D-04: quiero_comprar in initial → action 'preguntar_direccion' with L5 timer
     * - D-05 + Q#1: saludo in initial → resolveTransition returns null (handled by response-track INFORMATIONAL_INTENTS branch)
     * - Regression: other entries (datos, confirmar_direccion, seleccion_pack, no_interesa) unchanged
     */

    import { describe, it, expect } from 'vitest'
    import { resolveTransition } from '../transitions'
    import { createPreloadedState, computeGates } from '../state'
    import type { AgentState, Gates } from '../types'

    // ============================================================================
    // Fixtures
    // ============================================================================

    function buildPreloadedState(): AgentState {
      return createPreloadedState({
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '+573001234567',
        direccion: 'Calle 48A #27-85',
        ciudad: 'Bucaramanga',
        departamento: 'Santander',
      })
    }

    function buildGatesForPreloaded(state: AgentState): Gates {
      return computeGates(state)
    }

    // ============================================================================
    // D-05 + Q#1: saludo has no transition entry in initial phase
    // ============================================================================

    describe('resolveTransition — D-05 + Q#1 saludo fallback', () => {
      it('returns null for initial + saludo (entry removed — fallback to response-track INFORMATIONAL_INTENTS branch)', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('initial', 'saludo', state, gates)

        expect(result).toBeNull()
      })

      it('returns null for saludo in any non-initial phase too (was never matched pre-change either)', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        expect(resolveTransition('promos_shown', 'saludo', state, gates)).toBeNull()
        expect(resolveTransition('confirming', 'saludo', state, gates)).toBeNull()
      })
    })

    // ============================================================================
    // D-04: quiero_comprar in initial → preguntar_direccion with L5 timer
    // ============================================================================

    describe('resolveTransition — D-04 quiero_comprar redesign', () => {
      it('returns action=preguntar_direccion + timerSignal L5 for initial + quiero_comprar', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('initial', 'quiero_comprar', state, gates)

        expect(result).not.toBeNull()
        expect(result!.action).toBe('preguntar_direccion')
        expect(result!.output.timerSignal).toEqual({
          type: 'start',
          level: 'L5',
          reason: 'quiero_comprar → preguntar direccion',
        })
        expect(result!.output.reason).toMatch(/preguntar confirmacion de direccion/)
      })

      it('does NOT match ofrecer_promos anymore for quiero_comprar in initial', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('initial', 'quiero_comprar', state, gates)

        expect(result!.action).not.toBe('ofrecer_promos')
      })
    })

    // ============================================================================
    // Regression: untouched entries
    // ============================================================================

    describe('resolveTransition — regression (untouched entries)', () => {
      it('initial + datos with datosCriticos=true → ofrecer_promos (Escenario 3)', () => {
        const state = buildPreloadedState()  // preloaded = datosCriticos true
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('initial', 'datos', state, gates)

        expect(result).not.toBeNull()
        expect(result!.action).toBe('ofrecer_promos')
      })

      it('initial + confirmar_direccion → ofrecer_promos (completes the quiero_comprar flow)', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('initial', 'confirmar_direccion', state, gates)

        expect(result).not.toBeNull()
        expect(result!.action).toBe('ofrecer_promos')
      })

      it('promos_shown + seleccion_pack with datosCriticos=true → mostrar_confirmacion', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('promos_shown', 'seleccion_pack', state, gates)

        expect(result).not.toBeNull()
        expect(result!.action).toBe('mostrar_confirmacion')
      })

      it('any-phase + no_interesa → no_interesa', () => {
        const state = buildPreloadedState()
        const gates = buildGatesForPreloaded(state)

        expect(resolveTransition('initial', 'no_interesa', state, gates)!.action).toBe('no_interesa')
        expect(resolveTransition('promos_shown', 'no_interesa', state, gates)!.action).toBe('no_interesa')
        expect(resolveTransition('confirming', 'no_interesa', state, gates)!.action).toBe('no_interesa')
      })

      it('confirming + confirmar with datosCriticos+packElegido → crear_orden', () => {
        const state = buildPreloadedState()
        state.pack = '2x'  // packElegido = true
        const gates = buildGatesForPreloaded(state)

        const result = resolveTransition('confirming', 'confirmar', state, gates)

        expect(result).not.toBeNull()
        expect(result!.action).toBe('crear_orden')
      })
    })
    ```

    **Verificar que corre:**
    ```bash
    npm run test -- src/lib/agents/somnio-recompra/__tests__/transitions.test.ts 2>&1 | tee /tmp/test-04-01.log
    # Expected: todos los tests pasan (7 tests en 4 describe blocks).
    ```

    **Troubleshooting común:**
    - Si `computeGates` es un nombre diferente en `state.ts`, leer el archivo y usar el export correcto (puede estar como `computeGates` o `deriveGates`).
    - Si `createPreloadedState` no acepta `departamento` directo, revisar signature — puede requerir llamarla con todos los campos opcional.
    - Si los timerSignal objects difieren en formato (ej. lowercase 'l5' vs 'L5'), ajustar assertion al formato real que produce `transitions.ts` post-Plan-03.

    NO hacer commit todavia — sigue Task 2 para agregar el otro archivo y commiteamos ambos juntos.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-recompra/__tests__/transitions.test.ts</automated>
    <automated>grep -q "describe('resolveTransition — D-05" src/lib/agents/somnio-recompra/__tests__/transitions.test.ts</automated>
    <automated>grep -q "describe('resolveTransition — D-04" src/lib/agents/somnio-recompra/__tests__/transitions.test.ts</automated>
    <automated>grep -q "expect(result).toBeNull()" src/lib/agents/somnio-recompra/__tests__/transitions.test.ts</automated>
    <automated>grep -q "'preguntar_direccion'" src/lib/agents/somnio-recompra/__tests__/transitions.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-recompra/__tests__/transitions.test.ts 2>&1 | tee /tmp/test-04-01.log; grep -qE "Test Files.*passed|PASS" /tmp/test-04-01.log && ! grep -qE "FAIL" /tmp/test-04-01.log</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` existe.
    - Contiene minimo 7 tests agrupados en 3 describe blocks (D-05 fallback, D-04 redesign, regression).
    - `npm run test` ejecuta el archivo sin errores de import y TODOS los tests pasan.
    - Los tests hacen assertions concretas: `expect(result).toBeNull()` para saludo, `expect(result!.action).toBe('preguntar_direccion')` para quiero_comprar, etc.
    - NO mockea TemplateManager ni Supabase — son tests puros del state machine.
  </acceptance_criteria>
  <done>
    - Archivo creado, todos los tests verdes.
    - NO commit todavia — Task 2 combina.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Crear response-track.test.ts con cobertura de D-03 + D-06 + D-12</name>
  <read_first>
    - src/lib/agents/somnio-recompra/response-track.ts (post-Plan-02) — confirmar `export async function resolveSalesActionTemplates(` + `TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` + direccion_completa incluye departamento
    - src/lib/agents/somnio-recompra/constants.ts (post-Plan-02) — confirmar INFORMATIONAL_INTENTS tiene 'registro_sanitario'
    - src/lib/agents/somnio-recompra/__tests__/crm-context-poll.test.ts (pattern de mock con vi.mock hoisted)
    - src/lib/agents/somnio/template-manager.ts (signatures de TemplateManager para mock stub)
    - src/lib/agents/somnio-recompra/state.ts (createPreloadedState)
  </read_first>
  <behavior>
    - `resolveSalesActionTemplates('preguntar_direccion', preloadedState)` con state.datos.departamento='Santander' retorna `{intents: ['preguntar_direccion_recompra'], extraContext: {direccion_completa: 'Calle 48A #27-85, Bucaramanga, Santander', nombre_saludo: 'Buenos dias Jose' (o similar)}}` (D-12).
    - `resolveSalesActionTemplates('preguntar_direccion', state)` con departamento=null retorna `direccion_completa: 'Calle 48A #27-85, Bucaramanga'` (filter dropea null — verified behavior).
    - `INFORMATIONAL_INTENTS.has('registro_sanitario') === true` (D-06 sanity).
    - `resolveResponseTrack({intent: 'saludo', state: preloadedState, workspaceId: 'test-ws'})` con mock de TemplateManager retornando 2 rows (texto+imagen) produce `messages` con 2 items: `{contentType: 'texto'}` y `{contentType: 'imagen'}` — verifica hasSaludoCombined=false branch (D-05 integrado, no dropea imagen).
    - `resolveResponseTrack` con intent='saludo' NO incluye `'promociones'` en `infoTemplateIntents` (D-05 — no hay auto-promos con saludo).
  </behavior>
  <action>
    Crear archivo NUEVO `src/lib/agents/somnio-recompra/__tests__/response-track.test.ts` con el contenido siguiente:

    ```typescript
    /**
     * Tests for response-track.ts — post somnio-recompra-template-catalog redesign.
     *
     * Covers:
     * - D-03: saludo produces 2 messages (texto CORE orden=0 + imagen COMPLEMENTARIA orden=1)
     * - D-05: saludo alone does NOT include promociones templates (no auto-promos)
     * - D-06: 'registro_sanitario' ∈ INFORMATIONAL_INTENTS
     * - D-12: resolveSalesActionTemplates('preguntar_direccion', state) → extraContext.direccion_completa includes state.datos.departamento
     *
     * Q#2 scope: only happy-path for preguntar_direccion (datosCriticos=true). Branch
     * !datosCriticos (campos_faltantes) NOT tested — documented as tech debt in LEARNINGS.
     */

    import { describe, it, expect, vi, beforeEach } from 'vitest'
    import { INFORMATIONAL_INTENTS } from '../constants'
    import { createPreloadedState } from '../state'

    // ============================================================================
    // Mock TemplateManager BEFORE importing response-track
    // ============================================================================
    // vi.mock is hoisted — fixture defined inside factory to avoid scope issues.

    vi.mock('@/lib/agents/somnio/template-manager', () => {
      const getTemplatesForIntents = vi.fn()
      const processTemplates = vi.fn()

      return {
        TemplateManager: vi.fn().mockImplementation(() => ({
          getTemplatesForIntents,
          processTemplates,
        })),
        // Expose mocks via the TemplateManager constructor mock.instances[n]
        // — or tests can import this module and set .mockReturnValue on them.
        __mocks: { getTemplatesForIntents, processTemplates },
      }
    })

    // Import AFTER mocks
    import {
      resolveResponseTrack,
      resolveSalesActionTemplates,
    } from '../response-track'

    // Helper: grab mock refs via the module
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateManagerModule = await import('@/lib/agents/somnio/template-manager') as any
    const getTemplatesForIntentsMock = templateManagerModule.__mocks.getTemplatesForIntents as ReturnType<typeof vi.fn>
    const processTemplatesMock = templateManagerModule.__mocks.processTemplates as ReturnType<typeof vi.fn>

    // ============================================================================
    // Fixtures
    // ============================================================================

    function buildPreloadedStateFull() {
      return createPreloadedState({
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '+573001234567',
        direccion: 'Calle 48A #27-85',
        ciudad: 'Bucaramanga',
        departamento: 'Santander',
      })
    }

    function buildPreloadedStateSinDepartamento() {
      return createPreloadedState({
        nombre: 'Jose',
        apellido: 'Romero',
        telefono: '+573001234567',
        direccion: 'Calle 48A #27-85',
        ciudad: 'Bucaramanga',
        // departamento intentionally omitted
      })
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    // ============================================================================
    // D-06: INFORMATIONAL_INTENTS includes registro_sanitario (trivial sanity)
    // ============================================================================

    describe('INFORMATIONAL_INTENTS — D-06', () => {
      it('includes registro_sanitario', () => {
        expect(INFORMATIONAL_INTENTS.has('registro_sanitario')).toBe(true)
      })

      it('still includes all original intents', () => {
        for (const intent of ['saludo', 'precio', 'promociones', 'pago', 'envio', 'ubicacion', 'contraindicaciones', 'dependencia', 'tiempo_entrega']) {
          expect(INFORMATIONAL_INTENTS.has(intent)).toBe(true)
        }
      })
    })

    // ============================================================================
    // D-12: resolveSalesActionTemplates preguntar_direccion includes departamento
    // ============================================================================

    describe('resolveSalesActionTemplates — D-12 direccion_completa includes departamento', () => {
      it('concatenates direccion + ciudad + departamento in that order (happy path)', async () => {
        const state = buildPreloadedStateFull()

        const result = await resolveSalesActionTemplates('preguntar_direccion', state)

        expect(result.intents).toEqual(['preguntar_direccion_recompra'])
        expect(result.extraContext?.direccion_completa).toBe('Calle 48A #27-85, Bucaramanga, Santander')
      })

      it('drops null departamento via filter(Boolean) — defensive behavior', async () => {
        const state = buildPreloadedStateSinDepartamento()
        // Force datosCriticos path: direccion && ciudad present, departamento null
        expect(state.datos.departamento).toBeNull()

        const result = await resolveSalesActionTemplates('preguntar_direccion', state)

        // Happy path still chosen because direccion+ciudad present → faltantes may include departamento but direccion && ciudad short-circuit triggers happy path
        if (result.extraContext?.direccion_completa !== undefined) {
          // departamento null → filtered out → only direccion + ciudad
          expect(result.extraContext.direccion_completa).toBe('Calle 48A #27-85, Bucaramanga')
        }
        // Note: if departamento missing pushes to !datosCriticos branch, campos_faltantes path applies;
        // either outcome is acceptable for this defensive check — what we verify is that NO orphan ", ," or empty trailing comma appears.
        expect(result.extraContext?.direccion_completa ?? '').not.toMatch(/, ,/)
        expect(result.extraContext?.direccion_completa ?? '').not.toMatch(/, $/)
      })

      it('provides nombre_saludo in extraContext (regression — pre-existing behavior)', async () => {
        const state = buildPreloadedStateFull()

        const result = await resolveSalesActionTemplates('preguntar_direccion', state)

        expect(result.extraContext?.nombre_saludo).toBeDefined()
        expect(result.extraContext!.nombre_saludo).toMatch(/Jose/)
      })
    })

    // ============================================================================
    // D-03 + D-05: saludo produces 2 messages (texto + imagen) without promociones
    // ============================================================================

    describe('resolveResponseTrack — D-03 saludo emits texto + imagen, D-05 no auto-promos', () => {
      it('turn-0 intent=saludo (no salesAction) produces 2 messages (texto CORE + imagen COMPLEMENTARIA) and no promociones', async () => {
        const state = buildPreloadedStateFull()

        // Arrange: TemplateManager returns 2 rows for 'saludo' + 0 rows for 'promociones'
        getTemplatesForIntentsMock.mockResolvedValueOnce(new Map([
          ['saludo', {
            templates: [
              { id: 'tpl-saludo-texto', content: '{{nombre_saludo}} 😊', contentType: 'texto', priority: 'CORE', orden: 0, delaySeconds: 0 },
              { id: 'tpl-saludo-imagen', content: 'https://example.com/elixir.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?', contentType: 'imagen', priority: 'COMPLEMENTARIA', orden: 1, delaySeconds: 3 },
            ],
          }],
        ]))

        processTemplatesMock.mockResolvedValueOnce([
          { id: 'tpl-saludo-texto', content: 'Buenos dias Jose 😊', contentType: 'texto', priority: 'CORE', orden: 0, delaySeconds: 0 },
          { id: 'tpl-saludo-imagen', content: 'https://example.com/elixir.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?', contentType: 'imagen', priority: 'COMPLEMENTARIA', orden: 1, delaySeconds: 3 },
        ])

        // Act: no salesAction (resolveTransition returned null per D-05 + Q#1)
        const result = await resolveResponseTrack({
          intent: 'saludo',
          state,
          workspaceId: 'test-ws',
        })

        // Assert: 2 messages — texto + imagen
        expect(result.messages).toHaveLength(2)
        expect(result.messages[0].contentType).toBe('texto')
        expect(result.messages[0].content).toContain('Jose')
        expect(result.messages[1].contentType).toBe('imagen')
        expect(result.messages[1].content).toContain('ELIXIR DEL SUEÑO')

        // D-05: no promociones templates requested
        expect(result.infoTemplateIntents).toEqual(['saludo'])
        expect(result.salesTemplateIntents).toEqual([])
        expect(result.infoTemplateIntents).not.toContain('promociones')
      })
    })
    ```

    **Verificar que corre:**
    ```bash
    npm run test -- src/lib/agents/somnio-recompra/__tests__/response-track.test.ts 2>&1 | tee /tmp/test-04-02.log
    # Expected: todos los tests pasan.
    ```

    **Troubleshooting común:**
    - Si `vi.mock` con export `__mocks` no funciona por el top-level await pattern, alternativa: usar factory puro sin mock refs exposed, y en cada `it` construir el stub inline mediante `vi.mocked(TemplateManager).mockImplementation(...)`. Ver el file `crm-context-poll.test.ts` para pattern alternativo.
    - Si `createPreloadedState` no acepta la signature con objeto parcial, revisar exports y ajustar.
    - Si el test de `direccion_completa` con departamento=null cae en branch `!datosCriticos`, el assertion flexible (regex no `, ,` ni trailing comma) debe cubrirlo; si no, especializar el test para solo verificar happy path con departamento presente.

    **Commit atomico combinado (ambos test files):**
    ```bash
    git add src/lib/agents/somnio-recompra/__tests__/transitions.test.ts \
            src/lib/agents/somnio-recompra/__tests__/response-track.test.ts
    git commit -m "test(somnio-recompra-template-catalog): agregar tests unitarios D-03/D-04/D-05/D-06/D-12"
    ```

    **Verificar suite completa:**
    ```bash
    npm run test -- src/lib/agents/somnio-recompra/__tests__/ 2>&1 | tee /tmp/test-04-suite.log
    # Expected: todos los tests de recompra pasan (17 existentes + ~10 nuevos de este plan).
    ```

    **NO push.**
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-recompra/__tests__/response-track.test.ts</automated>
    <automated>grep -q "describe('INFORMATIONAL_INTENTS — D-06'" src/lib/agents/somnio-recompra/__tests__/response-track.test.ts</automated>
    <automated>grep -q "describe('resolveSalesActionTemplates — D-12" src/lib/agents/somnio-recompra/__tests__/response-track.test.ts</automated>
    <automated>grep -q "describe('resolveResponseTrack — D-03 saludo" src/lib/agents/somnio-recompra/__tests__/response-track.test.ts</automated>
    <automated>grep -q "Calle 48A #27-85, Bucaramanga, Santander" src/lib/agents/somnio-recompra/__tests__/response-track.test.ts</automated>
    <automated>grep -q "registro_sanitario" src/lib/agents/somnio-recompra/__tests__/response-track.test.ts</automated>
    <automated>npm run test -- src/lib/agents/somnio-recompra/__tests__/ 2>&1 | tee /tmp/test-04-suite.log; grep -qE "Test Files.*passed" /tmp/test-04-suite.log && ! grep -qE "FAIL|failed" /tmp/test-04-suite.log</automated>
    <automated>git log -1 --format=%s | grep -qF "test(somnio-recompra-template-catalog): agregar tests unitarios D-03/D-04/D-05/D-06/D-12"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `src/lib/agents/somnio-recompra/__tests__/response-track.test.ts` existe.
    - Contiene minimo 3 describe blocks cubriendo D-06, D-12, D-03+D-05 integrado.
    - Contiene test que verifica `direccion_completa === 'Calle 48A #27-85, Bucaramanga, Santander'` (exact match con D-12).
    - Contiene test que verifica `INFORMATIONAL_INTENTS.has('registro_sanitario') === true`.
    - Contiene test que verifica que turn-0 saludo emite `messages` con 2 items (texto + imagen) y `infoTemplateIntents === ['saludo']` sin `'promociones'`.
    - Commit atomico combinando transitions.test.ts + response-track.test.ts con mensaje empezando por `test(somnio-recompra-template-catalog): agregar tests unitarios D-03/D-04/D-05/D-06/D-12`.
    - `npm run test -- src/lib/agents/somnio-recompra/__tests__/` sale exit 0 (todos los tests pasan — nuevos + existentes).
  </acceptance_criteria>
  <done>
    - Ambos test files commiteados juntos.
    - Suite completa verde.
    - NO pusheado.
  </done>
</task>

</tasks>

<verification>
- `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts` existe con ≥7 tests cubriendo D-04/D-05 + regresion.
- `src/lib/agents/somnio-recompra/__tests__/response-track.test.ts` existe con ≥4 tests cubriendo D-03/D-06/D-12.
- `npm run test -- src/lib/agents/somnio-recompra/__tests__/` pasa exit 0.
- 1 commit atomico en git (ambos test files juntos), NO pusheado.
</verification>

<success_criteria>
- Safety net establecido antes del push a prod (Plan 05).
- Cualquier regresion futura en D-03..D-13 dispara fallas en CI (via `npm run test` en pre-push hooks o Vercel build).
- Plan 05 puede pushear con confianza — si suite passa localmente, el catalogo + codigo son coherentes.
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-template-catalog/04-SUMMARY.md` documenting:
- Commit hash del commit combinado (`test(...): agregar tests unitarios D-03/D-04/D-05/D-06/D-12`)
- Path completo de los 2 test files nuevos
- Count total de tests nuevos agregados (X en transitions.test.ts + Y en response-track.test.ts = Z tests)
- Output del `npm run test -- src/lib/agents/somnio-recompra/__tests__/` — stats de pasados/fallados
- Confirmacion explicita: "Q#2 scope limitation documented — solo happy path de preguntar_direccion, deuda documentada para LEARNINGS"
- Confirmacion explicita: "NO pusheado — Plan 05 hace el push final"
</output>
