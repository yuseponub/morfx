---
plan: 06
phase: somnio-sales-v4
wave: 2
depends_on: [04, 05]
files_modified:
  - src/lib/agents/somnio-v4/constants.ts
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/state.ts
  - src/lib/agents/somnio-v4/phase.ts
  - src/lib/agents/somnio-v4/guards.ts
  - src/lib/agents/somnio-v4/transitions.ts
  - src/lib/agents/somnio-v4/sales-track.ts
  - src/lib/agents/somnio-v4/delivery-zones.ts
  - src/lib/agents/somnio-v4/comprehension-schema.ts
  - src/lib/agents/somnio-v4/comprehension-prompt.ts
  - src/lib/agents/somnio-v4/comprehension.ts
  - src/lib/agents/somnio-v4/response-track.ts
  - src/lib/agents/somnio-v4/config.ts
  - src/lib/agents/somnio-v4/index.ts
  - src/lib/agents/somnio-v4/__tests__/transitions.test.ts
  - src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts
addresses_decisions: [D-08, D-10, D-13, D-21, D-23, D-24, D-28, D-29, D-30, D-44, D-63, D-64, D-65, D-66, D-68, D-69, D-70, D-71, D-72, D-74, D-79]
addresses_research_pitfalls: [Pitfall 4]
autonomous: true
estimated_tasks: 8
must_haves:
  truths:
    - "Todos los archivos de v4 contienen literal 'somnio-sales-v4' (D-13)"
    - "Cero archivo de v4 importa desde @/lib/agents/somnio-v3/* (D-24 estricto)"
    - "comprehension-schema.ts incluye intent_confidence + intent_confidence_reasoning"
    - "comprehension-prompt.ts contiene bloque '## EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE' (incluye few-shot 'otro' como sumidero — D-69)"
    - "constants.ts contiene V4_META_PREFIX = '_v4:' (no _v3:)"
    - "agentRegistry.register(somnioV4Config) ejecutado al import del index.ts"
    - "Tests de transitions y schema pasan"
  artifacts:
    - path: "src/lib/agents/somnio-v4/constants.ts"
      provides: "V4_INTENTS + V4_TIMER_DURATIONS + V4_META_PREFIX + ACTION_TEMPLATE_MAP"
      contains: "V4_META_PREFIX"
    - path: "src/lib/agents/somnio-v4/comprehension.ts"
      provides: "comprehend() con schema extendido"
      exports: ["comprehend"]
    - path: "src/lib/agents/somnio-v4/transitions.ts"
      provides: "TRANSITIONS array + resolveTransition + systemEventToKey"
      exports: ["TRANSITIONS", "resolveTransition", "systemEventToKey"]
    - path: "src/lib/agents/somnio-v4/index.ts"
      provides: "self-register agentRegistry + re-exports"
      exports: ["SOMNIO_V4_AGENT_ID", "V4AgentInput", "V4AgentOutput"]
  key_links:
    - from: "comprehend(message)"
      to: "MessageAnalysis con intent_confidence:number"
      via: "Zod schema extendido"
      pattern: "intent_confidence: z\\.number\\(\\)\\.min\\(0\\)\\.max\\(1\\)"
    - from: "response-track.ts"
      to: "agent_templates.agent_id='somnio-sales-v4'"
      via: "TemplateManager filter por SOMNIO_V4_AGENT_ID"
      pattern: "SOMNIO_V4_AGENT_ID"
    - from: "transitions.ts + sales-track.ts"
      to: "crm_query_tools_config (compartido D-28) + pipelines/stages by UUID (D-29)"
      via: "pattern hereda de v3 — UUIDs literales en delivery-zones.ts cuando aplican"
      pattern: "uuid"
---

<objective>
Wave 2 — port mecánico del state machine v3 → v4 (clone + adapt), extendiendo SOLO comprehension con confidence (D-10). El orquestador `somnio-v4-agent.ts` se construye en Plan 07 (split intencional).

Este plan crea TODOS los archivos puros del state machine + comprehension extendida. La integración con sub-loop + crm-mutation-tools va en Plan 07.

