---
plan: 03
phase: somnio-sales-v4-runtime-wiring
wave: 2
depends_on: [02]
files_modified:
  - src/lib/agents/somnio-v4/engine-v4.ts
  - src/app/api/sandbox/process/route.ts
addresses_decisions: [D-1, D-13, D-14, D-19, D-20, D-21, D-22]
addresses_research_pitfalls: []
autonomous: true
estimated_tasks: 2
must_haves:
  truths:
    - "src/lib/agents/somnio-v4/engine-v4.ts existe — clon mecánico de somnio-v3/engine-v3.ts (D-19, D-21)"
    - "Mapeo SandboxState ↔ V4AgentInput interno a engine-v4.ts (D-19) — KB real Supabase (D-22), retomas simuladas (D-21)"
    - "DebugTurn extendido con campos opcionales subLoopReason, kbHits, nuncaDecirMatches, threshold (D-20)"
    - "src/app/api/sandbox/process/route.ts tiene branch agentId === 'somnio-sales-v4' que instancia SomnioV4Engine"
    - "Branch v4 es ADITIVO — branches v2/v3/recompra-v1/v1 default sin tocar (Regla 6)"
    - "SomnioV4Engine importa processMessage desde '@/lib/agents/somnio-v4' (no desde somnio-v3)"
    - "Cero edits a engine-v3.ts (Regla 6)"
    - "engine-v4.ts contiene literal 'gemini-2.5-flash-lite' en debugTurn.tokens.models (NO 'claude-haiku-4-5') — swap at clone time (B-2 fix; anticipa Plan 05 model swap)"
    - "Cero matches del literal 'claude-haiku-4-5' en src/lib/agents/somnio-v4/engine-v4.ts post-Plan 03 (B-2 fix — debugTurn metadata es display-only en sandbox, swap es seguro pre-Plan 05)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/engine-v4.ts"
      provides: "SomnioV4Engine sandbox wrapper paralelo a SomnioV3Engine"
      contains: "export class SomnioV4Engine"
    - path: "src/app/api/sandbox/process/route.ts"
      provides: "Branch v4 en /api/sandbox/process"
      contains: "agentId === 'somnio-sales-v4'"
  key_links:
    - from: "POST /api/sandbox/process body { agentId: 'somnio-sales-v4', ... }"
      to: "SomnioV4Engine.processMessage"
      via: "branch en route.ts"
      pattern: "if \\(agentId === 'somnio-sales-v4'\\)"
    - from: "SomnioV4Engine.processMessage"
      to: "somnio-v4 processMessage"
      via: "import { processMessage } from './somnio-v4-agent'"
      pattern: "from '\\./somnio-v4-agent'"
---

<objective>
Wave 2 — Crear el sandbox wrapper `engine-v4.ts` paralelo a `engine-v3.ts` y branch en `/api/sandbox/process` para enrutar `agentId === 'somnio-sales-v4'`.

Ahora mismo el sandbox NO puede testear v4 porque `route.ts` cae al else V1 cuando recibe `agentId === 'somnio-sales-v4'`. Plan 03 cierra ese gap.

**Mecánica D-13/D-19/D-21/D-22:**

