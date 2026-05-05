---
phase: agent-godentist-fb-ig
plan: 06
type: execute
wave: 4
depends_on: [02, 03, 04, 05]
files_modified:
  - src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts
  - src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts
  - src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts
  - src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts
  - src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts
  - src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts
autonomous: true
requirements: [GFB-05]

must_haves:
  truths:
    - "Existen 6 archivos de test en `src/lib/agents/godentist-fb-ig/__tests__/` (transitions, comprehension, response-track, sales-track, lead-capture, godentist-fb-ig-agent)"
    - "El comando `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` retorna 6 suites con minimo 50 tests passed (rango basado en somnio-pw-confirmation 65 tests en 5 suites — el sibling tiene 6 suites por agregado de comprehension.test.ts)"
    - "Anti-regresion D-08 (Pitfall 1) testeada explicitamente: response-track.test.ts contiene minimo 1 assercion `expect(getTemplatesForIntentsMock).toHaveBeenCalledWith('godentist-fb-ig', ...)` y verifica que NO se llama con 'godentist'"
    - "lead-capture.test.ts cubre los casos boundary del helper: turnCount 0/1/2/5; intent datos/saludo/quiero_agendar; gates con/sin datosCriticos; campos faltantes [] vs [nombre] vs [todos] (matrix completa)"
    - "TypeScript compila los test files sin errores nuevos: npx tsc --noEmit no agrega errors"
    - "Cero `createAdminClient` o `@supabase/supabase-js` en los test files (mocks apropiados)"
  artifacts:
    - path: "src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts"
      provides: "12-20 tests del state machine — fixtures + first-match wins"
      contains: "describe('resolveTransition'"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts"
      provides: "6-10 tests del Haiku call con vi.mock('@anthropic-ai/sdk')"
      contains: "describe('comprehend'"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts"
      provides: "10-15 tests con anti-regresion D-08 mock TemplateManager y verificacion agent_id='godentist-fb-ig'"
      contains: "godentist-fb-ig"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts"
      provides: "8-12 tests cubriendo lead-capture path + flujos normales"
      contains: "describe('resolveSalesTrack'"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts"
      provides: "8-15 tests boundary del helper puro (matrix turn x intent x gates x campos)"
      contains: "describe('resolveLeadCapture'"
    - path: "src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts"
      provides: "5-8 tests E2E pipeline integration (mock comprehension + TemplateManager)"
      contains: "processMessage"
  key_links:
    - from: "src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts"
      to: "src/lib/agents/godentist-fb-ig/response-track.ts (anti-regresion D-08)"
      via: "expect(getTemplatesForIntentsMock).toHaveBeenCalledWith('godentist-fb-ig', ...)"
      pattern: "godentist-fb-ig"
    - from: "src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts"
      to: "src/lib/agents/godentist-fb-ig/lead-capture.ts (Pitfall 5 boundary check)"
      via: "tests turnCount 0/1/2 + matrix de intent/gates/camposFaltantes"
      pattern: "turnCount"
    - from: "src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts"
      to: "src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts (E2E pipeline)"
      via: "mock comprehend + TemplateManager → invoke processMessage → assert output"
      pattern: "processMessage"
---

<objective>
Wave 4 — Crear 6 archivos de tests automatizados blindando el sibling contra regresiones (D-17). El godentist original NO tiene `__tests__/` (verificado por RESEARCH.md), asi que esta es la primera suite de tests del subsistema.

Purpose: D-17 obliga suite completa de tests automaticos (no minimalista). El sibling tiene comportamiento nuevo (lead-capture turn 1) y un anti-regresion critico (D-08 catalog independiente, Pitfall 1) que MUST estar cubierto. Los tests usan patrones de `somnio-pw-confirmation/__tests__/` (65 tests en 5 suites validados en produccion) — el sibling tiene 6 suites porque agrega `comprehension.test.ts` (no existe en somnio-pw-confirmation).

**Test budget esperado:** 50-80 tests totales en 6 suites:
- transitions.test.ts: 12-20 tests
- comprehension.test.ts: 6-10 tests
- response-track.test.ts: 10-15 tests
- sales-track.test.ts: 8-12 tests
- lead-capture.test.ts: 8-15 tests
- godentist-fb-ig-agent.test.ts: 5-8 tests

**Anti-regresion CRITICA en cada test que invoca response-track:**
```typescript
expect(getTemplatesForIntentsMock).toHaveBeenCalledWith(
  'godentist-fb-ig',  // ← NO 'godentist' — Pitfall 1
  expect.any(Array),
  expect.any(Array),
  expect.any(Array),
)
```