D-28 (crm_query_tools_config compartido) + D-29 (pipelines+stages by UUID): el clone de v3 ya respeta estos patrones — verificar que UUIDs y referencias a config se preservan verbatim.

D-69 (intent 'otro' sumidero): cubierto por few-shot example #7 ('y mi tía dice que esto es magia' → intent.primary='otro' con intent_confidence=0.20).

Output: 14 archivos de código + 2 tests + 1 commit autónomo. D-24 verificado vía grep.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/RESEARCH.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/comprehension-schema.ts
@src/lib/agents/somnio-v3/comprehension-prompt.ts
@src/lib/agents/somnio-v3/comprehension.ts
@src/lib/agents/somnio-v3/response-track.ts
@src/lib/agents/somnio-v3/config.ts
@src/lib/agents/somnio-v3/index.ts
</context>

<interfaces>
Mechanical substitution table (PATTERNS.md secciones 1-13):

| v3 literal | v4 literal |
|---|---|
| `'somnio-sales-v3'` | `'somnio-sales-v4'` |
| `SOMNIO_V3_AGENT_ID` | `SOMNIO_V4_AGENT_ID` |
| `V3_INTENTS` | `V4_INTENTS` |
| `V3_TIMER_DURATIONS` | `V4_TIMER_DURATIONS` |
| `V3_META_PREFIX` (`'_v3:'`) | `V4_META_PREFIX` (`'_v4:'`) |
| `V3AgentInput` / `V3AgentOutput` | `V4AgentInput` / `V4AgentOutput` |
| `somnioV3Config` | `somnioV4Config` |
| `somnio-v3-agent` (filename) | `somnio-v4-agent` (filename — Plan 07) |

Imports preservados (D-24 NO los prohíbe — utilities compartidas):
- `@/lib/agents/somnio/normalizers`
- `@/lib/agents/somnio/template-manager`
- `@/lib/agents/somnio/block-composer`

Imports prohibidos (D-24):
- `@/lib/agents/somnio-v3/*` — CERO ocurrencias en v4
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Clone constants.ts + types.ts</name>
  <files>src/lib/agents/somnio-v4/constants.ts, src/lib/agents/somnio-v4/types.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/constants.ts
    - src/lib/agents/somnio-v3/types.ts
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones "constants.ts" + "types.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-13, D-21, D-24, D-30)
  </read_first>
  <action>
1. **constants.ts**: Copiar verbatim v3 → v4. Substituciones mecánicas: `V3_INTENTS` → `V4_INTENTS`, `V3_TIMER_DURATIONS` → `V4_TIMER_DURATIONS`, `V3_META_PREFIX` → `V4_META_PREFIX`. El valor de `V4_META_PREFIX` debe ser `'_v4:'` (NO `'_v3:'`) — crítico para aislamiento de session_state.datos_capturados (D-30). Mantener D-21 (timer durations idénticas). Mantener `INFORMATIONAL_INTENTS`, `ACTION_TEMPLATE_MAP`, `CRM_ACTIONS`, `CREATE_ORDER_ACTIONS`, `PACK_PRICES`, `CRITICAL_FIELDS_*` con valores idénticos.

2. **types.ts**: Copiar verbatim. `V3AgentInput` → `V4AgentInput`, `V3AgentOutput` → `V4AgentOutput`. Resto verbatim. AGREGAR al final el bloque nuevo (RESEARCH §Pattern 3):

```typescript
// === V4 — net new ===
export type Invocation =
  | { kind: 'come_back'; tool: string; input: unknown; onSuccess: (result: unknown) => StateChanges; onError: (err: ToolError) => StateChanges; timeoutMs: number }
  | { kind: 'execute'; tool: string; input: unknown; idempotencyKey: string; onError: 'log' | 'observability' | 'silent' }
```