1. **Crear `src/lib/agents/somnio-v4/engine-v4.ts`** clonando `src/lib/agents/somnio-v3/engine-v3.ts` (162 líneas, leer entero antes de tocar).
   - Substituciones literales:
     - `SomnioV3Engine` → `SomnioV4Engine`
     - `V3EngineInput` → `V4EngineInput`
     - `V3EngineOutput` → `V4EngineOutput`
     - `import { processMessage } from './somnio-v3-agent'` → `import { processMessage } from './somnio-v4-agent'`
     - `import type { ... } from './types'` queda igual (mismo path relativo dentro de somnio-v4/)
     - `[SomnioV3Engine]` log prefix → `[SomnioV4Engine]`
     - `'V3_ENGINE_ERROR'` error code → `'V4_ENGINE_ERROR'`
     - **`model: 'claude-haiku-4-5' as const` literal en debugTurn.tokens.models (línea 92 de engine-v3.ts) → `model: 'gemini-2.5-flash-lite' as const`** (B-2 fix — swap at clone time, NO TODO comment, NO mantener Haiku transitorio).
   - **Mapeo SandboxState ↔ V4AgentInput (D-19):**
     - V3 espera `intentsVistos: string[]`, `templatesEnviados: string[]`, `datosCapturados: Record<string,string>`, `packSeleccionado: PackSelection | null`, `accionesEjecutadas: AccionRegistrada[]`
     - V4 puede tener shape distinto (`AccionRegistrada[]` vs `string[]`, etc.) — leer `src/lib/agents/somnio-v4/types.ts` ANTES y mapear con cuidado. Si V4 input shape difiere de V3 → hacer transformación inline. Documentar en comentario.
     - **Mismo `_v3:` namespace en `datosCapturados`** — preservar literal (es como llaman al storage prefix; v4 lee mismas keys que v3 dejaba). NO cambiar a `_v4:`.
     - **KB real (D-22):** el sandbox NO mockea KB — usa la misma RPC `match_knowledge_base` contra Supabase prod (workspace Somnio). El engine wrapper no decide esto — el sub-loop tools dentro de somnio-v4 ya apuntan a Supabase real. El wrapper solo asegura que `workspaceId` se propaga.
     - **Retomas simuladas (D-21):** el agent processMessage de v4 acepta `systemEvent?: SystemEvent` — engine-v4.ts pasa `input.systemEvent` directamente al processMessage (mismo patrón v3). Sin cambios estructurales.
   - **DebugTurn extendido (D-20):** v4 expone más metadata útil en debug panel. Si V4AgentOutput contiene campos que v3 no tenía (ej: `subLoopReason`, `kbHits`, `nuncaDecirMatches`, `confidenceThreshold`), añadir esos campos OPCIONALES al `debugTurn` (sin crear tab nuevo en UI — la UI renderiza condicionalmente si campos existen). Ver `src/lib/sandbox/types.ts` para shape DebugTurn — si no soporta esos campos, hay que extenderlo (NO crear types nuevos, ampliar el existente con `?:`). Si V4AgentOutput no expone aún esos campos (Plan 06 podría cablearlos), por ahora dejar TODO comments y mapear lo que ya hay.

2. **Branch en `src/app/api/sandbox/process/route.ts`:**
   - Insertar branch `if (agentId === 'somnio-sales-v4') { ... }` **ANTES del bloque V1 default** y **DESPUÉS** del bloque `if (agentId === 'somnio-recompra-v1')` (línea 113-125).
   - Patrón EXACTO copiado del bloque v3 (líneas 97-108):
     ```typescript
     if (agentId === 'somnio-sales-v4') {
       const { SomnioV4Engine } = await import('@/lib/agents/somnio-v4/engine-v4')
       const v4Engine = new SomnioV4Engine()
       const v4Result = await v4Engine.processMessage({
         message,
         state,
         history: history ?? [],
         turnNumber: turnNumber ?? 1,
         workspaceId: workspaceId ?? 'sandbox-workspace',
         systemEvent,
       })
       return NextResponse.json(v4Result)
     }
     ```
   - **Dynamic import** (vs static import al top) para evitar cargar somnio-v4 en cold-start cuando no se necesita. v3 hace static import (línea 17), pero v4 prefiere dynamic — mantiene cold-start ligero del sandbox endpoint.
   - **NO tocar** branches v2 (línea 82), v3 (97), recompra (113) ni V1 default. Solo INSERTAR el bloque v4.
   - **NO importar `import '@/lib/agents/somnio-v4'` en top-level** (eso forzaría agentRegistry side-effect siempre; el dynamic import dentro del branch lo evita).

