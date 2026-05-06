---
plan: 02
phase: somnio-sales-v4-runtime-wiring
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts
  - src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
addresses_decisions: [D-29, D-30, D-7, D-8, D-10]
addresses_research_pitfalls: [H-1, H-2, H-3]
autonomous: true
estimated_tasks: 3
must_haves:
  truths:
    - "LoopOutcomeSchema NO usa z.discriminatedUnion (D-29 — rechazado por todos los providers)"
    - "LoopOutcomeSchema NO usa z.literal(false) ni z.literal(true) en requiresHuman (D-29)"
    - "LoopOutcomeSchema NO usa z.record(z.string(), z.string()) para extraContext (D-29)"
    - "LoopOutcomeSchema usa z.nullable() en vez de z.optional() en campos opcionales (D-29 — OpenAI strict)"
    - "Validación post-hoc en sub-loop/index.ts enforce invariantes (status='canonical' → canonicalText !== null) y escala a no_match si invariante roto"
    - "Consumer somnio-v4-agent.ts adapta narrowing — usa `if (output.status === 'canonical')` con campos opcionales en vez de discriminator narrowing"
    - "Test E2E sub-loop-e2e.test.ts hace al menos 2 llamadas reales a GPT-4o mini con OPENAI_API_KEY_SALESV4 (replaces mocks per H-1; gated por env var)"
    - "Cero imports desde somnio-v3/, godentist/, recompra/, pw-confirmation/ (Regla 6)"
  artifacts:
    - path: "src/lib/agents/somnio-v4/sub-loop/output-schema.ts"
      provides: "Re-shaped LoopOutcomeSchema flat sin discriminated union"
      contains: "z.object({"
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "Sub-loop con validación post-hoc del shape flat"
      contains: "validateLoopOutcomeInvariants"
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "Consumer adaptado al shape flat (narrowing por if/else por status)"
      contains: "output.status === 'canonical'"
    - path: "src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts"
      provides: "E2E test contra GPT-4o mini real (skipped si env vars faltan)"
      contains: "describe.skipIf"
  key_links:
    - from: "sub-loop/index.ts runSubLoop"
      to: "validateLoopOutcomeInvariants helper"
      via: "post-generation guard"
      pattern: "validateLoopOutcomeInvariants"
    - from: "somnio-v4-agent.ts processUserMessage"
      to: "output.status check + null guards on optional fields"
      via: "if (output.status === 'canonical') with output.canonicalText nullable check"
      pattern: "output\\.status === 'canonical'"
---

<objective>
Wave 1 — Re-shape LoopOutcomeSchema (D-29) + validación post-hoc + adaptar consumer + E2E test contra API real.

**El plan más arriesgado del standalone.** RESEARCH H-1 descubrió que el schema actual de v4 sub-loop **NUNCA ha corrido contra ninguna API estructurada** — los unit tests son mocks, el v4 nunca se ejecutó en runtime real (porque webhook nunca lo enrutó). Cuando el sub-loop dispare en runtime real (Plans 04+), el `generateText({ output: Output.object({ schema: LoopOutcomeSchema }) })` fallaría con error de schema rejection en TODOS los providers. Por eso este Plan 02 va PRIMERO en Wave 1 (después de Wave 0 setup).

**Mecánica del re-shape (D-29 — copiar verbatim de RESEARCH §LoopOutcomeSchema y CONTEXT D-29):**

1. **Eliminar `z.discriminatedUnion('status', [...])`** → reemplazar por `z.object({ status: z.enum([...]), ...campos opcionales como nullable })`. Anthropic rechaza el `oneOf`, Gemini rechaza `enum: [false]` con type=string, OpenAI rechaza `oneOf` también.

2. **Reemplazar `requiresHuman: z.literal(false)` / `z.literal(true)`** → `requiresHuman: z.boolean()`. La invariante (no_match → requiresHuman=true; template/canonical → requiresHuman=false) se enforca POST-HOC en `sub-loop/index.ts` antes de retornar — si LLM emite valor incorrecto, escalar a no_match con reason='invariant_violation_requires_human'.

3. **Eliminar `extraContext: z.record(z.string(), z.string()).optional()`** del status='template' → reemplazar por campos pre-definidos opcionales (nullable). RESEARCH §H-2 confirma que `z.record(z.string(), z.string())` se serializa como `propertyNames: { type: 'string' }` lo cual Anthropic rechaza. Decisión sub-tarea Task 1: o eliminar `extraContext` por completo si no se usa downstream, o reemplazar con 3-5 campos nullable explícitos (ej: `extraNombre: z.string().nullable()`, `extraDireccion: z.string().nullable()`, `extraTelefono: z.string().nullable()`). Verificar primero si `extraContext` se consume en `somnio-v4-agent.ts` o en otros archivos.