Nota: el tipo `Invocation` se usa en Plan 07 — el orquestador resolvedrá invocations inline (W-04 fix). Plan 06 sólo lo declara.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/constants.ts && grep -q "V4_META_PREFIX" src/lib/agents/somnio-v4/constants.ts && grep -q "'_v4:'" src/lib/agents/somnio-v4/constants.ts && [ "$(grep -c 'V3_META_PREFIX\|V3_INTENTS\|V3_TIMER_DURATIONS' src/lib/agents/somnio-v4/constants.ts)" = "0" ] && grep -q "V4AgentInput" src/lib/agents/somnio-v4/types.ts && grep -q "export type Invocation" src/lib/agents/somnio-v4/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - constants.ts contiene `V4_META_PREFIX = '_v4:'` literal
    - constants.ts NO contiene `V3_INTENTS`, `V3_TIMER_DURATIONS`, `V3_META_PREFIX`
    - types.ts contiene `V4AgentInput`, `V4AgentOutput`, `Invocation`
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>Clones constants/types completos.</done>
</task>

<task type="auto">
  <name>Task 2: Clone state.ts + phase.ts + guards.ts</name>
  <files>src/lib/agents/somnio-v4/state.ts, src/lib/agents/somnio-v4/phase.ts, src/lib/agents/somnio-v4/guards.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/state.ts, phase.ts, guards.ts
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones correspondientes)
  </read_first>
  <action>
1. **state.ts**: Copiar v3 verbatim. `V3_META_PREFIX` → `V4_META_PREFIX`. Imports `@/lib/agents/somnio/normalizers` SE PRESERVAN. `import type { MessageAnalysis } from './comprehension-schema'` se preserva (apunta a v4 local).
2. **phase.ts**: Copiar verbatim.
3. **guards.ts**: Copiar verbatim. (El ESCALATION guard sub-loop NO va aquí — va en somnio-v4-agent.ts en Plan 07.)
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/state.ts && test -f src/lib/agents/somnio-v4/phase.ts && test -f src/lib/agents/somnio-v4/guards.ts && grep -q "V4_META_PREFIX" src/lib/agents/somnio-v4/state.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/state.ts src/lib/agents/somnio-v4/phase.ts src/lib/agents/somnio-v4/guards.ts | wc -l)" = "0" ] && grep -q "export function mergeAnalysis" src/lib/agents/somnio-v4/state.ts</automated>
  </verify>
  <acceptance_criteria>
    - 3 archivos existen
    - state.ts importa `V4_META_PREFIX`
    - Cero imports somnio-v3 en estos archivos
    - `pnpm typecheck` ok
  </acceptance_criteria>
  <done>State machine puro clonado.</done>
</task>

<task type="auto">
  <name>Task 3: Clone transitions.ts + sales-track.ts + delivery-zones.ts</name>
  <files>src/lib/agents/somnio-v4/transitions.ts, src/lib/agents/somnio-v4/sales-track.ts, src/lib/agents/somnio-v4/delivery-zones.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/transitions.ts (478 líneas), sales-track.ts, delivery-zones.ts
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones correspondientes)
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-28 crm_query_tools_config compartido — UUIDs v3 se preservan; D-29 pipelines+stages by UUID)
  </read_first>
  <action>
1. **transitions.ts**: Copiar verbatim. TRANSITIONS array, resolveTransition, systemEventToKey. NO agregar invocations todavía (Plan 07 W-04 fix lo hace).
2. **sales-track.ts**: Copiar verbatim.
3. **delivery-zones.ts**: Copiar verbatim. UUIDs literales de pipelines/stages se preservan tal cual (D-29 — v4 usa el mismo `crm_query_tools_config` y mismas stage UUIDs que v3, ya que apuntan al pipeline Somnio compartido).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/transitions.ts && grep -q "export const TRANSITIONS" src/lib/agents/somnio-v4/transitions.ts && grep -q "export function resolveTransition" src/lib/agents/somnio-v4/transitions.ts && test -f src/lib/agents/somnio-v4/sales-track.ts && test -f src/lib/agents/somnio-v4/delivery-zones.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/transitions.ts src/lib/agents/somnio-v4/sales-track.ts src/lib/agents/somnio-v4/delivery-zones.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - 3 archivos existen, TRANSITIONS exportado, cero imports somnio-v3, typecheck ok
    - UUIDs de stages preservados verbatim (D-29)
  </acceptance_criteria>
  <done>Transition tables clonadas.</done>