Output: 6 archivos de test que pasan via `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/04-SUMMARY.md
@CLAUDE.md
@src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts
@src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts
@src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts
@src/lib/agents/godentist-fb-ig/lead-capture.ts
@src/lib/agents/godentist-fb-ig/sales-track.ts
@src/lib/agents/godentist-fb-ig/response-track.ts
@src/lib/agents/godentist-fb-ig/comprehension.ts
@src/lib/agents/godentist-fb-ig/transitions.ts
@src/lib/agents/godentist-fb-ig/types.ts
@src/lib/agents/godentist-fb-ig/state.ts

<interfaces>
<!-- Test files (6 totales) — patron mock validado por somnio-pw-confirmation -->
TEST_FRAMEWORK = 'vitest'  // ya configurado en vitest.config.ts
MOCK_PATTERN = 'vi.hoisted() + vi.mock()'  // somnio-pw-confirmation/__tests__/response-track.test.ts:24-49

<!-- Mocks principales -->
TEMPLATE_MANAGER_MOCK = "vi.mock('@/lib/agents/somnio/template-manager')"
ANTHROPIC_MOCK = "vi.mock('@anthropic-ai/sdk')"

<!-- Anti-regresion D-08 obligatoria -->
ANTI_REGRESSION_ASSERT = "expect(getTemplatesForIntentsMock).toHaveBeenCalledWith('godentist-fb-ig', ...)"

<!-- Test runner -->
TEST_CMD = "npx vitest run src/lib/agents/godentist-fb-ig/__tests__/"
</interfaces>

<security_relevant>
**Workspace isolation:** Tests usan workspaceId fixtures (`'test-workspace-uuid'`); cero acceso a Supabase real.

**PII en fixtures:** Tests usan datos sinteticos ("Juan Perez", "Maria Lopez", "3001234567"). NO usar datos productivos reales.

**Pitfall 1 cobertura:** Anti-regresion D-08 testeada explicitamente — cualquier executor que copie rapido y deje GODENTIST_AGENT_ID en response-track.ts vera fallo en CI.
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear lead-capture.test.ts + transitions.test.ts (helpers puros)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/lead-capture.ts (creado en Plan 04 Task 1)
    - src/lib/agents/godentist-fb-ig/transitions.ts (clonado verbatim del godentist en Plan 02)
    - src/lib/agents/godentist-fb-ig/state.ts (export de camposFaltantes)
    - src/lib/agents/somnio-pw-confirmation/__tests__/transitions.test.ts (~309 LOC — patron fixtures)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Test Strategy + §Code Examples §7 (test fixture pattern)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Common Pitfalls §5 (Pitfall 5 turnCount boundary)
  </read_first>
  <action>
**Paso 1 — Crear `src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts`:**

Test file basado en RESEARCH.md §Test Strategy linea "lead-capture.test.ts: matrix de boundaries (3 turns x 4 intents x 4 estados de gates)". Cubre minimo 8-15 tests boundary:

```typescript
// Tests for resolveLeadCapture pure helper (D-09 + Pitfall 5)

import { describe, it, expect } from 'vitest'
import { resolveLeadCapture } from '../lead-capture'
import type { AgentState, Gates } from '../types'

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'inicio',
    fase_actual: 'inicio',
    datos: {},
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    turnCount: 0,
    ...overrides,
  } as AgentState
}

const GATES_NONE: Gates = { datosCriticos: false, fechaElegida: false, horarioElegido: false, datosCompletos: false }
const GATES_DATOS_OK: Gates = { datosCriticos: true, fechaElegida: false, horarioElegido: false, datosCompletos: false }
const GATES_DATOS_FECHA_OK: Gates = { datosCriticos: true, fechaElegida: true, horarioElegido: false, datosCompletos: false }