4. **Cambiar `.optional()` → `.nullable()`** en campos opcionales. RESEARCH §H-3 hallazgo: OpenAI strict mode (que es lo que usaremos en Plan 05 con GPT-4o mini) rechaza `.optional()`. `.nullable()` con valores `null` explícitos es la API portable.

5. **Validación post-hoc en `sub-loop/index.ts`** — añadir helper `validateLoopOutcomeInvariants(output)`:
   - `status='canonical'` → `canonicalText !== null && sourceTopic !== null`
   - `status='template'` → `responseTemplate !== null`
   - `status='no_match'` → `requiresHuman === true && responseTemplate === 'handoff_humano'`
   - Si invariante roto → log a observability + return overridden LoopOutcome con `status='no_match'`, `requiresHuman=true`, `reason='invariant_violation: <detail>'`, `knowledgeQueried: []`. NO throw — escalar suave a handoff humano (consistent con D-57).

6. **Adaptar consumer en `somnio-v4-agent.ts`** — el actual usa discriminator narrowing implícito (TypeScript infiere por discriminated union). Tras flat schema, hay que:
   - Cambiar `if (outcome.status === 'canonical')` con `outcome.canonicalText` ahora `string | null` → null check explícito
   - Cambiar referencias a `outcome.responseTemplate` con campo nullable → null check
   - Cambiar referencias a `outcome.knowledgeQueried` (status='no_match') → null check
   - Cero imports desde somnio-v3/godentist/etc. (Regla 6 invariante)

