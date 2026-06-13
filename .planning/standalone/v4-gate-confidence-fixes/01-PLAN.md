---
phase: v4-gate-confidence-fixes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/crm-gate.ts
  - src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts
  - src/lib/agents/somnio-v4/comprehension.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
autonomous: true
requirements:
  - D-01
  - D-02
  - D-03

must_haves:
  truths:
    - "Fix #1: el caso Bucaramanga (category='pregunta', un solo campo shipping) NO prende el CRM gate"
    - "Fix #1: cuando datosCriticosJustCompleted=true el gate prende correctamente"
    - "Fix #2: agent_observability_events incluye secondary_confidence + secondary_confidence_reasoning en comprehension_completed y comprehension_completed_v4"
    - "Fix #3: RESPONSE_CONFIDENCE_THRESHOLD puede cambiarse por SQL UPDATE en platform_config sin deploy"
    - "Regla 6: default 0.70 preservado — comportamiento de v4 IDÉNTICO al pre-fix con la key ausente en platform_config"
    - "Regla 6: v3/godentist/recompra/pw-confirmation — cero archivos tocados, cero cambio de comportamiento"
    - "Regla 6: v4 sigue DORMANT en prod (no se activa ni se cambia routing)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/crm-gate.ts"
      provides: "crmGateFired con trigger (b) = datosCriticosJustCompleted; SHIPPING_FIELDS eliminado"
      contains: "datosCriticosJustCompleted"
    - path: "src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts"
      provides: "Tests actualizados para nueva firma de crmGateFired"
      contains: "datosCriticosJustCompleted"
    - path: "src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts"
      provides: "getResponseConfidenceThreshold() con cache 60s + fallback 0.70"
      exports: ["getResponseConfidenceThreshold", "__clearResponseConfidenceThresholdCache"]
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "RESPONSE_CONFIDENCE_THRESHOLD leído via await al inicio de runRagSubLoop"
      contains: "getResponseConfidenceThreshold"
  key_links:
    - from: "src/lib/agents/somnio-v4/crm-gate.ts"
      to: "state.ts:datosCriticosJustCompleted"
      via: "args.changes.datosCriticosJustCompleted pasado desde runCrmGate"
      pattern: "datosCriticosJustCompleted: args\\.changes\\.datosCriticosJustCompleted"
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "sub-loop/response-confidence-threshold.ts"
      via: "await getResponseConfidenceThreshold() al inicio de runRagSubLoop"
      pattern: "await getResponseConfidenceThreshold"
---

<objective>
Three additive fixes to somnio-sales-v4 discovered via the v4-observability-completeness
standalone. All fixes are zero-behavior-change for existing agents (Regla 6). v4 remains
DORMANT in prod throughout.

Purpose:
  Fix #1 eliminates a false-positive CRM gate trigger that crashed a turn when a customer
  asked about delivery time to Bucaramanga (ciudad extracted, gate fired, CRM sub-loop crashed).
  Fix #2 adds secondary_confidence to two observability event payloads (pure logging, no logic).
  Fix #3 makes RESPONSE_CONFIDENCE_THRESHOLD tunable by SQL without deploy.

Output:
  - crm-gate.ts: SHIPPING_FIELDS deleted, crmGateFired trigger (b) replaced
  - comprehension.ts + somnio-v4-agent.ts: 3-4 new fields in two event payloads
  - sub-loop/response-confidence-threshold.ts: new platform_config lookup module
  - sub-loop/index.ts: module-level const removed, async lookup hoisted in runRagSubLoop

No schema migration needed — platform_config is key/value jsonb; key absence falls back to 0.70.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-gate-confidence-fixes/CONTEXT.md
@.planning/standalone/v4-gate-confidence-fixes/RESEARCH.md

<!-- Regla 6 invariant: v4 is DORMANT. All changes must be additive.
     Default 0.70 for Fix #3 preserves current behavior exactly.
     v3/godentist/recompra/pw-confirmation: ZERO files touched. -->

<!-- No migration needed: platform_config is key/value jsonb.
     The key somnio_v4_response_confidence_threshold simply falls back to 0.70 when absent. -->
</context>

<interfaces>
<!-- Key interfaces the executor needs. Verified against live source. -->

From src/lib/agents/somnio-v4/crm-gate.ts (CURRENT — before fix):
```typescript
// Lines 69-97 — CURRENT state to be changed
const SHIPPING_FIELDS: ReadonlySet<string> = new Set([
  'direccion', 'ciudad', 'departamento', 'barrio', 'correo',
])

export function crmGateFired(args: {
  accion?: string | null
  newFields: string[]
  category: string
}): boolean {
  const { accion, newFields, category } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true
  if (newFields.some((f) => SHIPPING_FIELDS.has(f))) return true  // ← trigger (b) to REPLACE
  if (category === 'datos') return true
  return false
}

// Call site inside runCrmGate (lines 330-334):
if (!crmGateFired({
  accion: args.accion ?? null,
  newFields: args.changes.newFields,
  category: args.category,
}))
```