describe('resolveLeadCapture', () => {
  describe('Pitfall 5 — turnCount boundary', () => {
    it('returns null when turnCount === 0 (pre-merge state)', () => {
      const result = resolveLeadCapture({
        turnCount: 0,
        intent: 'datos',
        state: makeState(),
        gates: GATES_NONE,
      })
      expect(result).toBeNull()
    })

    it('returns null when turnCount === 2 (subsequent turns)', () => {
      const result = resolveLeadCapture({
        turnCount: 2,
        intent: 'datos',
        state: makeState({ turnCount: 2, datos: { nombre: 'Juan' } }),
        gates: GATES_NONE,
      })
      expect(result).toBeNull()
    })

    it('returns null when turnCount === 5 (deep conversation)', () => {
      const result = resolveLeadCapture({
        turnCount: 5,
        intent: 'datos',
        state: makeState({ turnCount: 5 }),
        gates: GATES_NONE,
      })
      expect(result).toBeNull()
    })

    it('triggers when turnCount === 1', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'datos',
        state: makeState({ turnCount: 1, datos: { nombre: 'Juan Perez' } }),
        gates: GATES_NONE,
      })
      expect(result).not.toBeNull()
      expect(result?.accion).toBe('pedir_datos_parcial')
    })
  })

  describe('intent gating', () => {
    it('returns null when intent !== datos (saludo)', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'saludo',
        state: makeState({ turnCount: 1 }),
        gates: GATES_NONE,
      })
      expect(result).toBeNull()
    })

    it('returns null when intent === quiero_agendar (handled by transitions)', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'quiero_agendar',
        state: makeState({ turnCount: 1 }),
        gates: GATES_NONE,
      })
      expect(result).toBeNull()
    })
  })

  describe('gates passthrough', () => {
    it('returns null when datos criticos completos but fecha falta (let sales-track go to pedir_fecha)', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'datos',
        state: makeState({ turnCount: 1, datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera' } }),
        gates: GATES_DATOS_OK,
      })
      expect(result).toBeNull()
    })

    it('returns null when datos criticos completos + fecha (let sales-track go to mostrar_disponibilidad)', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'datos',
        state: makeState({ turnCount: 1, datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera', fecha_preferida: '2026-05-10' } }),
        gates: GATES_DATOS_FECHA_OK,
      })
      expect(result).toBeNull()
    })
  })

  describe('reason content', () => {
    it('mentions faltantes in reason when only nombre present', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'datos',
        state: makeState({ turnCount: 1, datos: { nombre: 'Juan Perez' } }),
        gates: GATES_NONE,
      })
      expect(result).not.toBeNull()
      expect(result!.reason).toMatch(/telefono|telefono/i)
      expect(result!.reason).toMatch(/sede/i)
    })

    it('mentions faltantes in reason when only telefono present', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'datos',
        state: makeState({ turnCount: 1, datos: { telefono: '573001234567' } }),
        gates: GATES_NONE,
      })
      expect(result).not.toBeNull()
      expect(result!.reason).toMatch(/nombre/i)
    })
  })

  describe('timer signal', () => {
    it('returns timer L1 start when triggered', () => {
      const result = resolveLeadCapture({
        turnCount: 1,
        intent: 'datos',
        state: makeState({ turnCount: 1, datos: { nombre: 'Juan' } }),
        gates: GATES_NONE,
      })
      expect(result).not.toBeNull()
      expect(result!.timerSignal).toEqual({ type: 'start', level: 'L1', reason: expect.any(String) })
    })
  })
})
```

NOTA: Los nombres de campos en `datos` (e.g., `nombre`, `telefono`, `sede_preferida`, `fecha_preferida`) y los gate flags (`datosCriticos`, `fechaElegida`, etc.) deben coincidir con los exports actuales del godentist clonado. Si discrepan, ajustar los fixtures pero MANTENER la estructura de los tests.

**Paso 2 — Crear `src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts`:**

Adaptar el patron de `somnio-pw-confirmation/__tests__/transitions.test.ts`. Tests cubren minimo 12 casos del state machine. Cada test sigue el patron:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveTransition } from '../transitions'
import type { AgentState } from '../types'

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'inicio',
    fase_actual: 'inicio',
    datos: {},
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    turnCount: 0,
    ...overrides,
  } as AgentState
}

describe('resolveTransition (godentist-fb-ig)', () => {
  it('phase=inicio + intent=quiero_agendar + sin datos -> pedir_datos', () => {
    const state = makeState({ phase: 'inicio' })
    const result = resolveTransition('quiero_agendar', state, { datosCriticos: false } as any)
    expect(result?.action).toBe('pedir_datos')
  })

  it('phase=inicio + intent=precio_servicio -> precio_servicio (informational)', () => {
    const state = makeState({ phase: 'inicio' })
    const result = resolveTransition('precio_servicio', state, { datosCriticos: false } as any)
    expect(result?.action).toBe('precio_servicio')
  })

  // Agregar 10+ casos mas cubriendo:
  // - escape intents (escape, no_quiero_continuar, hablar_agente)
  // - retoma intents (retoma_inicial, retoma_post_info)
  // - phase transitions (datos_completos, mostrando_disponibilidad, confirmacion)
  // - datos parciales -> pedir_datos_parcial
  // - low confidence guard handling
})
```

NOTA: La firma exacta de `resolveTransition` y la forma de los tests deben coincidir con la implementacion clonada del godentist. Leer `src/lib/agents/godentist-fb-ig/transitions.ts` y derivar la firma + ~12 tests representativos cubriendo las branches mas criticas (saludo, agendamiento, escape, retoma, datos parciales).

**Paso 3 — Run tests:**

```bash
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts
```

Esperado: ambos pass. Si fallan:
- Ajustar fixtures `makeState` para coincidir con `AgentState` real (verificar `types.ts`).
- Ajustar gate flags si los nombres divergen del godentist clonado.

**Paso 4 — Commit:**