D-1: V4 engine SEPARADO de V3 engine. Cero shared helpers. Patrón consistent con D-13 del production runner.

**B-2 racional del swap at clone time (revision iter 1):**
- engine-v3.ts:92 contiene `model: 'claude-haiku-4-5' as const` SOLO en `debugTurn.tokens.models` — campo display-only para el debug panel del sandbox UI, no afecta runtime behavior.
- Si Plan 03 dejara el literal Haiku con un TODO comment, el grep guard de Plan 05 ("cero matches `claude-haiku-4-5` en somnio-v4/") fallaría — Plan 05 no incluye `engine-v4.ts` en files_modified.
- Solución: swap at clone time → `'gemini-2.5-flash-lite' as const`. Es el modelo que Plan 05 wirea para comprehension (donde se calcula `output.totalTokens` que termina en debugTurn). No-op para runtime, fix neto para grep guards.

Output: sandbox UI puede testear v4 con el mismo dropdown de selector. Plan 07 ejercita esta superficie con los 5 mensajes de overconfidence + sub-loop trigger.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@src/lib/agents/somnio-v3/engine-v3.ts
@src/lib/agents/somnio-v4/types.ts
@src/lib/agents/somnio-v4/somnio-v4-agent.ts
@src/lib/sandbox/types.ts
@src/app/api/sandbox/process/route.ts
</context>

<interfaces>
<!-- SomnioV3Engine — clone target -->
```typescript
// from src/lib/agents/somnio-v3/engine-v3.ts
export interface V3EngineInput {
  message: string
  state: SandboxState
  history: { role: 'user' | 'assistant'; content: string }[]
  turnNumber: number
  workspaceId: string
  systemEvent?: SystemEvent
}

export interface V3EngineOutput {
  success: boolean
  messages: string[]
  newState: SandboxState
  debugTurn: DebugTurn
  error?: { code: string; message: string }
  timerSignal?: unknown
}

export class SomnioV3Engine {
  async processMessage(input: V3EngineInput): Promise<V3EngineOutput>
}
```

<!-- engine-v3.ts:92 model literal (the ONLY occurrence — verified by grep) -->
```typescript
// from src/lib/agents/somnio-v3/engine-v3.ts:88-97
tokens: {
  turnNumber: input.turnNumber,
  tokensUsed: output.totalTokens,
  models: [{
    model: 'claude-haiku-4-5' as const,        // ← SWAP THIS at clone time → 'gemini-2.5-flash-lite' (B-2)
    inputTokens: Math.round(output.totalTokens * 0.7),
    outputTokens: Math.round(output.totalTokens * 0.3),
  }],
  timestamp,
},
```

<!-- somnio-v4 processMessage signature -->
```typescript
// from src/lib/agents/somnio-v4/index.ts
export { processMessage } from './somnio-v4-agent'
// (input: V4AgentInput) => Promise<V4AgentOutput>
```