From src/lib/agents/somnio-v4/threshold.ts (PATTERN to clone for Fix #3):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_THRESHOLD = 0.70
const CACHE_TTL_MS = 60_000

let cachedAt = 0
let cachedValue = DEFAULT_THRESHOLD

export async function getLowConfidenceThreshold(): Promise<number> {
  const now = Date.now()
  if (now - cachedAt < CACHE_TTL_MS) return cachedValue
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', 'somnio_v4_low_confidence_threshold')
      .maybeSingle()
    if (error || !data) { cachedValue = DEFAULT_THRESHOLD }
    else {
      const raw = data.value as unknown
      const v = typeof raw === 'number' ? raw : Number(raw)
      cachedValue = Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_THRESHOLD
    }
    cachedAt = now
    return cachedValue
  } catch {
    cachedValue = DEFAULT_THRESHOLD
    cachedAt = now
    return cachedValue
  }
}

export function __clearThresholdCache(): void {
  cachedAt = 0
  cachedValue = DEFAULT_THRESHOLD
}
```

From src/lib/agents/somnio-v4/sub-loop/index.ts:
```typescript
// Line 48 (module level — to REMOVE):
const RESPONSE_CONFIDENCE_THRESHOLD = 0.70

// Line 271 — runRagSubLoop is async:
async function runRagSubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  const t0 = performance.now()
  // CALL 1 — Tooling ...   ← hoist threshold lookup BEFORE this comment

// Line 420 (inside runRagSubLoop — stays syntactically unchanged):
  threshold: RESPONSE_CONFIDENCE_THRESHOLD,