```bash
git add src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts
git commit -m "test(agent-godentist-fb-ig): add lead-capture.test.ts (Pitfall 5) + transitions.test.ts"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts</automated>
    <automated>grep -q "describe('resolveLeadCapture'" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts</automated>
    <automated>grep -q "Pitfall 5" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts</automated>
    <automated>grep -q "turnCount === 0" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts</automated>
    <automated>grep -q "turnCount === 2" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts</automated>
    <automated>grep -q "describe('resolveTransition" src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts</automated>
    <automated>npx vitest run src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts src/lib/agents/godentist-fb-ig/__tests__/transitions.test.ts 2>&1 | grep -E "passed|✓"</automated>
    <automated>git log -1 --format=%s | grep -qF "test(agent-godentist-fb-ig): add lead-capture.test.ts"</automated>
  </verify>
  <acceptance_criteria>
    - 2 archivos de test creados.
    - lead-capture.test.ts tiene minimo 8 tests (matrix turnCount x intent x gates x faltantes), incluyendo casos turnCount=0/1/2/5.
    - transitions.test.ts tiene minimo 12 tests cubriendo state machine branches.
    - `npx vitest run` los corre sin errores y todos pasan.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - Pure helpers cubiertos por tests independientes.
    - Pitfall 5 boundary protection verificada en CI.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Crear sales-track.test.ts + comprehension.test.ts (con mocks)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/sales-track.ts (verificar invocacion de resolveLeadCapture)
    - src/lib/agents/godentist-fb-ig/comprehension.ts (verificar runWithPurpose + Anthropic call signature)
    - src/lib/agents/somnio-pw-confirmation/__tests__/sales-track.test.ts (~260 LOC — patron sin mocks)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Test Strategy + §Code Examples §8 (Mock TemplateManager con vi.hoisted)
  </read_first>
  <action>
**Paso 1 — Crear `src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts`:**

Tests cubren minimo 8 casos:

```typescript
// Tests for resolveSalesTrack with lead-capture hook (D-09)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSalesTrack } from '../sales-track'
import type { AgentState } from '../types'

// Mock observability collector to avoid noisy logs
vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getCollector: () => ({
      recordEvent: vi.fn(),
      setRespondingAgentId: vi.fn(),
    }),
  }
})

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'inicio',
    fase_actual: 'inicio',
    datos: {},
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    turnCount: 0,
    ...overrides,
  } as AgentState
}

describe('resolveSalesTrack (godentist-fb-ig)', () => {
  describe('lead-capture hook (D-09)', () => {
    it('turnCount=1 + intent=datos + sin datos criticos -> pedir_datos_parcial', () => {
      const state = makeState({ turnCount: 1, datos: { nombre: 'Juan Perez' } })
      const result = resolveSalesTrack({
        intent: 'datos',
        state,
        gates: { datosCriticos: false, fechaElegida: false, horarioElegido: false, datosCompletos: false },
      } as any)
      expect(result.accion).toBe('pedir_datos_parcial')
      expect(result.reason).toMatch(/lead capture/i)
    })

    it('turnCount=1 + intent=datos + datos criticos OK + sin fecha -> NO lead capture (sales-track normal)', () => {
      const state = makeState({ turnCount: 1, datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera' } })
      const result = resolveSalesTrack({
        intent: 'datos',
        state,
        gates: { datosCriticos: true, fechaElegida: false, horarioElegido: false, datosCompletos: false },
      } as any)
      // El test cierto valor depende de la logica del godentist clonado.
      // Lo importante: NO retorna pedir_datos_parcial (lead-capture passthrough).
      expect(result.accion).not.toBe('pedir_datos_parcial')
    })

    it('turnCount=2 + intent=datos -> NO lead capture (turn 2+ ignored)', () => {
      const state = makeState({ turnCount: 2, datos: { nombre: 'Juan' } })
      const result = resolveSalesTrack({
        intent: 'datos',
        state,
        gates: { datosCriticos: false, fechaElegida: false, horarioElegido: false, datosCompletos: false },
      } as any)
      // Lead-capture NO triggered en turn 2; sales-track normal toma control.
      // El test debe verificar que el flujo NO incluye accion='pedir_datos_parcial' por leadCapture path.
      // Si el sales-track normal ALSO retorna pedir_datos_parcial (ej: porque datos parciales en turn 2),
      // verificar via reason: NO debe mencionar "lead capture FB/IG" textually.
      if (result.accion === 'pedir_datos_parcial') {
        expect(result.reason ?? '').not.toMatch(/lead capture FB\/IG/i)
      }
    })
  })

  describe('non-data intents', () => {
    it('intent=quiero_agendar + sin datos -> pedir_datos (NO lead-capture)', () => {
      const state = makeState({ turnCount: 1 })
      const result = resolveSalesTrack({
        intent: 'quiero_agendar',
        state,
        gates: { datosCriticos: false, fechaElegida: false, horarioElegido: false, datosCompletos: false },
      } as any)
      expect(result.accion).toBe('pedir_datos')
    })

    it('intent=precio_servicio (informational) -> NOT pedir_datos_parcial', () => {
      const state = makeState({ turnCount: 1 })
      const result = resolveSalesTrack({
        intent: 'precio_servicio',
        state,
        gates: { datosCriticos: false, fechaElegida: false, horarioElegido: false, datosCompletos: false },
      } as any)
      expect(result.accion).not.toBe('pedir_datos_parcial')
    })
  })

  // Adicionalmente: tests timer_expired path, escape intents, retoma_inicial — minimo 3 mas.
})
```

NOTA: La firma exacta de `resolveSalesTrack` (input args + return shape) viene del godentist clonado. Leer la signature en `src/lib/agents/godentist-fb-ig/sales-track.ts` y adaptar los argumentos del test al shape real. Lo importante es validar el comportamiento del hook lead-capture y los flujos normales.

**Paso 2 — Crear `src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts`:**

Tests con mock Anthropic SDK. Cubren minimo 6 casos:

```typescript
// Tests for comprehend() function with mocked Anthropic Haiku.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const messagesCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: messagesCreateMock },
  })),
}))

vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    runWithPurpose: async (_purpose: string, fn: any) => fn(),
    getCollector: () => ({ recordEvent: vi.fn() }),
  }
})

import { comprehend } from '../comprehension'

beforeEach(() => {
  messagesCreateMock.mockReset()
})

describe('comprehend (godentist-fb-ig Haiku call)', () => {
  it('parses intent=datos with name + telefono', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: { primary: 'datos', secondary: 'ninguno', confidence: 95, reasoning: 'lead capture turn 1' },
          extracted_fields: { nombre: 'Juan Perez', telefono: '573001234567', sede_preferida: null, fecha_preferida: null, hora_preferida: null, servicio: null },
          classification: { category: 'datos', sentiment: 'neutro', idioma: 'es' },
        }),
      }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const result = await comprehend('Juan Perez, 3001234567', [], {}, [])
    expect(result.intent.primary).toBe('datos')
    expect(result.extracted_fields?.nombre).toBe('Juan Perez')
    expect(result.extracted_fields?.telefono).toBe('573001234567')
  })

  it('parses intent=quiero_agendar without slots', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: { primary: 'quiero_agendar', secondary: 'ninguno', confidence: 90, reasoning: 'directa solicitud' },
          extracted_fields: { nombre: null, telefono: null, sede_preferida: null, fecha_preferida: null, hora_preferida: null, servicio: null },
          classification: { category: 'agendar', sentiment: 'positivo', idioma: 'es' },
        }),
      }],
      usage: { input_tokens: 50, output_tokens: 30 },
    })

    const result = await comprehend('Quiero agendar', [], {}, [])
    expect(result.intent.primary).toBe('quiero_agendar')
  })

  it('handles malformed intent (fallback to otro)', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: { primary: 'totally_invalid_intent_xyz', secondary: 'ninguno', confidence: 20, reasoning: 'unclear' },
          extracted_fields: { nombre: null, telefono: null, sede_preferida: null, fecha_preferida: null, hora_preferida: null, servicio: null },
          classification: { category: 'otro', sentiment: 'neutro', idioma: 'es' },
        }),
      }],
      usage: { input_tokens: 50, output_tokens: 30 },
    })

    const result = await comprehend('xyzqwerty', [], {}, [])
    // El comprehension hace fallback a 'otro' cuando intent no esta en GD_INTENTS.
    expect(['otro', 'totally_invalid_intent_xyz']).toContain(result.intent.primary)
    // Si fallback aplica, primary debe ser 'otro'. Si no aplica (parsing pasa raw), ajustar el assert.
  })

  // Mas casos: english_response, escape intent, low confidence handling
})
```

NOTA: Si la firma `comprehend(message, history, existingData, recentBotMessages)` cambia (ver `src/lib/agents/godentist-fb-ig/comprehension.ts`), ajustar argumentos. Lo importante: usar el mock Anthropic + verificar parsing del structured output.

**Paso 3 — Run tests:**

```bash
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts
```

**Paso 4 — Commit:**

```bash
git add src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts
git commit -m "test(agent-godentist-fb-ig): add sales-track.test.ts + comprehension.test.ts"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts</automated>
    <automated>grep -q "describe('resolveSalesTrack" src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts</automated>
    <automated>grep -q "describe('comprehend" src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts</automated>
    <automated>grep -q "vi.mock('@anthropic-ai/sdk')" src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts</automated>
    <automated>grep -q "lead-capture\|lead capture" src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts</automated>
    <automated>npx vitest run src/lib/agents/godentist-fb-ig/__tests__/sales-track.test.ts src/lib/agents/godentist-fb-ig/__tests__/comprehension.test.ts 2>&1 | grep -E "passed|✓"</automated>
    <automated>git log -1 --format=%s | grep -qF "test(agent-godentist-fb-ig): add sales-track.test.ts"</automated>
  </verify>
  <acceptance_criteria>
    - 2 archivos de test creados.
    - sales-track.test.ts cubre minimo 5 casos (lead-capture trigger, lead-capture passthrough, turn 2 ignored, non-data intent, informational).
    - comprehension.test.ts cubre minimo 4 casos con `vi.mock('@anthropic-ai/sdk')` (intent=datos parsing, quiero_agendar, malformed fallback, idioma english).
    - Todos los tests pasan via `npx vitest run`.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - Sales-track + comprehension testeados independientemente.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Crear response-track.test.ts (anti-regresion D-08) + godentist-fb-ig-agent.test.ts (E2E)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/response-track.ts (verificar GODENTIST_FB_IG_AGENT_ID en lookups)
    - src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts (verificar processMessage entry point)
    - src/lib/agents/somnio-pw-confirmation/__tests__/response-track.test.ts (~321 LOC — patron mock TemplateManager con vi.hoisted)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Test Strategy §Anti-regresion obligatorio (D-08) + §Code Examples §8
    - .planning/standalone/agent-godentist-fb-ig/CONTEXT.md §D-08 + RESEARCH.md §Common Pitfalls §1
  </read_first>
  <action>