<!-- Sandbox route branches (insertion point) -->
```typescript
// from src/app/api/sandbox/process/route.ts
if (agentId === 'somnio-sales-v2') { /* line 82 */ }
if (agentId === 'somnio-sales-v3') { /* line 97 */ }
if (agentId === 'somnio-recompra-v1') { /* line 113 */ }
// ⬇ INSERT v4 branch HERE (line ~126)
// V1 default at line 127+
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Crear engine-v4.ts clonando engine-v3.ts (D-19, D-21, D-22) — model literal swap at clone time (B-2)</name>
  <files>src/lib/agents/somnio-v4/engine-v4.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/engine-v3.ts (clone source — 162 líneas, leer entero; línea 92 es la ÚNICA ocurrencia del literal `claude-haiku-4-5` — verificada por grep al planificar)
    - src/lib/agents/somnio-v4/types.ts (V4AgentInput / V4AgentOutput shape)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (signature de processMessage exportado)
    - src/lib/sandbox/types.ts (SandboxState + DebugTurn shape)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-19, D-20, D-21, D-22, D-30)
  </read_first>
  <action>
**Paso 1 — Read both files completely:**
- `src/lib/agents/somnio-v3/engine-v3.ts` (162 líneas)
- `src/lib/agents/somnio-v4/types.ts` (todas las definiciones de V4AgentInput/Output)

**Paso 2 — Crear `src/lib/agents/somnio-v4/engine-v4.ts`:**

Header:
```typescript
/**
 * Somnio v4 Engine - Minimal Sandbox Runner
 *
 * Thin engine for sandbox-only v4 agent testing.
 * Handles bidirectional mapping: SandboxState <-> V4AgentInput
 * via _v3: prefixed keys in datosCapturados (preservados por compatibilidad
 * con sessions productivas — D-19 mantiene namespace).
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 03.
 * Cloned mecánicamente desde somnio-v3/engine-v3.ts (D-13 — duplicado 100%).
 *
 * Diferencias intencionales con engine-v3:
 * - import processMessage desde './somnio-v4-agent' (no v3)
 * - V4EngineInput/Output types
 * - DebugTurn extendido con campos opcionales subLoopReason/kbHits/nuncaDecir/threshold (D-20)
 * - KB real (D-22) — workspaceId propagado al agent que internamente queries Supabase prod
 * - Retomas simuladas (D-21) — systemEvent propagado igual que v3
 * - debugTurn.tokens.models[].model = 'gemini-2.5-flash-lite' (B-2 / D-30 — swap at
 *   clone time; refleja el provider real que Plan 05 wirea para comprehension)
 */
```

**Substituciones literales del v3 al copiar (tabla EXHAUSTIVA — single pass):**

| De (engine-v3.ts) | A (engine-v4.ts) | Justificación |
|---|---|---|
| `import { processMessage } from './somnio-v3-agent'` | `import { processMessage } from './somnio-v4-agent'` | Route to v4 agent |
| `import type { ... } from './types'` | (mismo path — resuelve a somnio-v4/types.ts) | Relative path |
| `V3EngineInput` (toda ocurrencia) | `V4EngineInput` | Clone fidelity |
| `V3EngineOutput` (toda ocurrencia) | `V4EngineOutput` | Clone fidelity |
| `class SomnioV3Engine` | `class SomnioV4Engine` | Clone fidelity |
| `[SomnioV3Engine]` log prefix | `[SomnioV4Engine]` | Logger isolation |
| `code: 'V3_ENGINE_ERROR'` | `code: 'V4_ENGINE_ERROR'` | Error code isolation |
| `model: 'claude-haiku-4-5' as const` (línea 92, debugTurn.tokens.models) | `model: 'gemini-2.5-flash-lite' as const` | **B-2 fix: swap at clone time. Es el provider real que Plan 05 wirea para comprehension (donde nace `output.totalTokens`). Display-only en sandbox UI debug panel, no afecta runtime. Sin TODO comment.** |

**Mapping V4AgentInput desde SandboxState** (línea 37 del v3 actualmente):

V3 actual:
```typescript
const output = await processMessage({
  message: input.message,
  currentMode: input.state.currentMode,
  intentsVistos: input.state.intentsVistos ?? [],
  templatesEnviados: input.state.templatesEnviados ?? [],
  datosCapturados: input.state.datosCapturados ?? {},
  packSeleccionado: input.state.packSeleccionado ?? null,
  accionesEjecutadas: input.state.accionesEjecutadas ?? [],
  history: input.history,
  turnNumber: input.turnNumber,
  workspaceId: input.workspaceId,
  systemEvent: input.systemEvent,
})
```

Para v4, **leer `src/lib/agents/somnio-v4/types.ts` PRIMERO** y verificar si V4AgentInput tiene los mismos campos. Posibles divergencias a ajustar:
- `accionesEjecutadas`: v3 era `string[]`, v4 puede ser `AccionRegistrada[]` (objeto). Si difiere, hacer mapping inline:
  ```typescript
  // V4 accionesEjecutadas shape: AccionRegistrada[] (objeto), V3 sandbox state guarda string[]
  // Wrapper desempaca: si state.accionesEjecutadas es string[], crear array vacío AccionRegistrada[]
  // y dejar que somnio-v4 reconstruya desde datosCapturados (preserva _v3:accionesEjecutadas key)
  ```
- Otros campos: aplicar misma lógica defensiva.

**DebugTurn extendido (D-20):**

Mirar `src/lib/sandbox/types.ts` y verificar si `DebugTurn` ya tiene `subLoopReason?`, `kbHits?`, `nuncaDecirMatches?`, `threshold?`. Si NO:
- Extender la interfaz inline en `src/lib/sandbox/types.ts` con campos OPCIONALES (`?:`).
- NO crear interface nueva (D-20: "extender, no crear tab nueva").
- Cambio mínimo:
  ```typescript
  export interface DebugTurn {
    // ... campos existentes ...
    // V4 extensions (D-20 — opcional, solo cuando v4 path activo)
    subLoopReason?: 'low_confidence' | 'crm_mutation' | 'cas_reject' | 'razonamiento_libre'
    kbHits?: Array<{ topic: string; score: number }>
    nuncaDecirMatches?: string[]
    threshold?: number
  }
  ```

En `engine-v4.ts`, mapear campos del V4AgentOutput (si existen) al DebugTurn extendido. Si V4AgentOutput aún no expone esos campos, dejar TODOs:
```typescript
// TODO Plan 06: surface subLoopReason / kbHits / nuncaDecirMatches / threshold from V4AgentOutput
//               cuando el agent los exponga (actualmente surge sólo en observability events).
```

**B-2 grep guards (post-Plan 03 mantenidos por Plan 05):**
```bash
# Confirma swap at clone time:
grep -q "model: 'gemini-2.5-flash-lite' as const" src/lib/agents/somnio-v4/engine-v4.ts
# expect: match