</task>

<task type="auto">
  <name>Task 4: comprehension-schema.ts + comprehension-prompt.ts (EXTENDED)</name>
  <files>src/lib/agents/somnio-v4/comprehension-schema.ts, src/lib/agents/somnio-v4/comprehension-prompt.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/comprehension-schema.ts (verbatim base)
    - src/lib/agents/somnio-v3/comprehension-prompt.ts (verbatim base)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones "comprehension-schema.ts" + "comprehension-prompt.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-10, D-63, D-64, D-65, D-66, D-69, D-70, D-71, D-72, D-74, D-79)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Pitfall 4, §Example 1, §Example 2)
  </read_first>
  <action>
**A) `comprehension-schema.ts`** — clone + EXTEND:

Copiar v3 → v4. `V3_INTENTS` → `V4_INTENTS`. Dentro del `intent: z.object({...})` agregar (D-10, D-63):

```typescript
intent: z.object({
  primary: z.enum(V4_INTENTS),
  secondary: z.enum([...V4_INTENTS, 'ninguno'] as const),
  confidence: z.number().describe('0-100 — campo legacy v3, preservado.'),
  reasoning: z.string(),

  // === V4 NEW (D-10, D-63) ===
  intent_confidence: z.number().min(0).max(1).describe(
    '0..1 self-reported confidence en la clasificación PRIMARIA. ' +
    '0.85+ = universal-claro, 0.50-0.70 = context-dependent, <0.40 = sumidero. ' +
    'Reflect ambiguity at this turn IN ISOLATION (D-74).'
  ),
  intent_confidence_reasoning: z.string().optional().describe(
    'Brief explanation of why this confidence value (D-68 observability + tuning).'
  ),
}),
```

Resto del schema verbatim (`extracted_fields`, `classification`, `negations`).

**B) `comprehension-prompt.ts`** — clone + APPEND few-shot:

Copiar v3 verbatim. Sustituir `V3_INTENTS` → `V4_INTENTS`. Agregar dentro de `buildSystemPrompt(...)` la constante:

```typescript
const CONFIDENCE_FEW_SHOT = `

## EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE (intent_confidence)

# Universal-claros (alta confianza, 0.85-0.95):
1. "cuanto cuesta el producto" → intent.primary='precio', intent_confidence=0.95
   reasoning: "Pregunta directa por precio sin ambigüedad."
2. "no me interesa, gracias" → intent.primary='no_interesa', intent_confidence=0.92
   reasoning: "Frase clara de rechazo explícita."
3. "quiero comprar 2" → intent.primary='seleccion_pack', intent_confidence=0.88
   reasoning: "Pack 2x explícito + verbo de compra."

# Context-dependientes (confianza media, 0.50-0.70):
4. "ok" → intent.primary='confirmar', intent_confidence=0.55
   reasoning: "Sin contexto previo, podría ser acknowledgment o confirmación."
5. "si" → intent.primary='confirmar', intent_confidence=0.60
   reasoning: "Aceptación afirmativa pero podría ser respuesta a múltiples preguntas previas."
6. "tengo dudas" → intent.primary='otro', intent_confidence=0.50
   reasoning: "Frase ambigua sin objeto claro de duda."

# Sumideros (baja confianza, <0.40 — D-69 'otro' sumidero por construcción):
7. "y mi tía dice que esto es magia" → intent.primary='otro', intent_confidence=0.20
   reasoning: "Mensaje no relacionado con flujo de venta directamente; razonamiento libre."
8. "lol jajaja 😂" → intent.primary='otro', intent_confidence=0.30
   reasoning: "Reacción no informativa; clasificación nominal pero sin certeza."

INSTRUCCIÓN CRÍTICA (D-74):
Tu output es sobre este mensaje individual y su match con un intent universal. NO uses contexto de fase previa para resolver ambiguedad — reporta ambigüedad como confianza baja.
`
```