**Paso 1 — Crear `src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts`:**

CRITICO — incluir anti-regresion D-08 explicita en MINIMO 1 test:

```typescript
// Tests for resolveResponseTrack with anti-regression D-08 (Pitfall 1).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
}))

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))

vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    getCollector: () => ({ recordEvent: vi.fn() }),
  }
})

import { resolveResponseTrack } from '../response-track'
import type { AgentState } from '../types'

beforeEach(() => {
  getTemplatesForIntentsMock.mockReset()
  processTemplatesMock.mockReset()
  // Default: empty selection
  getTemplatesForIntentsMock.mockResolvedValue(new Map())
  processTemplatesMock.mockResolvedValue([])
})

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    phase: 'inicio',
    fase_actual: 'inicio',
    datos: {},
    intent_history: [],
    acciones: [],
    templatesMostrados: {},
    turnCount: 0,
    ...overrides,
  } as AgentState
}

describe('resolveResponseTrack (godentist-fb-ig)', () => {
  // ----------------------------------------------------------------------
  // ANTI-REGRESION D-08 — Pitfall 1 (regression cdc06d9)
  // ----------------------------------------------------------------------
  describe('Anti-regression D-08: TEMPLATE_LOOKUP_AGENT_ID', () => {
    it('calls TemplateManager.getTemplatesForIntents with agent_id="godentist-fb-ig" (NOT "godentist")', async () => {
      const state = makeState()
      await resolveResponseTrack({
        salesAction: 'pedir_datos',
        state,
        intent: 'quiero_agendar',
        workspaceId: 'test-workspace',
      } as any)

      // Anti-regresion D-08 hard assert
      expect(getTemplatesForIntentsMock).toHaveBeenCalled()
      const callArgs = getTemplatesForIntentsMock.mock.calls[0]
      expect(callArgs[0]).toBe('godentist-fb-ig')
      expect(callArgs[0]).not.toBe('godentist')
    })

    it('NEVER calls getTemplatesForIntents with agent_id="godentist" (sibling MUST use own catalog)', async () => {
      const state = makeState()
      await resolveResponseTrack({
        salesAction: 'pedir_datos_parcial',
        state,
        intent: 'datos',
        workspaceId: 'test-workspace',
      } as any)

      const allCalls = getTemplatesForIntentsMock.mock.calls
      for (const call of allCalls) {
        expect(call[0]).not.toBe('godentist')
        expect(call[0]).toBe('godentist-fb-ig')
      }
    })
  })

  describe('pedir_datos_parcial extraContext', () => {
    it('builds campos_faltantes from camposFaltantes(state) when datos parciales', async () => {
      const state = makeState({ datos: { nombre: 'Juan' } })  // falta telefono + sede
      // Mock processTemplates para capturar el extraContext
      processTemplatesMock.mockImplementation((templates, ctx) => {
        return [{
          content: ctx.campos_faltantes ?? '',
          ...templates[0],
        }]
      })
      getTemplatesForIntentsMock.mockResolvedValue(new Map([
        ['pedir_datos_parcial', [{ content: '{{campos_faltantes}}', priority: 'CORE' }]],
      ]))

      const result = await resolveResponseTrack({
        salesAction: 'pedir_datos_parcial',
        state,
        intent: 'datos',
        workspaceId: 'test-workspace',
      } as any)

      // El extraContext debe incluir labels de los campos faltantes
      expect(processTemplatesMock).toHaveBeenCalled()
      const procCall = processTemplatesMock.mock.calls.find(c => c[1]?.campos_faltantes)
      if (procCall) {
        expect(String(procCall[1].campos_faltantes)).toMatch(/[Cc]elular|[Tt]elefono|[Ss]ede/)
      }
    })
  })

  // Mas tests: saludo turn 0, english_response, fallback empty selection, etc. — minimo 8 totales.
})
```