# Confirma sin Haiku:
grep -c "claude-haiku-4-5" src/lib/agents/somnio-v4/engine-v4.ts
# expect: 0
```

**Verificar zero edits a v3:**
```bash
git diff src/lib/agents/somnio-v3/engine-v3.ts
# expect: empty
```

**Type check:**
```bash
npx tsc --noEmit 2>&1 | grep -E "somnio-v4/engine-v4" | head -10
# expect: 0 errores
```
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/engine-v4.ts && grep -q "export class SomnioV4Engine" src/lib/agents/somnio-v4/engine-v4.ts && grep -q "from './somnio-v4-agent'" src/lib/agents/somnio-v4/engine-v4.ts && grep -q "V4_ENGINE_ERROR" src/lib/agents/somnio-v4/engine-v4.ts && grep -q "V4EngineInput" src/lib/agents/somnio-v4/engine-v4.ts && grep -q "V4EngineOutput" src/lib/agents/somnio-v4/engine-v4.ts && grep -q "model: 'gemini-2.5-flash-lite' as const" src/lib/agents/somnio-v4/engine-v4.ts && ! grep -q "claude-haiku-4-5" src/lib/agents/somnio-v4/engine-v4.ts && [ -z "$(git diff src/lib/agents/somnio-v3/engine-v3.ts)" ] && npx tsc --noEmit 2>&1 | grep -E "somnio-v4/engine-v4" | grep -v "TODO" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/agents/somnio-v4/engine-v4.ts` existe
    - `export class SomnioV4Engine` presente
    - `import { processMessage } from './somnio-v4-agent'` (NO `from './somnio-v3-agent'`)
    - Error code `'V4_ENGINE_ERROR'` (NO `'V3_ENGINE_ERROR'`)
    - **`model: 'gemini-2.5-flash-lite' as const` presente en debugTurn.tokens.models (B-2 fix swap at clone time)**
    - **Cero matches del literal `claude-haiku-4-5` en `src/lib/agents/somnio-v4/engine-v4.ts` (B-2 grep guard, mantenido por Plan 05 phase-wide grep)**
    - Cero referencias a `SomnioV3Engine` o `V3Engine` en el archivo (excepto en docstring "cloned from")
    - `git diff src/lib/agents/somnio-v3/engine-v3.ts` vacío (Regla 6)
    - `npx tsc --noEmit` no introduce errores nuevos en somnio-v4/engine-v4.ts
    - DebugTurn extension agregada en `src/lib/sandbox/types.ts` con campos opcionales (subLoopReason / kbHits / nuncaDecirMatches / threshold) — solo si DebugTurn no los tenía ya
  </acceptance_criteria>
  <done>SomnioV4Engine clonado, mapping V4 verificado, types extendidos, model literal swap at clone time aplicado (B-2).</done>