7. **Test E2E contra GPT-4o mini real (per H-1):**
   - Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts`
   - Usa `describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4, ...)` para skipear cuando env var falta (no romper CI)
   - 2 tests E2E mínimos con `generateText` real (ver Task 3 — corpus mínimo: schema flat aceptado + razonamiento_libre returns valid LoopOutcome)
   - **NO ejecutar en CI por default** — gated por env var. Pero ejecutable localmente.
   - Smoke check separa entre "API funciona end-to-end" (lo que H-1 pidió) y "test correctness" (lo que mocks ya cubren).

D-7 (compatibility check ANTES de implementar) y D-8 (research mini con test puntual) ya se hicieron en RESEARCH. Este Plan ejecuta el outcome.

D-10 modificada: schema re-shape obligatorio (no era parte del plan original "Opción A migración mínima" — H-1 lo descubrió).

Output: schema flat compatible con todos los providers + validación post-hoc + consumer adaptado + 2 tests E2E reales (gated).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-loopoutcome-flat-norecord.ts
@src/lib/agents/somnio-v4/sub-loop/output-schema.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
@src/lib/agents/somnio-v4/somnio-v4-agent.ts
</context>

<interfaces>
<!-- Current LoopOutcomeSchema (Anthropic SDK directo, never tested E2E) -->
```typescript
// from src/lib/agents/somnio-v4/sub-loop/output-schema.ts (CURRENT — to be REPLACED)
export const LoopOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('template'),
    responseTemplate: z.string(),
    extraContext: z.record(z.string(), z.string()).optional(),  // REMOVE
    requiresHuman: z.literal(false),                            // REPLACE with z.boolean()
    reason: z.string(),
  }),
  z.object({
    status: z.literal('canonical'),
    canonicalText: z.string(),
    sourceTopic: z.string(),
    nuncaDecirRules: z.array(z.string()).optional(),  // REPLACE with .nullable()
    requiresHuman: z.literal(false),                  // REPLACE with z.boolean()
    reason: z.string(),
  }),
  z.object({
    status: z.literal('no_match'),
    responseTemplate: z.literal('handoff_humano'),
    requiresHuman: z.literal(true),                   // REPLACE with z.boolean()
    reason: z.string(),
    knowledgeQueried: z.array(z.string()),
  }),
])
```

<!-- Target shape (D-29) -->
```typescript
export const LoopOutcomeSchema = z.object({
  status: z.enum(['template', 'canonical', 'no_match']),
  // canonical fields (nullable)
  canonicalText: z.string().nullable(),
  sourceTopic: z.string().nullable(),
  nuncaDecirRules: z.array(z.string()).nullable(),
  // template fields (nullable)
  responseTemplate: z.string().nullable(),
  // no_match fields (nullable)
  knowledgeQueried: z.array(z.string()).nullable(),
  // common
  requiresHuman: z.boolean(),
  reason: z.string(),
})
```

<!-- Sub-loop entrypoint (consumer adaptation point) -->
```typescript
// from src/lib/agents/somnio-v4/sub-loop/index.ts:73 (CURRENT)
if (output.status === 'canonical') {
  const rules = output.nuncaDecirRules ?? []  // discriminator narrowing implicit
  // ...
}
// Tras flat: output.canonicalText, output.sourceTopic, output.nuncaDecirRules son nullable.
// El check `if (output.status === 'canonical')` sigue válido pero TypeScript ya no infiere
// que estos campos son string. Hay que añadir null guards explícitos.
```

<!-- somnio-v4-agent.ts mapOutcomeToAgentOutput (consumer del LoopOutcome) -->
```typescript
// from src/lib/agents/somnio-v4/somnio-v4-agent.ts (uses output.status branches)
// Plan 02 must adapt narrowing in mapOutcomeToAgentOutput function.
```
</interfaces>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Re-shape LoopOutcomeSchema + extraContext audit + unit test schema</name>
  <files>src/lib/agents/somnio-v4/sub-loop/output-schema.ts, src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (current discriminated union)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-loopoutcome-flat-norecord.ts (working flat shape from RESEARCH)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-29 — re-shape obligatorio)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§LoopOutcomeSchema results table + §H-2)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (current consumer)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (current consumer del outcome)
  </read_first>
  <behavior>
    - Test 1: schema parses valid 'canonical' output { status:'canonical', canonicalText:'X', sourceTopic:'Y', nuncaDecirRules:['z'], responseTemplate:null, knowledgeQueried:null, requiresHuman:false, reason:'r' }
    - Test 2: schema parses valid 'template' output { status:'template', responseTemplate:'saludo', canonicalText:null, sourceTopic:null, nuncaDecirRules:null, knowledgeQueried:null, requiresHuman:false, reason:'r' }
    - Test 3: schema parses valid 'no_match' output { status:'no_match', responseTemplate:'handoff_humano', knowledgeQueried:['t1','t2'], canonicalText:null, sourceTopic:null, nuncaDecirRules:null, requiresHuman:true, reason:'r' }
    - Test 4: schema rejects status not in enum ('foo')
    - Test 5: schema rejects requiresHuman not boolean (string 'yes')
    - Test 6: schema accepts mixed nullable fields (no failure on optional fields being null)
    - Test 7 (invariants helper): validateLoopOutcomeInvariants returns {ok:true} for valid 'canonical' with canonicalText non-null
    - Test 8 (invariants helper): validateLoopOutcomeInvariants returns {ok:false, violation: 'canonical_missing_canonicalText'} when status='canonical' && canonicalText === null
    - Test 9 (invariants helper): validateLoopOutcomeInvariants returns {ok:false} when status='no_match' && requiresHuman === false
    - Test 10 (invariants helper): validateLoopOutcomeInvariants returns {ok:false} when status='template' && responseTemplate === null
  </behavior>
  <action>
**A) Audit `extraContext` consumption (sub-task pre-shape):**

```bash
grep -rn "extraContext" src/lib/agents/somnio-v4/ src/app/ src/inngest/ src/lib/sandbox/ 2>/dev/null | grep -v "__tests__\|/test-"
```

Si `extraContext` NO se consume en ningún lugar fuera del schema → ELIMINARLO por completo del shape nuevo (decisión preferida — schema más simple).
Si SÍ se consume → reemplazarlo con campos pre-definidos nullable (ej: `extraNombre: z.string().nullable(), extraDireccion: z.string().nullable(), extraTelefono: z.string().nullable()`).

Documentar la decisión en el SUMMARY.md (Task 1 outcome: "eliminado" vs "reemplazado por campos X/Y/Z").

**B) Reescribir `src/lib/agents/somnio-v4/sub-loop/output-schema.ts`:**

```typescript
import { z } from 'zod'