Y al final del builder: `return \`${baseSystemPrompt}\n\n${CONFIDENCE_FEW_SHOT}\``.

**Anti-patterns:** D-67 NO agregar `confidence_calibration: z.enum`; Pitfall 4 NO parafrasear ejemplos; temperature=0 preservada.
  </action>
  <verify>
    <automated>grep -q "intent_confidence: z.number().min(0).max(1)" src/lib/agents/somnio-v4/comprehension-schema.ts && grep -q "intent_confidence_reasoning: z.string().optional()" src/lib/agents/somnio-v4/comprehension-schema.ts && grep -q "EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE" src/lib/agents/somnio-v4/comprehension-prompt.ts && grep -q "Tu output es sobre este mensaje individual" src/lib/agents/somnio-v4/comprehension-prompt.ts && [ "$(grep -c 'confidence_calibration: z.enum' src/lib/agents/somnio-v4/comprehension-schema.ts)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - schema con `intent_confidence` + `intent_confidence_reasoning`
    - schema NO contiene `confidence_calibration: z.enum` (D-67)
    - prompt contiene literal "EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE"
    - prompt contiene instrucción D-74
    - prompt cubre 'otro' como sumidero (D-69)
    - Cero imports somnio-v3
  </acceptance_criteria>
  <done>Schema + prompt extendidos.</done>
</task>

<task type="auto">
  <name>Task 5: comprehension.ts</name>
  <files>src/lib/agents/somnio-v4/comprehension.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/comprehension.ts
    - src/lib/agents/somnio-v4/comprehension-schema.ts (acabado de crear)
    - src/lib/agents/somnio-v4/comprehension-prompt.ts (acabado de crear)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "comprehension.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-68)
  </read_first>
  <action>
Clone v3 → v4. Substituciones: `V3_INTENTS` → `V4_INTENTS`, MessageAnalysisSchema mantiene nombre. Mantener `@anthropic-ai/sdk` con `zodOutputFormat` (RESEARCH "stay raw"). Mantener `runWithPurpose('comprehension', ...)`. Mantener fallback `parseAnalysis()`.

EXTEND observability emit (D-68) antes del return:
```typescript
getCollector()?.recordEvent('pipeline_decision', 'comprehension_completed', {
  agent: 'somnio-sales-v4',
  intent: analysis.intent.primary,
  intent_confidence: analysis.intent.intent_confidence,
  intent_confidence_reasoning: analysis.intent.intent_confidence_reasoning ?? null,
  threshold: null,        // Plan 07 lo agrega
  scaledToSubLoop: null,  // Plan 07 lo decide
  tokensUsed,
})
```

Anti-patterns: NO migrar a AI SDK v6 (RESEARCH); NO skip parseAnalysis fallback; temperature=0 preservada.
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/comprehension.ts && grep -q "@anthropic-ai/sdk" src/lib/agents/somnio-v4/comprehension.ts && grep -q "runWithPurpose('comprehension'" src/lib/agents/somnio-v4/comprehension.ts && grep -q "claude-haiku-4-5-20251001" src/lib/agents/somnio-v4/comprehension.ts && grep -q "agent: 'somnio-sales-v4'" src/lib/agents/somnio-v4/comprehension.ts && grep -q "intent_confidence" src/lib/agents/somnio-v4/comprehension.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/comprehension.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - Usa @anthropic-ai/sdk (no AI SDK v6)
    - runWithPurpose preservado
    - Modelo claude-haiku-4-5-20251001
    - agent: 'somnio-sales-v4' literal en observability
    - intent_confidence presente
    - Cero imports somnio-v3
  </acceptance_criteria>
  <done>Comprehension v4 con confidence.</done>
</task>

<task type="auto">
  <name>Task 6: response-track.ts</name>
  <files>src/lib/agents/somnio-v4/response-track.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/response-track.ts
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "response-track.ts")
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-26)
  </read_first>
  <action>