</task>

<task type="auto">
  <name>Task 2: Branch v4 en /api/sandbox/process/route.ts (additivo, antes del V1 default)</name>
  <files>src/app/api/sandbox/process/route.ts</files>
  <read_first>
    - src/app/api/sandbox/process/route.ts (lines 80-160 — branches existentes)
    - src/lib/agents/somnio-v4/engine-v4.ts (post-Task 1)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-19)
    - CLAUDE.md (Regla 6 — branches existentes intocados)
  </read_first>
  <action>
**Insertar branch v4 entre el branch recompra (línea 113-125) y el bloque V1 default (línea 127+).**

Pattern verbatim del v3 branch:
```typescript
    // ================================================================
    // V4 Agent: separate engine, completely isolated from v1/v2/v3/recompra
    // Standalone: somnio-sales-v4-runtime-wiring / Plan 03 (D-1, D-19)
    // ================================================================
    if (agentId === 'somnio-sales-v4') {
      const { SomnioV4Engine } = await import('@/lib/agents/somnio-v4/engine-v4')
      const v4Engine = new SomnioV4Engine()
      const v4Result = await v4Engine.processMessage({
        message,
        state,
        history: history ?? [],
        turnNumber: turnNumber ?? 1,
        workspaceId: workspaceId ?? 'sandbox-workspace',
        systemEvent,
      })
      return NextResponse.json(v4Result)
    }
```

**Por qué dynamic import vs static (como v3):**
- v3 hace `import { SomnioV3Engine } from '@/lib/agents/somnio-v3/engine-v3'` al top (línea 17). Es ya lo establecido.
- v4 prefiere dynamic import dentro del branch para:
  1. Evitar carga del agentRegistry.register(somnioV4Config) en CADA request del sandbox endpoint (cold-start tax)
  2. Permitir que tests del endpoint sin agentId='somnio-sales-v4' no carguen v4 module
  3. Consistente con webhook-processor que también hace dynamic import de v4 (Plan 04)

**ZERO edits a:**
- Branch v2 (línea 82-92)
- Branch v3 (línea 97-108)
- Branch recompra (línea 113-125)
- Default V1 path (línea 127+)
- Top-level imports (líneas 1-30)

**Verificación:**
```bash
git diff src/app/api/sandbox/process/route.ts
# debe mostrar SOLO una adición de bloque entre las líneas 125 y 127 — cero deletions, cero modificaciones a otras líneas
```

**Type check:**
```bash
npx tsc --noEmit 2>&1 | grep -E "sandbox/process/route" | head -5
# expect: 0 errores
```

**Smoke manual (sin POST):**
```bash
# El servidor dev debe arrancar sin error tras el cambio
# (no lo arranques en este task — Task se valida por type-check + grep)
```