/**
 * LoopOutcome — output del sub-loop AI SDK v6 (D-29 RE-SHAPE post-RESEARCH H-1).
 *
 * Schema flat (sin discriminated union) compatible con todos los providers:
 * - OpenAI GPT-4o mini (D-30 — sub-loop usa GPT por tools+Output.object)
 * - Gemini 2.5 Flash-Lite (D-30 — comprehension + nunca-decir)
 * - Anthropic Haiku (futuros calls que no requieran tools+Output.object)
 *
 * INVARIANTES (enforced post-hoc en sub-loop/index.ts vía validateLoopOutcomeInvariants):
 * - status='canonical' → canonicalText !== null && sourceTopic !== null
 * - status='template'  → responseTemplate !== null
 * - status='no_match'  → responseTemplate === 'handoff_humano' && requiresHuman === true && knowledgeQueried !== null
 *
 * D-50: 'canonical' = verbatim de la sección "## Respuesta canónica" del KB doc.
 * D-57: 'no_match' siempre handoff_humano + requiresHuman=true.
 * D-62: SIN variante de texto libre (anti-hallucination). El status se enforca
 *       por Output.object() schema enum, NO por toolChoice.
 *
 * RESEARCH H-1: el schema previo (z.discriminatedUnion + z.literal(false) + z.record)
 * NUNCA corrió contra API real — todos los providers lo rechazan.
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 02.
 */
export const LoopOutcomeSchema = z.object({
  status: z.enum(['template', 'canonical', 'no_match'])
    .describe('Discriminator del outcome del sub-loop'),

  // canonical fields (nullable cuando status !== 'canonical')
  canonicalText: z.string().nullable()
    .describe('Verbatim de "## Respuesta canónica" del KB doc — solo en status=canonical'),
  sourceTopic: z.string().nullable()
    .describe('Topic del KB doc fuente — solo en status=canonical'),
  nuncaDecirRules: z.array(z.string()).nullable()
    .describe('Reglas "NUNCA decir" del KB doc para validación post-gen — solo en status=canonical'),

  // template fields (nullable cuando status !== 'template' && !== 'no_match')
  responseTemplate: z.string().nullable()
    .describe('Intent template (status=template) o "handoff_humano" (status=no_match)'),

  // no_match fields (nullable cuando status !== 'no_match')
  knowledgeQueried: z.array(z.string()).nullable()
    .describe('Topics consultados sin match — solo en status=no_match (D-58 doble logging)'),

  // común a todos los status
  requiresHuman: z.boolean()
    .describe('true solo en status=no_match (enforced post-hoc por validateLoopOutcomeInvariants)'),
  reason: z.string()
    .describe('Razón del outcome — observability + debugging'),
})

export type LoopOutcome = z.infer<typeof LoopOutcomeSchema>

export type SubLoopReason =
  | 'low_confidence'
  | 'crm_mutation'
  | 'cas_reject'
  | 'razonamiento_libre'

/**
 * Helper de validación post-hoc — enforca invariantes que el schema flat no captura.
 *
 * Se llama en sub-loop/index.ts antes de retornar el LoopOutcome al consumer.
 * Si invariante roto → no_match override con reason explicativo (escalación suave a handoff).
 */
export function validateLoopOutcomeInvariants(output: LoopOutcome): {
  ok: boolean
  violation?: string
} {
  if (output.status === 'canonical') {
    if (output.canonicalText === null) return { ok: false, violation: 'canonical_missing_canonicalText' }
    if (output.sourceTopic === null) return { ok: false, violation: 'canonical_missing_sourceTopic' }
    if (output.requiresHuman !== false) return { ok: false, violation: 'canonical_requiresHuman_must_be_false' }
  }
  if (output.status === 'template') {
    if (output.responseTemplate === null) return { ok: false, violation: 'template_missing_responseTemplate' }
    if (output.requiresHuman !== false) return { ok: false, violation: 'template_requiresHuman_must_be_false' }
  }
  if (output.status === 'no_match') {
    if (output.responseTemplate !== 'handoff_humano') return { ok: false, violation: 'no_match_responseTemplate_must_be_handoff_humano' }
    if (output.requiresHuman !== true) return { ok: false, violation: 'no_match_requiresHuman_must_be_true' }
    if (output.knowledgeQueried === null) return { ok: false, violation: 'no_match_missing_knowledgeQueried' }
  }
  return { ok: true }
}
```

**C) Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts`:**

10 tests cubriendo el `<behavior>` block. Usa Vitest (mismo runner que el resto del proyecto). Patrón:

```typescript
import { describe, it, expect } from 'vitest'
import { LoopOutcomeSchema, validateLoopOutcomeInvariants } from '../output-schema'

describe('LoopOutcomeSchema (Plan 02 re-shape — D-29)', () => {
  it('parses valid canonical output', () => {
    const valid = {
      status: 'canonical',
      canonicalText: 'Verbatim del KB',
      sourceTopic: 'precios',
      nuncaDecirRules: ['no prometer descuentos'],
      responseTemplate: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'KB hit precios',
    }
    expect(LoopOutcomeSchema.safeParse(valid).success).toBe(true)
  })

  // ... 9 more tests as listed in <behavior>
})

describe('validateLoopOutcomeInvariants', () => {
  // 4 tests covering invariant cases
})
```

Ejecutar:
```bash
npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts
```

Esperar 10/10 PASS antes de cerrar la task.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/output-schema.test.ts --reporter=verbose 2>&1 | tail -10 | grep -qE "10 passed|Test Files\s+1 passed" && grep -q "z.object({" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "z.enum(\['template', 'canonical', 'no_match'\])" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && grep -q "validateLoopOutcomeInvariants" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && ! grep -q "z.discriminatedUnion" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && ! grep -q "z.literal(false)" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && ! grep -q "z.literal(true)" src/lib/agents/somnio-v4/sub-loop/output-schema.ts && ! grep -q "z.record" src/lib/agents/somnio-v4/sub-loop/output-schema.ts</automated>
  </verify>
  <acceptance_criteria>
    - `output-schema.ts` no contiene `z.discriminatedUnion`
    - `output-schema.ts` no contiene `z.literal(false)` ni `z.literal(true)`
    - `output-schema.ts` no contiene `z.record(`
    - `output-schema.ts` exporta `validateLoopOutcomeInvariants`
    - 10 tests pasan (`output-schema.test.ts`)
    - `git diff src/lib/agents/somnio-v3/sub-loop/output-schema.ts` no aplica (v3 no tiene esa carpeta — verificable por ausencia)
    - Decisión documentada en SUMMARY: extraContext eliminado vs reemplazado
  </acceptance_criteria>
  <done>Schema flat shipped + 10 tests verdes + invariants helper exportado.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire validación post-hoc en sub-loop/index.ts + adaptar consumer somnio-v4-agent.ts</name>
  <files>src/lib/agents/somnio-v4/sub-loop/index.ts, src/lib/agents/somnio-v4/somnio-v4-agent.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (current 112 lines)
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (post-Task 1 — flat schema + invariants helper)
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (lines 130-200 = mapOutcomeToAgentOutput area + earlier outcome usages)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-29 invariantes section)
  </read_first>
  <behavior>
    - Test 1 (sub-loop/index.ts): runSubLoop con LLM mock retornando { status:'canonical', canonicalText:null, sourceTopic:'X', ... } (invariante violado) → función retorna LoopOutcome con status='no_match', requiresHuman=true, reason starting with 'invariant_violation:'
    - Test 2 (sub-loop/index.ts): runSubLoop con LLM mock retornando un LoopOutcome válido y compliant → función retorna ese mismo LoopOutcome sin override
    - Test 3 (somnio-v4-agent.ts mapOutcomeToAgentOutput): output.status==='canonical' && output.canonicalText !== null → V4AgentOutput.messages contiene canonicalText
    - Test 4 (somnio-v4-agent.ts mapOutcomeToAgentOutput): output.status==='canonical' && output.canonicalText === null (defensive — should not occur post-validate) → V4AgentOutput.requiresHuman=true
  </behavior>
  <action>
**A) Update `src/lib/agents/somnio-v4/sub-loop/index.ts`:**

Después de la línea `const { output } = await runWithPurpose('subloop', () => generateText({ ... }))` (alrededor de línea 70):

1. Importar `validateLoopOutcomeInvariants` del output-schema.
2. Validar invariantes ANTES del NUNCA-decir check:

```typescript
import { LoopOutcomeSchema, validateLoopOutcomeInvariants, type LoopOutcome, type SubLoopReason } from './output-schema'

// ...después del generateText:

// D-29: validación post-hoc del shape flat — el schema flat permite combinaciones inválidas
// (ej: status='canonical' con canonicalText=null) que el discriminated union evitaba.
// Si invariante roto → escalar suave a no_match (consistent con D-57).
const invariantCheck = validateLoopOutcomeInvariants(output)
if (!invariantCheck.ok) {
  getCollector()?.recordEvent('pipeline_decision', 'subloop_invariant_violation', {
    agent: SOMNIO_V4_AGENT_ID,
    reason: args.reason,
    violation: invariantCheck.violation ?? 'unknown',
    rawStatus: output.status,
  })
  const escalated: LoopOutcome = {
    status: 'no_match',
    responseTemplate: 'handoff_humano',
    canonicalText: null,
    sourceTopic: null,
    nuncaDecirRules: null,
    knowledgeQueried: [],
    requiresHuman: true,
    reason: `invariant_violation: ${invariantCheck.violation ?? 'unspecified'}`,
  }
  return escalated
}

// D-51: post-gen NUNCA-decir check solo en outcome 'canonical' (D-50 verbatim KB).
if (output.status === 'canonical') {
  // ⬇ canonicalText is now string|null per flat schema. Already guarded by invariantCheck.
  // We can safely assert non-null here.
  const canonicalText = output.canonicalText!
  const sourceTopic = output.sourceTopic!
  const rules = output.nuncaDecirRules ?? []
  const check = await checkNuncaDecir({
    candidateText: canonicalText,
    nuncaDecirRules: rules,
  })
  if (!check.ok) {
    const escalated: LoopOutcome = {
      status: 'no_match',
      responseTemplate: 'handoff_humano',
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      knowledgeQueried: [sourceTopic],
      requiresHuman: true,
      reason: `nunca_decir_violation: ${check.violation ?? 'unspecified'}`,
    }
    getCollector()?.recordEvent('pipeline_decision', 'subloop_nunca_decir_violation', {
      agent: SOMNIO_V4_AGENT_ID,
      reason: args.reason,
      sourceTopic,
      violation: check.violation ?? null,
    })
    return escalated
  }
}

getCollector()?.recordEvent('pipeline_decision', 'subloop_completed', {
  agent: SOMNIO_V4_AGENT_ID,
  reason: args.reason,
  outcome: output.status,
  sourceTopic: output.status === 'canonical' ? output.sourceTopic : null,
  requiresHuman: output.requiresHuman,
})

return output
```

Eliminar el código duplicado de la versión anterior. Mantener `runWithPurpose('subloop', ...)`, `import { generateText, Output, stepCountIs }`, `import { anthropic } from '@ai-sdk/anthropic'`. Plan 05 cambiará el `anthropic('claude-haiku-4-5-20251001')` a `openai('gpt-4o-mini')` — Plan 02 deja el modelo Anthropic intacto (los tests E2E del Task 3 abajo ya prueban con OpenAI temporalmente — o pueden usar Anthropic si la key sigue cargando schema flat sin oneOf).

**Nota anti-regression:** el código actual de sub-loop/index.ts (líneas 73-100) usa el discriminator narrowing — al cambiar a flat, los `output.canonicalText` y `output.sourceTopic` son `string | null`. El non-null assertion (`!`) post-invariantCheck es seguro porque ya pasamos por validateLoopOutcomeInvariants. Si en futuro alguien remueve el invariantCheck, TypeScript no se quejará pero el código fallaría en runtime — añade comentario explicativo.

**B) Update `src/lib/agents/somnio-v4/somnio-v4-agent.ts`:**

Buscar todas las referencias al `LoopOutcome` post-`runSubLoop` (alrededor de líneas 156-188 y 316-348). El consumer actual probablemente hace narrowing implícito por TypeScript. Tras el flat schema, hay que añadir null guards explícitos.

Buscar `mapOutcomeToAgentOutput` y adaptar:
- `if (outcome.status === 'canonical')` con `outcome.canonicalText` ahora `string | null` → si null, retornar V4AgentOutput con `requiresHuman: true` (defensive — si invariantCheck falla en sub-loop, ya no llegaría así, pero si llega = bug → escalate). Comentario: "// Plan 02: defensive null check — invariantCheck en sub-loop ya enforca esto pero null-guard mantiene type safety + protección defensiva si código se cambia"
- Casos análogos para `responseTemplate`, `knowledgeQueried`

**Verificación de cero regressions a otros agentes (W-3 fix — comparar contra `origin/main` baseline, no working tree):**

```bash
# W-3 baseline check: compara HEAD del branch contra el commit base de main del que el standalone se ramificó.
# Esto evita falsos verdes si los archivos de otros agentes ya tienen ediciones unstaged en el working tree
# (solo asegura que ESTE plan no introdujo edits — consistente con Plan 08 Task 3 que ya usa origin/main).
git fetch origin main --quiet 2>/dev/null || true
git diff origin/main -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ 2>/dev/null
# expect: empty (esos agentes no tienen sub-loop y este plan no los toca)
```