Clone v3 → v4. Sustitución crítica D-26: `SOMNIO_V3_AGENT_ID` → `SOMNIO_V4_AGENT_ID`. Imports preservados: `@/lib/agents/somnio/template-manager`, `block-composer`, `getCollector`, locales (constants, config, state, delivery-zones, types).
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/response-track.ts && grep -q "SOMNIO_V4_AGENT_ID" src/lib/agents/somnio-v4/response-track.ts && [ "$(grep -E \"SOMNIO_V3_AGENT_ID|'somnio-sales-v3'\" src/lib/agents/somnio-v4/response-track.ts | grep -v '^//' | wc -l)" = "0" ] && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/response-track.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - SOMNIO_V4_AGENT_ID en uso
    - Cero literal 'somnio-sales-v3' no-comentario
    - Cero imports somnio-v3
  </acceptance_criteria>
  <done>Response track apunta al catálogo v4.</done>
</task>

<task type="auto">
  <name>Task 7: Extender config.ts + crear index.ts (self-register)</name>
  <files>src/lib/agents/somnio-v4/config.ts, src/lib/agents/somnio-v4/index.ts</files>
  <read_first>
    - src/lib/agents/somnio-v3/config.ts, index.ts
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones "config.ts", "index.ts", "Self-register")
    - src/lib/agents/somnio-v4/config.ts (versión Plan 04 mínima — extender, no sobreescribir)
  </read_first>
  <action>
**A) Extender `src/lib/agents/somnio-v4/config.ts`** preservando los exports existentes (`SOMNIO_V4_AGENT_ID`, `SOMNIO_WORKSPACE_ID`) y agregando `somnioV4Config`:

```typescript
import type { AgentConfig } from '../types'

export const SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' as const
export const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' as const

export const somnioV4Config: AgentConfig = {
  id: SOMNIO_V4_AGENT_ID,
  name: 'Somnio Sales v4 (híbrido + sub-loop)',
  description:
    'State machine determinista + Haiku sub-loop bajo triggers. Mutations vía crm-mutation-tools. KB curado. Observation loop unknown_cases.',
  // Resto de campos clonados estructuralmente de somnio-v3/config.ts.
  // Si AgentConfig de v3 tiene intentDetector/orchestrator/tools/states/initialState/validTransitions/confidenceThresholds/tokenBudget,
  // copiar VERBATIM esos valores literales.
}
```

**B) Crear `src/lib/agents/somnio-v4/index.ts`**:

```typescript
// Standalone: somnio-sales-v4
// Module entrypoint — self-register en agentRegistry (side-effect on import).
//
// Consumers que importan este módulo (actualizados en Plan 12):
//   - src/lib/agents/production/webhook-processor.ts (pre-warm Promise.all)
//   - src/app/(dashboard)/agentes/routing/editor/page.tsx (registry list)
//   - src/inngest/functions/agent-timers-v4.ts (Plan 08)

import { agentRegistry } from '../registry'
import { somnioV4Config } from './config'

agentRegistry.register(somnioV4Config)

export { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
export type { V4AgentInput, V4AgentOutput } from './types'
// processMessage se exporta en Plan 07 cuando exista somnio-v4-agent.ts.
```

**Nota:** Plan 07 agrega `export { processMessage } from './somnio-v4-agent'`.