**Anti-regresion grep:**
```bash
# v3 branch sigue intacto:
grep -A 9 "if (agentId === 'somnio-sales-v3')" src/app/api/sandbox/process/route.ts | head -10
# debe mostrar el bloque del v3 sin alteración

# v4 branch nuevo presente:
grep -A 11 "if (agentId === 'somnio-sales-v4')" src/app/api/sandbox/process/route.ts | head -15

# orden de branches: v2 → v3 → recompra → v4 → default
grep -nE "if \(agentId ===" src/app/api/sandbox/process/route.ts
# expect output:
# 82:    if (agentId === 'somnio-sales-v2') {
# 97:    if (agentId === 'somnio-sales-v3') {
# 113:    if (agentId === 'somnio-recompra-v1') {
# ~127:  if (agentId === 'somnio-sales-v4') {
```

Documentar las líneas finales en SUMMARY.md.
  </action>
  <verify>
    <automated>grep -q "if (agentId === 'somnio-sales-v4')" src/app/api/sandbox/process/route.ts && grep -q "SomnioV4Engine" src/app/api/sandbox/process/route.ts && grep -q "@/lib/agents/somnio-v4/engine-v4" src/app/api/sandbox/process/route.ts && grep -A 9 "if (agentId === 'somnio-sales-v3')" src/app/api/sandbox/process/route.ts | grep -q "SomnioV3Engine" && grep -A 11 "if (agentId === 'somnio-recompra-v1')" src/app/api/sandbox/process/route.ts | grep -q "SomnioRecompraEngine" && npx tsc --noEmit 2>&1 | grep -E "sandbox/process/route" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - Branch `if (agentId === 'somnio-sales-v4')` existe en route.ts
    - Branch usa `SomnioV4Engine` (no V3Engine)
    - Branch usa dynamic `await import('@/lib/agents/somnio-v4/engine-v4')`
    - Branch v3 (línea 97-108) sigue intacto — verificable por grep
    - Branch recompra (línea 113-125) sigue intacto
    - Branch v2 (línea 82-92) sigue intacto
    - Default V1 path sigue intacto (no se modifica el código UnifiedEngine)
    - `npx tsc --noEmit` no reporta errores en route.ts
    - Orden de branches: v2 → v3 → recompra-v1 → somnio-sales-v4 → V1 default
  </acceptance_criteria>
  <done>Sandbox route con branch v4 aditivo. Plan 07 puede testear v4 desde la UI.</done>
</task>

</tasks>

<verification>
- engine-v4.ts existe + compila + clone fidelity con engine-v3.ts (modulo substitutions)
- engine-v4.ts contiene `'gemini-2.5-flash-lite' as const`, NO `'claude-haiku-4-5'` (B-2 fix)
- Branch v4 en sandbox route additivo, branches anteriores intocados (Regla 6)
- DebugTurn extension cubre D-20 (campos opcionales)
- npx tsc --noEmit sin errores nuevos
- Cero edits a engine-v3.ts, ni a otros agentes
</verification>

<success_criteria>
- Plan 07 (Smoke A — sandbox) puede arrancar UI con dropdown v4 y testear sub-loop
- Plan 04 (webhook branch) y Plan 05 (model swap) son independientes — pueden correr en paralelo a este Plan 03 dentro de Wave 3 (NO — Plan 04 está en Wave 3 que depende de este Plan 03 — re-check abajo)
- Plan 05 phase-wide grep `claude-haiku-4-5` en `src/lib/agents/somnio-v4/` retorna 0 sin necesitar añadir engine-v4.ts a su files_modified (B-2 swap at clone time aquí cierra el gap)
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/03-SUMMARY.md` con:
- Diff stats engine-v4.ts vs engine-v3.ts (líneas añadidas/cambiadas — esperado: ~5 líneas substituidas, model literal incluido)
- Confirmación grep `claude-haiku-4-5` retorna 0 en engine-v4.ts (B-2 fix verified)
- DebugTurn extension lines added en `src/lib/sandbox/types.ts` (si aplicó)
- Líneas exactas del nuevo branch v4 en route.ts (start-end)
- Cualquier divergencia V3→V4 input shape adaptada
</output>
</output>