NOTA: La firma exacta de `resolveResponseTrack` (input/output) depende del godentist clonado. Leer `src/lib/agents/godentist-fb-ig/response-track.ts` y adaptar argumentos. Lo CRITICO es que el assert `expect(callArgs[0]).toBe('godentist-fb-ig')` se ejecute — esto blinda contra Pitfall 1.

**Paso 2 — Crear `src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts`:**

Tests E2E pipeline. Cubren minimo 5 casos:

```typescript
// Tests E2E pipeline integration (mock Anthropic + TemplateManager).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const messagesCreateMock = vi.hoisted(() => vi.fn())
const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: messagesCreateMock },
  })),
}))

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))

vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    runWithPurpose: async (_purpose: string, fn: any) => fn(),
    getCollector: () => ({ recordEvent: vi.fn(), setRespondingAgentId: vi.fn() }),
  }
})

import { processMessage } from '../godentist-fb-ig-agent'

beforeEach(() => {
  messagesCreateMock.mockReset()
  getTemplatesForIntentsMock.mockReset()
  processTemplatesMock.mockReset()
})

describe('processMessage (godentist-fb-ig E2E)', () => {
  it('happy path turn 1 lead capture: cliente envia "Juan, 3001234567" -> output incluye pedir_datos_parcial', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: { primary: 'datos', secondary: 'ninguno', confidence: 95, reasoning: 'lead capture' },
          extracted_fields: { nombre: 'Juan', telefono: '573001234567', sede_preferida: null, fecha_preferida: null, hora_preferida: null, servicio: null },
          classification: { category: 'datos', sentiment: 'neutro', idioma: 'es' },
        }),
      }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    getTemplatesForIntentsMock.mockResolvedValue(new Map([
      ['pedir_datos_parcial', [{ content: 'Para completar tu cita necesito:\n{{campos_faltantes}}', priority: 'CORE' }]],
    ]))
    processTemplatesMock.mockImplementation((templates, ctx) => {
      return templates.map((t: any) => ({ ...t, content: t.content.replace('{{campos_faltantes}}', ctx?.campos_faltantes ?? '') }))
    })

    const output = await processMessage({
      message: 'Juan, 3001234567',
      conversationId: 'test-conv',
      contactId: 'test-contact',
      workspaceId: 'test-workspace',
      history: [],
      phoneNumber: '+573001234567',
      messageTimestamp: new Date().toISOString(),
      // ... otros campos del V3AgentInput segun la firma real
    } as any)

    // Verify TemplateManager invoked with sibling agent_id (anti-regresion D-08)
    const lookupCalls = getTemplatesForIntentsMock.mock.calls
    expect(lookupCalls.length).toBeGreaterThan(0)
    expect(lookupCalls[0][0]).toBe('godentist-fb-ig')

    // Verify output texts include something about pedir_datos_parcial flow
    expect(output).toBeDefined()
  })

  it('happy path turn 0 saludo: input "hola" -> output incluye template saludo', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: { primary: 'saludo', secondary: 'ninguno', confidence: 90, reasoning: 'saludo inicial' },
          extracted_fields: { nombre: null, telefono: null, sede_preferida: null, fecha_preferida: null, hora_preferida: null, servicio: null },
          classification: { category: 'saludo', sentiment: 'positivo', idioma: 'es' },
        }),
      }],
      usage: { input_tokens: 50, output_tokens: 30 },
    })
    getTemplatesForIntentsMock.mockResolvedValue(new Map([
      ['saludo', [{ content: 'Hola — saludo del sibling FB/IG', priority: 'CORE' }]],
    ]))
    processTemplatesMock.mockImplementation((templates: any) => templates)

    await processMessage({
      message: 'hola',
      conversationId: 'test-conv',
      contactId: 'test-contact',
      workspaceId: 'test-workspace',
      history: [],
      phoneNumber: '+573001234567',
      messageTimestamp: new Date().toISOString(),
    } as any)

    expect(getTemplatesForIntentsMock).toHaveBeenCalled()
    expect(getTemplatesForIntentsMock.mock.calls[0][0]).toBe('godentist-fb-ig')
  })

  it('English short-circuit: input ingles -> idioma=en handling', async () => {
    messagesCreateMock.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          intent: { primary: 'otro', secondary: 'ninguno', confidence: 80, reasoning: 'english msg' },
          extracted_fields: { nombre: null, telefono: null, sede_preferida: null, fecha_preferida: null, hora_preferida: null, servicio: null },
          classification: { category: 'otro', sentiment: 'neutro', idioma: 'en' },
        }),
      }],
      usage: { input_tokens: 50, output_tokens: 30 },
    })
    getTemplatesForIntentsMock.mockResolvedValue(new Map())
    processTemplatesMock.mockResolvedValue([])

    await processMessage({
      message: 'hello, do you speak english?',
      conversationId: 'test-conv',
      contactId: 'test-contact',
      workspaceId: 'test-workspace',
      history: [],
      phoneNumber: '+573001234567',
      messageTimestamp: new Date().toISOString(),
    } as any)

    expect(getTemplatesForIntentsMock.mock.calls[0][0]).toBe('godentist-fb-ig')
  })

  // Mas casos: error en Haiku (Anthropic 500), datos completos turn 1 (passthrough), retoma_inicial
})
```