Adicional sanidad (sin baseline — útil si la rama tiene commits previos no relacionados):
```bash
grep -rn "extraContext\|z\.discriminatedUnion.*status" src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ 2>/dev/null
# expect: 0 matches (esos agentes no tienen sub-loop)
```

**C) Tests unit del adapter:**

Crear o ampliar tests en `src/lib/agents/somnio-v4/__tests__/` cubriendo el comportamiento descrito en `<behavior>`.

Ejecutar:
```bash
npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/ src/lib/agents/somnio-v4/__tests__/ 2>&1 | tail -10
npx tsc --noEmit 2>&1 | grep -E "somnio-v4" | head -20
```

Esperar todos los tests verdes + tsc sin errores nuevos en somnio-v4.
  </action>
  <verify>
    <automated>grep -q "validateLoopOutcomeInvariants" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "invariant_violation" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -q "subloop_invariant_violation" src/lib/agents/somnio-v4/sub-loop/index.ts && [ -z "$(git diff origin/main -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ 2>/dev/null)" ] && npx tsc --noEmit 2>&1 | grep -E "somnio-v4/(sub-loop|somnio-v4-agent)" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `sub-loop/index.ts` importa `validateLoopOutcomeInvariants`
    - `sub-loop/index.ts` invoca `validateLoopOutcomeInvariants(output)` post-generateText
    - Si `!invariantCheck.ok` → emite `pipeline_decision:subloop_invariant_violation` event y retorna LoopOutcome con status='no_match' + reason starting with 'invariant_violation:'
    - `somnio-v4-agent.ts` añade null guards en `outcome.canonicalText`, `outcome.responseTemplate`, `outcome.knowledgeQueried`
    - `npx tsc --noEmit` no reporta errores en somnio-v4
    - **`git diff origin/main -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ ...` vacío (W-3 baseline check, consistente con Plan 08)**
    - Tests unit del adapter pasan
  </acceptance_criteria>
  <done>Sub-loop con post-hoc validation + consumer adaptado + tests verdes + Regla 6 verificada contra baseline origin/main.</done>
</task>

<task type="auto">
  <name>Task 3: E2E test contra GPT-4o mini real (replaces mocks per H-1)</name>
  <files>src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (post-Task 2)
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts (post-Task 1)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§H-1, §test-loopoutcome-flat-norecord results)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/research-scripts/test-loopoutcome-flat-norecord.ts (working pattern)
  </read_first>
  <action>
H-1 hallazgo crítico: el sub-loop NUNCA corrió contra API real (todos los tests son mocks). Este test E2E es el primer "paint hits the canvas" del sub-loop con un schema flat válido.

**Crear `src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts`:**

```typescript
import { describe, it, expect } from 'vitest'
import { generateText, Output, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { LoopOutcomeSchema, validateLoopOutcomeInvariants } from '../output-schema'

/**
 * Plan 02 Task 3 — E2E test del LoopOutcomeSchema contra GPT-4o mini real.
 *
 * RESEARCH H-1: el schema previo (z.discriminatedUnion + z.literal) NUNCA corrió
 * contra API real — todos los providers lo rechazan. Tras D-29 re-shape, este
 * test prueba que el schema flat ES aceptado por GPT-4o mini (modelo target del
 * sub-loop per D-30).
 *
 * Skipea cuando OPENAI_API_KEY_SALESV4 no está seteada (CI sin secret leak).
 * Para correr local: export OPENAI_API_KEY_SALESV4=sk-... && npx vitest run
 *
 * Standalone: somnio-sales-v4-runtime-wiring / Plan 02.
 */
describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4)(
  'sub-loop E2E (real GPT-4o mini)',
  () => {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY_SALESV4 })

    it('schema flat is accepted by GPT-4o mini (no oneOf rejection)', async () => {
      const { output } = await generateText({
        model: openai('gpt-4o-mini'),
        system:
          'Return a LoopOutcome object. Use status=template with responseTemplate="saludo" for friendly greetings.',
        messages: [{ role: 'user', content: 'hola, como estas?' }],
        output: Output.object({ schema: LoopOutcomeSchema }),
      })

      // Schema validation passed if we got here without throw
      expect(output.status).toMatch(/^(template|canonical|no_match)$/)
      expect(typeof output.requiresHuman).toBe('boolean')
      expect(typeof output.reason).toBe('string')

      // Invariants pass post-hoc
      const invariantCheck = validateLoopOutcomeInvariants(output)
      expect(invariantCheck.ok).toBe(true)
    }, 30000) // 30s timeout — first call cold

    it('handles "razonamiento_libre" reason returning no_match', async () => {
      const { output } = await generateText({
        model: openai('gpt-4o-mini'),
        system:
          'You are a sales agent. If the user asks something philosophical or off-topic, return status=no_match with responseTemplate="handoff_humano", requiresHuman=true, knowledgeQueried=[]. Otherwise return appropriate template/canonical.',
        messages: [
          { role: 'user', content: 'cual es el sentido de la vida?' },
        ],
        output: Output.object({ schema: LoopOutcomeSchema }),
      })

      expect(output.status).toBeDefined()
      // Could be no_match (preferred per system prompt) or any other valid status — schema accepts all
      const invariantCheck = validateLoopOutcomeInvariants(output)
      expect(invariantCheck.ok).toBe(true)
    }, 30000)
  }
)

describe('LoopOutcomeSchema syntactic validation (no API)', () => {
  it('accepts flat shape without z.record / z.literal', () => {
    const valid = {
      status: 'template' as const,
      responseTemplate: 'saludo',
      canonicalText: null,
      sourceTopic: null,
      nuncaDecirRules: null,
      knowledgeQueried: null,
      requiresHuman: false,
      reason: 'OK',
    }
    expect(LoopOutcomeSchema.safeParse(valid).success).toBe(true)
  })
})
```