Anti-patterns: NO importar somnio-v3; NO omitir register (sin él routing engine throws).
  </action>
  <verify>
    <automated>grep -q "somnioV4Config" src/lib/agents/somnio-v4/config.ts && grep -q "id: SOMNIO_V4_AGENT_ID" src/lib/agents/somnio-v4/config.ts && grep -q "agentRegistry.register(somnioV4Config)" src/lib/agents/somnio-v4/index.ts && [ "$(grep -rE \"from '@/lib/agents/somnio-v3\" src/lib/agents/somnio-v4/config.ts src/lib/agents/somnio-v4/index.ts | wc -l)" = "0" ]</automated>
  </verify>
  <acceptance_criteria>
    - config.ts exporta `somnioV4Config` + literales
    - index.ts hace self-register al import
    - Cero imports somnio-v3
  </acceptance_criteria>
  <done>Module entrypoint listo (sin processMessage todavía).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 8: Tests transitions + comprehension-schema + commit + push</name>
  <files>src/lib/agents/somnio-v4/__tests__/transitions.test.ts, src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/transitions.ts
    - src/lib/agents/somnio-v4/comprehension-schema.ts
    - src/lib/agents/somnio-v3/__tests__/* (si existen — analog para tests v3)
  </read_first>
  <behavior>
    transitions.test.ts:
    - Test 1: resolveTransition con phase='initial' + on='saludo' retorna acción esperada
    - Test 2: resolveTransition con entry no-matched retorna null
    - Test 3: systemEventToKey('timer_expired', level=3) retorna 'timer_expired:3'
    - Test 4: TRANSITIONS array tiene >= 30 entradas (sanity check de clone correcto)

    comprehension-schema.test.ts:
    - Test 1: Schema válido con intent_confidence=0.85 → parses ok
    - Test 2: intent_confidence=1.5 → throws (max 1)
    - Test 3: intent_confidence=-0.1 → throws (min 0)
    - Test 4: intent_confidence_reasoning omitido → parses ok (optional)
    - Test 5: intent.primary fuera de V4_INTENTS → throws
  </behavior>
  <action>
1. Crear ambos test files. Estructura típica de vitest. Importar desde paths v4 locales.

2. Ejecutar:
```bash
pnpm vitest run src/lib/agents/somnio-v4/__tests__/
pnpm typecheck
```
Ambos deben pasar.

3. Commit + push:
```bash
git add src/lib/agents/somnio-v4/
git commit -m "feat(somnio-v4): plan-06 — state machine clone + comprehension extended con confidence

- Clone mecánico de 12 archivos v3 → v4 (constants, types, state, phase, guards, transitions, sales-track, delivery-zones, comprehension-{schema,prompt,ts}, response-track)
- V4_META_PREFIX='_v4:' (D-30 isolation)
- comprehension-schema.ts EXTENDED: intent_confidence (z.number().min(0).max(1)) + intent_confidence_reasoning (D-10, D-63)
- comprehension-prompt.ts EXTENDED: 8 ejemplos few-shot + instrucción D-74 (D-66, D-79)
  - Ejemplo #7-8 cubre 'otro' como sumidero (D-69)
- comprehension.ts: observability emite agent='somnio-sales-v4' + intent_confidence (D-68)
- response-track.ts: SOMNIO_V4_AGENT_ID filtra catálogo v4 (D-26)
- config.ts + index.ts: somnioV4Config + agentRegistry self-register
- delivery-zones.ts y transitions.ts preservan UUIDs de pipelines/stages (D-29) y patrón crm_query_tools_config compartido (D-28)

D-24 verificado: cero imports desde @/lib/agents/somnio-v3/*
13 unit tests pasando.

Standalone: somnio-sales-v4
Decisions: D-08, D-10, D-13, D-21, D-23, D-24, D-28, D-29, D-30, D-44, D-63, D-64, D-65, D-66, D-68, D-69, D-70, D-71, D-72, D-74, D-79

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```

(Push inmediato — no hay migraciones nuevas en este plan.)
  </action>
  <verify>
    <automated>pnpm vitest run src/lib/agents/somnio-v4/__tests__/ --reporter=basic 2>&1 | grep -E "Test Files.*passed" && git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-06"</automated>
  </verify>
  <acceptance_criteria>
    - Tests transitions + comprehension-schema pasan
    - `pnpm typecheck` exits 0
    - Commit + push completados
    - Vercel deploy ok (no broken imports)
  </acceptance_criteria>
  <done>Wave 2 state machine completo, deployado.</done>
</task>

</tasks>

<verification>
- 14 archivos v4 existen sin imports prohibidos (D-24)
- comprehension extendida con confidence
- 13+ tests pasan
- agentRegistry.register sucede al import
</verification>

<success_criteria>
- Plan 07 puede importar todos los building blocks (state, transitions, comprehension, response-track, sub-loop) y construir el orquestador
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/06-SUMMARY.md` con tests output + grep D-24 verification + hash commit.
</output>