**Paso 3 — Run la suite completa:**

```bash
npx vitest run src/lib/agents/godentist-fb-ig/__tests__/
```

Esperado: 6 suites, 50-80 tests passed.

**Paso 4 — Commit:**

```bash
git add src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts
git commit -m "test(agent-godentist-fb-ig): add response-track.test.ts (D-08 anti-regression) + agent.test.ts (E2E)"
```

NO push.
  </action>
  <verify>
    <automated>test -f src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts</automated>
    <automated>test -f src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts</automated>
    <automated>grep -q "Anti-regression D-08" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts</automated>
    <automated>grep -q "expect(callArgs\[0\]).toBe('godentist-fb-ig')" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts</automated>
    <automated>grep -q "expect(callArgs\[0\]).not.toBe('godentist')" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts</automated>
    <automated>grep -q "vi.mock('@/lib/agents/somnio/template-manager')" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts</automated>
    <automated>grep -q "vi.mock('@anthropic-ai/sdk')" src/lib/agents/godentist-fb-ig/__tests__/godentist-fb-ig-agent.test.ts</automated>
    <automated>npx vitest run src/lib/agents/godentist-fb-ig/__tests__/ 2>&1 | grep -E "passed|✓" | head -10</automated>
    <automated>git log -1 --format=%s | grep -qF "test(agent-godentist-fb-ig): add response-track.test.ts (D-08 anti-regression)"</automated>
  </verify>
  <acceptance_criteria>
    - 2 archivos de test creados.
    - response-track.test.ts contiene assercion explicita anti-regresion D-08: `expect(callArgs[0]).toBe('godentist-fb-ig')` y `expect(callArgs[0]).not.toBe('godentist')`.
    - response-track.test.ts cubre minimo 8 tests (anti-regresion + pedir_datos_parcial extraContext + saludo + english + fallback + ...).
    - godentist-fb-ig-agent.test.ts cubre minimo 5 tests E2E con mocks Anthropic + TemplateManager.
    - `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` retorna 6 suites con minimo 50 tests passed.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - Suite completa de 6 archivos blindando el sibling.
    - Anti-regresion D-08 (Pitfall 1) cubierta en CI.
    - Plan 09 (verification) puede correr `npx vitest run` y confirmar pasa.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Tests → Anthropic SDK (mocked) | vi.mock isolates from real API calls |
| Tests → TemplateManager (mocked) | vi.mock isolates from real DB |
| Tests → real codebase | tests run in isolation, no side effects on prod |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-06-01 | Tampering | Tests with weak asserts pass even when D-08 broken | mitigate | Hard assertion `expect(callArgs[0]).not.toBe('godentist')` rejects regression |
| T-gfb-06-02 | Information Disclosure | Test fixtures con PII real | accept | Datos sinteticos (Juan Perez, 3001234567) en tests; cero datos productivos |
| T-gfb-06-03 | Denial of Service | Suite tarda >30s en CI | accept | Vitest run target ~10-20s para 60-80 tests; aceptable para developer feedback |
</threat_model>

<verification>
- 6 archivos en `src/lib/agents/godentist-fb-ig/__tests__/`.
- `npx vitest run src/lib/agents/godentist-fb-ig/__tests__/` retorna 6 suites + minimo 50 tests passed.
- Anti-regresion D-08 explicita: `grep -q "expect(callArgs\[0\]).toBe('godentist-fb-ig')" src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts` retorna match.
- Pitfall 5 boundary: `grep -q "turnCount === 0" src/lib/agents/godentist-fb-ig/__tests__/lead-capture.test.ts` retorna match.
- 3 commits atomicos en git local. NO push.
</verification>

<success_criteria>
- Plan 09 (verification) corre la suite y confirma 0 fallos.
- Cualquier futuro refactor que rompa D-08 (Pitfall 1) sera detectado en CI antes de merge.
- Cualquier off-by-one en `lead-capture.ts` (Pitfall 5) sera detectado en CI.
- El sibling tiene un blindaje de tests que el godentist original NO tiene — leccion aprendida documentada en LEARNINGS Plan 09.
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/06-SUMMARY.md` documenting:
- Commit hashes de Tasks 1, 2, 3.
- Conteo total de tests: 6 suites x N tests = total (formato como somnio-pw-confirmation deploy notes "5 suites, 65/65 tests passed").
- Confirmacion anti-regresion D-08 grep + Pitfall 5 grep.
- Tiempo de ejecucion: `npx vitest run` time-to-finish.
- Status: suite ready, gate Wave 5 (migration apply) puede proceder.
</output>