// Line 447 (inside runRagSubLoop — stays syntactically unchanged):
  if (generation.responseConfidence < RESPONSE_CONFIDENCE_THRESHOLD) {
```

From src/lib/agents/somnio-v4/comprehension.ts (current emit, lines 227-242):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
  agent: 'somnio-sales-v4',
  intent: analysis.intent.primary,
  secondary: analysis.intent.secondary,        // already present
  confidence: analysis.intent.confidence,
  intent_confidence: analysis.intent.intent_confidence,
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
  threshold: null,
  scaledToSubLoop: null,
  category: analysis.classification.category,
  sentiment: analysis.classification.sentiment,
  fieldsExtracted: [...],
  tokensUsed,
  // ↑ ADD AFTER tokensUsed:
  // secondary_confidence: analysis.intent.secondary_confidence ?? null,
  // secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
  // secondary_query: analysis.intent.secondary_query ?? null,
})
```

From src/lib/agents/somnio-v4/somnio-v4-agent.ts (current emit, lines 435-446):
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed_v4', {
  agent: SOMNIO_V4_AGENT_ID,
  sessionId: input.sessionId ?? null,
  intent: analysis.intent.primary,
  intent_confidence: analysis.intent.intent_confidence,
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
  threshold,
  scaledToSubLoop: anyLowSlot,
  earlyReason: earlyReason ?? null,
  tokensUsed,
  restart_iteration: restartIteration,
  // ↑ ADD AFTER restart_iteration:
  // secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : null,
  // secondary_confidence: analysis.intent.secondary_confidence ?? null,
  // secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
  // secondary_query: analysis.intent.secondary_query ?? null,
})
```

Field types (from comprehension-schema.ts, all verified):
  - secondary_confidence: z.number().min(0).max(1).nullable()   (line 61)
  - secondary_confidence_reasoning: z.string().nullable()        (line 67)
  - secondary_query: z.string().nullable()                       (line 70)
  - secondary (label): string (intent.secondary)                 (line 31)
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix #2 — Agregar secondary_confidence a dos payloads de observabilidad</name>
  <read_first>
    src/lib/agents/somnio-v4/comprehension.ts (lines 220-250 — el bloque del recordEvent completo)
    src/lib/agents/somnio-v4/somnio-v4-agent.ts (lines 430-450 — el bloque del recordEvent completo)
    src/lib/agents/somnio-v4/comprehension-schema.ts (lines 55-75 — tipos de secondary_confidence)
  </read_first>
  <files>
    src/lib/agents/somnio-v4/comprehension.ts,
    src/lib/agents/somnio-v4/somnio-v4-agent.ts
  </files>
  <behavior>
    - comprehension_completed payload ya tiene secondary (label) pero le faltan secondary_confidence, secondary_confidence_reasoning, secondary_query
    - comprehension_completed_v4 payload NO tiene ningún campo del secondary intent — le faltan secondary (null cuando 'ninguno'), secondary_confidence, secondary_confidence_reasoning, secondary_query
    - Ambas adiciones son puramente aditivas: cero cambio de lógica, solo nuevos campos en el payload del recordEvent existente
  </behavior>
  <action>
CHANGE 1 — comprehension.ts (~line 239, después de `tokensUsed`):

Localizar el bloque `getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {`
(aprox. línea 227). Justo después de la línea `tokensUsed,` agregar estas tres líneas
(mantener el mismo nivel de indentación que las propiedades existentes):

```typescript
      secondary_confidence: analysis.intent.secondary_confidence ?? null,
      secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
      secondary_query: analysis.intent.secondary_query ?? null,
```

CHANGE 2 — somnio-v4-agent.ts (~line 443, después de `restart_iteration`):

Localizar el bloque `getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed_v4', {`
(aprox. línea 435). Justo después de la línea `restart_iteration: restartIteration,` agregar estas cuatro líneas:

```typescript
      secondary: analysis.intent.secondary !== 'ninguno' ? analysis.intent.secondary : null,
      secondary_confidence: analysis.intent.secondary_confidence ?? null,
      secondary_confidence_reasoning: analysis.intent.secondary_confidence_reasoning ?? null,
      secondary_query: analysis.intent.secondary_query ?? null,
```

RATIONALE: La diferencia entre los dos sitios es intencional:
- comprehension.ts ya loguea `secondary` (label) verbatim incluyendo 'ninguno' — no cambiarlo
- somnio-v4-agent.ts no logueaba secondary en absoluto — agregar como null cuando es 'ninguno' para que IS NOT NULL filtre turnos con secondary real (D-02 / RESEARCH Open Question 2)

NO cambiar ninguna lógica ni importación existente. Solo agregar campos al objeto literal del recordEvent.
  </action>
  <verify>
    <automated>
      # Verificar campos agregados en comprehension.ts
      grep -n "secondary_confidence" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/comprehension.ts

      # Verificar campos agregados en somnio-v4-agent.ts  
      grep -n "secondary_confidence\|secondary_query" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts

      # TypeScript clean
      npx tsc --noEmit 2>&1 | head -20

      # Suite v4 verde
      npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose 2>&1 | tail -20
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "secondary_confidence" src/lib/agents/somnio-v4/comprehension.ts` retorna ≥ 1
    - `grep -c "secondary_confidence" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna ≥ 1
    - `grep -c "secondary_query" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna ≥ 1
    - `grep -n "secondary: analysis.intent.secondary !== 'ninguno'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` retorna match
    - `npx tsc --noEmit` sale con código 0
    - `npx vitest run src/lib/agents/somnio-v4/` verde (todos los tests pasan)
    - NO hay nuevas importaciones en ninguno de los dos archivos (los campos vienen de `analysis.intent` que ya estaba en scope)
  </acceptance_criteria>
  <done>
    Los eventos comprehension_completed y comprehension_completed_v4 incluyen secondary_confidence,
    secondary_confidence_reasoning y secondary_query. tsc=0, suite v4 verde.
    Commit: `feat(somnio-v4): [D-02] agregar secondary_confidence a eventos de observabilidad comprehension`
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix #3 — Crear response-confidence-threshold.ts y cablear en sub-loop</name>
  <read_first>
    src/lib/agents/somnio-v4/threshold.ts (patrón completo a clonar — leer entero)
    src/lib/agents/somnio-v4/sub-loop/index.ts (líneas 44-55 para el const, líneas 265-290 para inicio de runRagSubLoop, líneas 415-425 para sitio de uso en emit, líneas 440-455 para sitio de uso en check)
  </read_first>
  <files>
    src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts,
    src/lib/agents/somnio-v4/sub-loop/index.ts
  </files>
  <behavior>
    - Nuevo módulo response-confidence-threshold.ts exporta getResponseConfidenceThreshold() y __clearResponseConfidenceThresholdCache()
    - getResponseConfidenceThreshold() lee platform_config key 'somnio_v4_response_confidence_threshold', cache 60s, fallback 0.70 si key ausente / DB error / valor fuera de [0,1]
    - sub-loop/index.ts: la const RESPONSE_CONFIDENCE_THRESHOLD a nivel de módulo (línea 48) se elimina
    - sub-loop/index.ts: se importa getResponseConfidenceThreshold desde './response-confidence-threshold'
    - sub-loop/index.ts: al inicio de runRagSubLoop (ANTES de CALL 1 — Tooling), se añade: const RESPONSE_CONFIDENCE_THRESHOLD = await getResponseConfidenceThreshold()
    - Las dos referencias existentes (líneas 420 y 447) quedan SINTÁCTICAMENTE IDÉNTICAS
    - Con la key ausente en platform_config el threshold es 0.70 → comportamiento idéntico al hardcodeado (Regla 6)
  </behavior>
  <action>
STEP A — Crear src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts

Escribir el archivo con este contenido EXACTO (clonar threshold.ts, cambiar solo key, nombre de función, y comentario de cabecera):

```typescript
/**
 * Somnio Sales Agent v4 — Response Confidence Threshold Lookup
 *
 * Lee `platform_config.somnio_v4_response_confidence_threshold` (D-03
 * v4-gate-confidence-fixes: parametrizable por SQL sin deploy).
 * Cachea 60s para no martillar la DB en cada sub-loop call.
 * Fallback robusto a 0.70 si la key no existe, valor inválido, o DB error.
 *
 * Default 0.70 — preserva el comportamiento hardcodeado anterior (Regla 6).
 *
 * Anti-patterns:
 *  - NO leer sin cache (degrade si DB hiccups durante tráfico alto)
 *  - NO cambiar el default sin medir impacto en handoff rate
 *
 * Domain wrapper exception authorized — `platform_config` es tabla utilitaria sin
 * domain layer dedicado (mismo patrón que threshold.ts — RESEARCH Shared Patterns autoriza).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_THRESHOLD = 0.70  // D-03 — fallback; preserva comportamiento anterior (Regla 6)
const CACHE_TTL_MS = 60_000    // 60s — calibración puede ajustar via SQL UPDATE sin deploy

let cachedAt = 0
let cachedValue = DEFAULT_THRESHOLD

/**
 * Lee `platform_config.somnio_v4_response_confidence_threshold` con cache 60s.
 *
 * Returns:
 *  - número en [0..1] si la key existe y es válida
 *  - 0.70 (DEFAULT_THRESHOLD) si la key no existe, valor inválido, o DB error
 */
export async function getResponseConfidenceThreshold(): Promise<number> {
  const now = Date.now()
  if (now - cachedAt < CACHE_TTL_MS) return cachedValue

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', 'somnio_v4_response_confidence_threshold')
      .maybeSingle()

    if (error || !data) {
      cachedValue = DEFAULT_THRESHOLD
    } else {
      // platform_config.value es jsonb. Puede llegar como number directo o como string.
      const raw = data.value as unknown
      const v = typeof raw === 'number' ? raw : Number(raw)
      cachedValue = Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_THRESHOLD
    }
    cachedAt = now
    return cachedValue
  } catch {
    cachedValue = DEFAULT_THRESHOLD
    cachedAt = now
    return cachedValue
  }
}

/** Test helper — limpia cache. NO usar en runtime. */
export function __clearResponseConfidenceThresholdCache(): void {
  cachedAt = 0
  cachedValue = DEFAULT_THRESHOLD
}
```

STEP B — Modificar src/lib/agents/somnio-v4/sub-loop/index.ts

B1. Eliminar líneas 44-48 completas (el bloque de comentario + const):
```typescript
// ELIMINAR ESTE BLOQUE COMPLETO (líneas 44-48):
/**
 * Threshold post-generation: si responseConfidence < THRESHOLD → handoff (D-19).
 * Default 0.70. Plan 04+ podría leerlo de platform_config.somnio_v4_low_confidence_threshold.
 */
const RESPONSE_CONFIDENCE_THRESHOLD = 0.70
```

B2. Agregar import al bloque de imports del archivo (donde están los demás imports locales):
```typescript
import { getResponseConfidenceThreshold } from './response-confidence-threshold'
```

B3. Al inicio de runRagSubLoop (~línea 271 original), ANTES del comentario `// CALL 1 — Tooling`:

```typescript
async function runRagSubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
  const t0 = performance.now()

  // Fix D-03 (v4-gate-confidence-fixes): threshold desde platform_config (cache 60s).
  // Default 0.70 si key ausente — Regla 6, comportamiento idéntico al hardcodeado anterior.
  const RESPONSE_CONFIDENCE_THRESHOLD = await getResponseConfidenceThreshold()

  // CALL 1 — Tooling ...
```

Las líneas que usan RESPONSE_CONFIDENCE_THRESHOLD (aprox. 420 y 447 en el archivo original) quedan
INTACTAS — la local const shadowing la módulo-level const eliminada. No tocar esas líneas.

STEP C — Crear test para el nuevo módulo:
src/lib/agents/somnio-v4/sub-loop/__tests__/response-confidence-threshold.test.ts

```typescript
/**
 * Tests de getResponseConfidenceThreshold (v4-gate-confidence-fixes D-03).
 * Patrón idéntico a threshold.ts — cache 60s + fallback 0.70.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getResponseConfidenceThreshold,
  __clearResponseConfidenceThresholdCache,
} from '../response-confidence-threshold'

// Mock createAdminClient (same pattern as other threshold tests)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
import { createAdminClient } from '@/lib/supabase/admin'

function mockSupabase(value: unknown | null, error: unknown | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: value !== null ? { value } : null, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from })
}

describe('getResponseConfidenceThreshold', () => {
  beforeEach(() => {
    __clearResponseConfidenceThresholdCache()
    vi.clearAllMocks()
  })

  it('retorna 0.70 (default) cuando la key no existe en platform_config', async () => {
    mockSupabase(null)
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.70)
  })

  it('retorna el valor de platform_config cuando es válido', async () => {
    mockSupabase(0.55)
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.55)
  })

  it('retorna 0.70 cuando el valor es mayor que 1 (fuera de rango)', async () => {
    mockSupabase(1.5)
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.70)
  })

  it('retorna 0.70 cuando hay error de DB', async () => {
    mockSupabase(null, new Error('DB error'))
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.70)
  })

  it('retorna cached value en segunda llamada sin hit a DB', async () => {
    mockSupabase(0.60)
    await getResponseConfidenceThreshold()  // primera — hit DB
    const result = await getResponseConfidenceThreshold()  // segunda — cache
    expect(result).toBe(0.60)
    expect(createAdminClient).toHaveBeenCalledTimes(1)  // DB solo 1 vez
  })
})
```
  </action>
  <verify>
    <automated>
      # Archivo nuevo existe
      ls /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts

      # Import añadido en index.ts
      grep -n "getResponseConfidenceThreshold" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts

      # Const módulo-level eliminado, local const existe dentro de runRagSubLoop
      grep -n "^const RESPONSE_CONFIDENCE_THRESHOLD" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/sub-loop/index.ts

      # TypeScript clean
      npx tsc --noEmit 2>&1 | head -20

      # Tests del nuevo módulo
      npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/response-confidence-threshold.test.ts --reporter=verbose

      # Suite v4 completa verde
      npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose 2>&1 | tail -20
    </automated>
  </verify>
  <acceptance_criteria>
    - `ls src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` existe
    - `grep -c "getResponseConfidenceThreshold" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna ≥ 2 (import + uso en runRagSubLoop)
    - `grep -c "^const RESPONSE_CONFIDENCE_THRESHOLD = 0.70" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna 0 (módulo-level const eliminado)
    - `grep -c "await getResponseConfidenceThreshold" src/lib/agents/somnio-v4/sub-loop/index.ts` retorna 1 (local await dentro de runRagSubLoop)
    - `grep -c "SHIPPING_FIELDS\|somnio_v4_low_confidence_threshold" src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` retorna 0 (no contaminación del módulo viejo)
    - `grep -c "somnio_v4_response_confidence_threshold" src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` retorna 1
    - `npx tsc --noEmit` sale con código 0
    - `npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/response-confidence-threshold.test.ts` — 5/5 tests verdes
    - `npx vitest run src/lib/agents/somnio-v4/` verde (suite completa sin regresiones)
  </acceptance_criteria>
  <done>
    response-confidence-threshold.ts creado, index.ts cableado, 5 tests verdes, tsc=0.
    La constante es ahora parametrizable por SQL sin deploy (platform_config key
    'somnio_v4_response_confidence_threshold'). Default 0.70 preserva comportamiento exacto.
    Commit: `feat(somnio-v4): [D-03] mover RESPONSE_CONFIDENCE_THRESHOLD a platform_config`
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Fix #1 — Reemplazar trigger (b) SHIPPING_FIELDS por datosCriticosJustCompleted en crmGateFired</name>
  <read_first>
    src/lib/agents/somnio-v4/crm-gate.ts (líneas 60-100: SHIPPING_FIELDS + crmGateFired; líneas 325-340: call site en runCrmGate)
    src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts (entero — los tests actuales usan la firma vieja con newFields)
  </read_first>
  <files>
    src/lib/agents/somnio-v4/crm-gate.ts,
    src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts
  </files>
  <behavior>
    - El caso Bucaramanga (category='pregunta', newFields=['ciudad'], datosCriticosJustCompleted=false) NO debe prender el gate
    - datosCriticosJustCompleted=true (todos los campos críticos recién completados) DEBE prender el gate — trigger (b) nuevo
    - accion∈CRM_GATE_ACTIONS → gate prende — trigger (a) sin cambio
    - category='datos' → gate prende — trigger (c) sin cambio
    - Los tests del predicate reflejan la nueva firma (sin newFields)
  </behavior>
  <action>
STEP A — Modificar src/lib/agents/somnio-v4/crm-gate.ts

A1. Eliminar el bloque SHIPPING_FIELDS completo (líneas 68-75):
```typescript
// ELIMINAR ESTAS 8 LÍNEAS:
/** Campos de envio que, recien capturados, disparan el gate (D-02). */
const SHIPPING_FIELDS: ReadonlySet<string> = new Set([
  'direccion',
  'ciudad',
  'departamento',
  'barrio',
  'correo',
])
```

A2. Reemplazar la función crmGateFired (líneas 87-97 aprox.) con:
```typescript
/**
 * Gate determinista (D-02 — v4-gate-confidence-fixes: trigger (b) reemplazado):
 *   (a) accion ∈ CRM_GATE_ACTIONS (confirmaciones de pedido), o
 *   (b) datosCriticosJustCompleted — TODOS los campos críticos recién completados, o
 *   (c) category === 'datos' (red anti-falso-negativo — si la extracción falló
 *       pero el cliente claramente mandó datos, el sub-loop grounded rescata).
 *
 * Filosofía D-03: (b) ahora dispara en el momento preciso de crear pedido en lugar
 * de en cualquier extracción incidental de un campo shipping (p.ej. ciudad en una
 * pregunta informacional → causaba crash AI_NoObjectGeneratedError).
 */
export function crmGateFired(args: {
  accion?: string | null
  category: string
  datosCriticosJustCompleted: boolean
}): boolean {
  const { accion, category, datosCriticosJustCompleted } = args
  if (accion && CRM_GATE_ACTIONS.has(accion)) return true             // (a) — sin cambio
  if (datosCriticosJustCompleted) return true                          // (b) — reemplazado
  if (category === 'datos') return true                                 // (c) — sin cambio
  return false
}
```

IMPORTANTE: actualizar también el comentario del bloque anterior (líneas 77-86) donde dice
"(b) newFields ∩ SHIPPING_FIELDS" para que diga "(b) datosCriticosJustCompleted". Reemplazar
el bloque de comentario + función juntos para consistencia.

A3. Actualizar el call site dentro de runCrmGate (líneas 330-334 aprox.):

ANTES:
```typescript
if (
  !crmGateFired({
    accion: args.accion ?? null,
    newFields: args.changes.newFields,
    category: args.category,
  })
)
```

DESPUÉS:
```typescript
if (
  !crmGateFired({
    accion: args.accion ?? null,
    category: args.category,
    datosCriticosJustCompleted: args.changes.datosCriticosJustCompleted,
  })
)
```

`args.changes.datosCriticosJustCompleted` ya está disponible porque `RunCrmGateArgs.changes`
es de tipo `StateChanges` que incluye `datosCriticosJustCompleted` (verificado: state.ts:201).
No hay cambio en RunCrmGateArgs — no necesita threadear ningún campo nuevo.

STEP B — Actualizar src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts

Reemplazar el contenido completo del archivo con los tests actualizados para la nueva firma.
El describe principal queda igual pero el grupo "por newFields (SHIPPING_FIELDS)" se reemplaza
por "por datosCriticosJustCompleted":

```typescript
/**
 * Tests del predicate del gate CRM (v4-gate-confidence-fixes D-01).
 *
 * Cubre los 3 comportamientos de `crmGateFired` tras Fix #1:
 *  - por accion (CRM_GATE_ACTIONS): mostrar_confirmacion/confirmar_orden -> true; pedir_datos -> false.
 *  - por datosCriticosJustCompleted: true -> true; false con category='venta' -> false.
 *  - por category: 'datos' -> true (red anti-falso-negativo).
 *  - caso Bucaramanga (regresión): city question con datosCriticosJustCompleted=false -> false.
 */
import { describe, it, expect } from 'vitest'
import { crmGateFired } from '../crm-gate'

describe('crmGateFired — gate D-01 (v4-gate-confidence-fixes)', () => {
  describe('por accion (CRM_GATE_ACTIONS)', () => {
    it('mostrar_confirmacion -> true', () => {
      expect(
        crmGateFired({ accion: 'mostrar_confirmacion', category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(true)
    })

    it('confirmar_orden -> true', () => {
      expect(
        crmGateFired({ accion: 'confirmar_orden', category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(true)
    })

    it('pedir_datos -> false (no es accion CRM-gate)', () => {
      expect(
        crmGateFired({ accion: 'pedir_datos', category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })
  })

  describe('por datosCriticosJustCompleted (trigger b — Fix #1)', () => {
    it('datosCriticosJustCompleted=true -> true (todos los campos críticos recién completados)', () => {
      expect(
        crmGateFired({ accion: null, category: 'venta', datosCriticosJustCompleted: true }),
      ).toBe(true)
    })

    it('datosCriticosJustCompleted=false + category venta -> false (caso Bucaramanga)', () => {
      expect(
        crmGateFired({ accion: null, category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })

    it('datosCriticosJustCompleted=false + category pregunta -> false (regresión caso Bucaramanga)', () => {
      // El turno que crasheó: ciudad extraída pero datos incompletos, category=pregunta
      expect(
        crmGateFired({ accion: null, category: 'pregunta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })
  })

  describe('por category (red anti-falso-negativo)', () => {
    it("category='datos' -> true", () => {
      expect(
        crmGateFired({ accion: null, category: 'datos', datosCriticosJustCompleted: false }),
      ).toBe(true)
    })

    it("category!='datos' + sin accion + datosCriticosJustCompleted=false -> false", () => {
      expect(
        crmGateFired({ accion: null, category: 'venta', datosCriticosJustCompleted: false }),
      ).toBe(false)
    })
  })
})
```
  </action>
  <verify>
    <automated>
      # SHIPPING_FIELDS eliminado
      grep -n "SHIPPING_FIELDS" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/crm-gate.ts

      # datosCriticosJustCompleted presente en firma y call site
      grep -n "datosCriticosJustCompleted" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/crm-gate.ts

      # Tests actualizados
      grep -n "datosCriticosJustCompleted\|SHIPPING_FIELDS" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts

      # Tests del predicate verde
      npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts --reporter=verbose

      # TypeScript clean
      npx tsc --noEmit 2>&1 | head -20

      # Suite v4 completa — regla 6 anti-regresión
      npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose 2>&1 | tail -30
    </automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "SHIPPING_FIELDS" src/lib/agents/somnio-v4/crm-gate.ts` retorna 0
    - `grep -c "datosCriticosJustCompleted" src/lib/agents/somnio-v4/crm-gate.ts` retorna ≥ 2 (firma + call site)
    - `grep -c "newFields" src/lib/agents/somnio-v4/crm-gate.ts` retorna 0 en el contexto de crmGateFired (puede quedar en otros contextos si existen)
    - `grep -c "Bucaramanga\|datosCriticosJustCompleted" src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts` retorna ≥ 2
    - `grep -c "SHIPPING_FIELDS" src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts` retorna 0
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts` — todos los tests verdes (≥ 7 it-blocks)
    - `npx tsc --noEmit` sale con código 0
    - `npx vitest run src/lib/agents/somnio-v4/` verde (suite completa, sin regresiones)
    - `grep -rn "SHIPPING_FIELDS" src/lib/agents/somnio-v4/` retorna 0 matches en archivos .ts no de test
  </acceptance_criteria>
  <done>
    crmGateFired trigger (b) reemplazado. SHIPPING_FIELDS eliminado. Tests actualizados (7 it-blocks),
    incluyendo el caso regresión Bucaramanga. tsc=0. Suite v4 verde.
    Commit: `feat(somnio-v4): [D-01] reemplazar trigger SHIPPING_FIELDS por datosCriticosJustCompleted en crmGateFired`
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Los 3 fixes fueron aplicados y commitados a main. El push a Vercel (Regla 1) debe hacerse
    antes de esta verificación: `git push origin main`.
    
    Nota: v4 sigue DORMANT. El push es seguro — no activa ningún comportamiento nuevo para
    usuarios finales. Los cambios solo afectan code paths de somnio-sales-v4 que no tienen
    tráfico productivo.
  </what-built>
  <how-to-verify>
    1. Confirmar que `git push origin main` terminó sin error y Vercel desplegó exitosamente.
    
    2. Ejecutar la suite de tests completa localmente:
       ```bash
       npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose
       ```
       Esperado: todos los tests verdes, incluyendo los nuevos de crm-gate y response-confidence-threshold.

    3. Verificar Fix #1 con grep de sanidad final:
       ```bash
       grep -c "SHIPPING_FIELDS" src/lib/agents/somnio-v4/crm-gate.ts
       # Esperado: 0
       grep -c "datosCriticosJustCompleted" src/lib/agents/somnio-v4/crm-gate.ts
       # Esperado: ≥ 2
       ```

    4. Verificar Fix #3 con grep:
       ```bash
       grep -c "^const RESPONSE_CONFIDENCE_THRESHOLD" src/lib/agents/somnio-v4/sub-loop/index.ts
       # Esperado: 0 (módulo-level const eliminado)
       grep -c "await getResponseConfidenceThreshold" src/lib/agents/somnio-v4/sub-loop/index.ts
       # Esperado: 1
       ```

    5. (Opcional) Verificar Fix #3 en platform_config: podés correr este SQL en Supabase
       para confirmar que el threshold es parametrizable:
       ```sql
       -- Verificar que la key no existe aún (fallback 0.70 activo):
       SELECT * FROM platform_config WHERE key = 'somnio_v4_response_confidence_threshold';
       -- Esperado: 0 rows (comportamiento idéntico al hardcodeado)
       ```

    6. Confirmar Regla 6: ningún archivo de v3/godentist/recompra/pw-confirmation fue modificado.
       ```bash
       git diff HEAD~3 --name-only | grep -v "somnio-v4\|v4-gate-confidence"
       # Esperado: 0 archivos fuera del scope somnio-v4
       ```
  </how-to-verify>
  <resume-signal>Escribir "aprobado" o describir cualquier falla encontrada.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| platform_config → sub-loop | Valor leído de DB y usado como threshold; validado [0..1] antes de uso |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v4gcf-01 | Tampering | platform_config.somnio_v4_response_confidence_threshold | accept | Tabla solo accesible por admin (service_role). Valor validado: Number.isFinite(v) && v >= 0 && v <= 1; fuera de rango → fallback 0.70 |
| T-v4gcf-02 | Denial of Service | getResponseConfidenceThreshold DB call | mitigate | Cache 60s evita martillar DB. Timeout del cliente Supabase existente. Fallback 0.70 en catch block — falla silenciosa, nunca bloquea el sub-loop |
| T-v4gcf-03 | Information Disclosure | secondary_confidence en agent_observability_events | accept | Datos de calibración interna (números de confianza del modelo, sin PII). Tabla observable solo por operadores autorizados del workspace |
</threat_model>

<verification>
Verificación final del standalone completo:

```bash
# 1. tsc clean (predictor de Vercel build)
npx tsc --noEmit
# Esperado: exit code 0

# 2. Suite somnio-v4 completa
npx vitest run src/lib/agents/somnio-v4/ --reporter=verbose
# Esperado: todos los tests verdes (incluyendo crm-gate.test.ts actualizado
#           y response-confidence-threshold.test.ts nuevo)

# 3. Regla 6 — cero archivos de otros agentes modificados
git diff --name-only HEAD~3 | grep -vE "somnio-v4|v4-gate-confidence"
# Esperado: 0 líneas (todos los archivos son del scope somnio-v4)

# 4. SHIPPING_FIELDS eliminado globalmente
grep -rn "SHIPPING_FIELDS" src/lib/agents/somnio-v4/
# Esperado: 0 matches

# 5. Fix #3 — módulo nivel const eliminado, async lookup presente
grep -c "^const RESPONSE_CONFIDENCE_THRESHOLD = 0.70" src/lib/agents/somnio-v4/sub-loop/index.ts
# Esperado: 0
grep -c "await getResponseConfidenceThreshold" src/lib/agents/somnio-v4/sub-loop/index.ts
# Esperado: 1
```
</verification>

<success_criteria>
- Fix #1: `crmGateFired` no tiene `newFields` ni `SHIPPING_FIELDS`; usa `datosCriticosJustCompleted` como trigger (b). El caso Bucaramanga (category='pregunta', sin datos críticos completos) retorna false del predicate.
- Fix #2: `comprehension_completed` incluye `secondary_confidence`, `secondary_confidence_reasoning`, `secondary_query`. `comprehension_completed_v4` incluye también `secondary` (null cuando 'ninguno').
- Fix #3: `src/lib/agents/somnio-v4/sub-loop/response-confidence-threshold.ts` existe, exporta `getResponseConfidenceThreshold()` y `__clearResponseConfidenceThresholdCache()`. `sub-loop/index.ts` no tiene `const RESPONSE_CONFIDENCE_THRESHOLD = 0.70` a nivel módulo; tiene `await getResponseConfidenceThreshold()` al inicio de `runRagSubLoop`.
- `npx tsc --noEmit` = exit code 0.
- `npx vitest run src/lib/agents/somnio-v4/` = todos los tests verdes.
- Cero archivos de v3/godentist/recompra/pw-confirmation modificados (Regla 6).
- v4 sigue DORMANT (sin cambio en routing_rules ni workspace_agent_config).
</success_criteria>

<output>
Después de completar y aprobar el checkpoint, crear:
`.planning/standalone/v4-gate-confidence-fixes/01-SUMMARY.md`

Con el formato estándar (@$HOME/.claude/get-shit-done/templates/summary.md):
- Fix #1: predicate change (archivos, líneas, comportamiento antes/después)
- Fix #2: campos nuevos en dos eventos (archivos, líneas)
- Fix #3: nuevo módulo + wiring (archivos, key platform_config, test count)
- Regla 6: confirmación de cero archivos externos modificados
- Deuda residual: crash try/catch (#1.b), zombie 70s, KB enrichment (diferidos confirmados)
</output>