**Ejecutar:**

```bash
# Sin env var (skip path):
npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
# expect: tests skipped (RUN.skip), 1 syntactic test passes

# Con env var (full E2E):
OPENAI_API_KEY_SALESV4=$(grep OPENAI_API_KEY_SALESV4 .env.local | cut -d= -f2) \
  npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts
# expect: 3 tests pass (2 E2E + 1 syntactic)
```

**Nota:** si la env var no está seteada localmente para el ejecutor → ejecutar SOLO el path skip (verificar 1 syntactic test passing). Documentar en SUMMARY.md que el ejecutor del plan corrió:
- (caso A) skipped path con 1 syntactic green, O
- (caso B) full E2E con 3/3 green
  </action>
  <verify>
    <automated>test -f src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts && grep -q "describe.skipIf" src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts && grep -q "OPENAI_API_KEY_SALESV4" src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts && grep -q "createOpenAI" src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts && grep -q "validateLoopOutcomeInvariants" src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts && npx vitest run src/lib/agents/somnio-v4/sub-loop/__tests__/sub-loop-e2e.test.ts 2>&1 | tail -5 | grep -qE "passed|skipped"</automated>
  </verify>
  <acceptance_criteria>
    - Archivo `sub-loop-e2e.test.ts` existe
    - Test usa `describe.skipIf(!process.env.OPENAI_API_KEY_SALESV4)` (anti CI break)
    - Test importa `createOpenAI` de `@ai-sdk/openai`
    - Test usa `validateLoopOutcomeInvariants` para verificar el output del LLM
    - Vitest exit code 0 (con skipped o passed — ambos son válidos)
    - 1 syntactic test (sin API) pasa siempre
    - **2 tests E2E reales en el bloque skipIf (al menos 2 llamadas reales a GPT-4o mini cuando env var presente — N-2 fix)**
  </acceptance_criteria>
  <done>E2E test E2E creado y verificado (skipped si no env, passed si env presente).</done>
</task>

</tasks>

<verification>
- LoopOutcomeSchema flat compila + 10 unit tests verdes
- Sub-loop con validación post-hoc + invariant_violation event
- Consumer somnio-v4-agent.ts adaptado a nullable fields
- E2E test contra API real (gated por env var) — al menos 2 llamadas reales en skipIf path
- Cero regresiones en somnio-v3/godentist/recompra/pw-confirmation (Regla 6 — verificada via `git diff origin/main`, W-3 fix)
- `npx tsc --noEmit` clean en somnio-v4/
</verification>

<success_criteria>
- Plan 04 (webhook branch) puede deployar v4 con sub-loop sin temer al schema rejection
- Plan 05 (model swap a GPT-4o mini) tendrá schema portable
- Plan 07 (Smoke A sandbox) podrá disparar sub-loop con confidence baja y obtener LoopOutcome válido
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/02-SUMMARY.md` con:
- Decisión sobre extraContext: eliminado o reemplazado (con campos)
- 10 tests unit del schema (lista de cases cubiertos)
- Outcome E2E: skipped o passed con outputs reales
- Cualquier divergencia hallada vs el plan
</output>
</output>
