---
plan: 12
phase: somnio-sales-v4
wave: 6
depends_on: [06, 07, 08, 09, 10, 11]
files_modified:
  - src/app/(dashboard)/agentes/routing/editor/page.tsx
  - src/lib/agents/production/webhook-processor.ts
  - src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts
  - src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts
addresses_decisions: [D-13, D-22, D-24, D-25, D-32, D-34, D-77]
addresses_research_pitfalls: []
autonomous: false
estimated_tasks: 4
must_haves:
  truths:
    - "src/app/(dashboard)/agentes/routing/editor/page.tsx importa @/lib/agents/somnio-v4 (registry self-register)"
    - "src/lib/agents/production/webhook-processor.ts pre-warm Promise.all incluye import('../somnio-v4')"
    - "Dropdown del routing editor muestra 'somnio-sales-v4' como opción"
    - "Integration test sub-loop-happy.test.ts pasa (mock KB → outcome canonical o template)"
    - "Integration test sub-loop-no-match.test.ts pasa (KB sin hits → outcome no_match + handoff_humano)"
    - "Smoke test manual /sandbox con somnio-v4 produce respuesta válida"
    - "ZERO tráfico productivo a v4 todavía — Regla 6 satisfecha por ausencia de routing rule (D-25, D-32)"
  artifacts:
    - path: "src/app/(dashboard)/agentes/routing/editor/page.tsx"
      provides: "Routing editor incluye v4 como opción"
    - path: "src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts"
      provides: "Integration test del sub-loop con mock KB"
  key_links:
    - from: "Routing editor dropdown"
      to: "agentRegistry.list()"
      via: "import side-effect"
      pattern: "import '@/lib/agents/somnio-v4'"
    - from: "Webhook processor pre-warm"
      to: "agentRegistry contains 'somnio-sales-v4'"
      via: "Promise.all import dynamic"
      pattern: "import\\('\\.\\./somnio-v4'\\)"
---

<objective>
Wave 5 — pre-flip wiring + pre-flip QA.

Antes del flip Plan 13, v4 debe estar:
1. Self-registered en agentRegistry (vía import side-effects en routing-editor + webhook-processor)
2. Visible en el dropdown del routing-editor (smoke manual)
3. Con integration tests del sub-loop pasando (D-77 — correctness, NO calibración)
4. Smoke test E2E en `/sandbox` confirmado por usuario

Cero tráfico productivo se introduce — la regla en `routing_rules` la inserta el Plan 13.

Output: 2 archivos modificados (1-2 líneas cada uno) + 2 integration tests + 1 commit + smoke checkpoint.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4/CONTEXT.md
@.planning/standalone/somnio-sales-v4/PATTERNS.md
@src/app/(dashboard)/agentes/routing/editor/page.tsx
@src/lib/agents/production/webhook-processor.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
@src/lib/agents/somnio-v4/sub-loop/output-schema.ts
</context>

<interfaces>
<!-- Routing editor (PATTERNS sección "src/app/(dashboard)/agentes/routing/editor/page.tsx") -->
Líneas 25-30 ya tienen:
```typescript
import '@/lib/agents/somnio-recompra'
import '@/lib/agents/somnio-v3'
import '@/lib/agents/somnio'
import '@/lib/agents/godentist'
import '@/lib/agents/somnio-pw-confirmation'
```
Agregar 1 línea: `import '@/lib/agents/somnio-v4'`.

<!-- Webhook processor pre-warm (PATTERNS sección "webhook-processor.ts") -->
Líneas 225-231:
```typescript
await Promise.all([
  import('../somnio-recompra'),
  import('../somnio-v3'),
  import('../somnio'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
])
```
Agregar 1 línea: `import('../somnio-v4'),`.

NO hay branch especial para v4 (D-16 no preload). El routing engine genérico despacha cuando el routing_rule emite `agent_id='somnio-sales-v4'` (Plan 13).
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Modificar routing-editor + webhook-processor (1-2 líneas cada uno)</name>
  <files>src/app/(dashboard)/agentes/routing/editor/page.tsx, src/lib/agents/production/webhook-processor.ts</files>
  <read_first>
    - src/app/(dashboard)/agentes/routing/editor/page.tsx (localizar el bloque de imports side-effect)
    - src/lib/agents/production/webhook-processor.ts (localizar el Promise.all pre-warm — líneas ~225-231)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (secciones de modificaciones)
  </read_first>
  <action>
**A) `src/app/(dashboard)/agentes/routing/editor/page.tsx`:**

Localizar el bloque de imports side-effect (alrededor de líneas 25-30). Agregar UNA línea:
```typescript
import '@/lib/agents/somnio-v4' // Standalone: somnio-sales-v4 (D-13)
```

Mantener el orden alfabético si los demás están ordenados, o agregar al final del bloque si no.

**B) `src/lib/agents/production/webhook-processor.ts`:**

Localizar el `Promise.all` pre-warm (alrededor de líneas 225-231). Agregar UNA línea dentro del array:
```typescript
import('../somnio-v4'),  // Standalone: somnio-sales-v4 (D-13, D-16 — sin preload branch)
```

NO agregar branch especial — D-16 dice no preload de CRM context. El webhook routing genérico maneja v4 igual que v3.

Verificar que `pnpm typecheck` y `pnpm build` pasan.
  </action>
  <verify>
    <automated>grep -q "import '@/lib/agents/somnio-v4'" "src/app/(dashboard)/agentes/routing/editor/page.tsx" && grep -q "import('../somnio-v4')" src/lib/agents/production/webhook-processor.ts</automated>
  </verify>
  <acceptance_criteria>
    - 1 línea agregada en routing/editor/page.tsx
    - 1 línea agregada en webhook-processor.ts (dentro del Promise.all)
    - `pnpm typecheck` y `pnpm build` ok
  </acceptance_criteria>
  <done>v4 self-register wired.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Integration tests sub-loop happy + no_match</name>
  <files>src/__tests__/integration/somnio-v4/sub-loop-happy.test.ts, src/__tests__/integration/somnio-v4/sub-loop-no-match.test.ts</files>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts
    - src/lib/agents/somnio-v4/sub-loop/output-schema.ts
    - src/lib/agents/somnio-v4/sub-loop/tools.ts
    - .planning/standalone/somnio-sales-v4/CONTEXT.md (D-77 correctness, NO calibración)
    - .planning/standalone/somnio-sales-v4/RESEARCH.md (Validation Architecture)
  </read_first>
  <behavior>
    sub-loop-happy.test.ts:
    - Setup: mock match_knowledge_base RPC para retornar 1 hit con `topic='precio_comparativo'` y canonical_response que dice "Nuestro ELIXIR..."
    - Setup: mock OpenAI generateEmbedding (return zeros vector — no llama API real)
    - Setup: mock Anthropic generateText (return outcome `{ status: 'canonical', canonicalText: '...', sourceTopic: 'precio_comparativo', requiresHuman: false, reason: 'kb_match' }`)
    - Test 1: runSubLoop({reason:'low_confidence', ctx:{...}}) returns outcome con status='canonical' y sourceTopic='precio_comparativo'
    - Test 2: si la canonical text es PII-clean (no contiene phones/emails), checkNuncaDecir devuelve ok=true y outcome se preserva

    sub-loop-no-match.test.ts:
    - Setup: mock match_knowledge_base RPC para retornar 0 hits (array vacío)
    - Setup: mock Anthropic generateText return outcome `{ status: 'no_match', responseTemplate: 'handoff_humano', requiresHuman: true, reason: 'no_kb_match', knowledgeQueried: ['precio'] }`
    - Test 1: outcome.status === 'no_match'
    - Test 2: outcome.responseTemplate === 'handoff_humano'
    - Test 3: outcome.requiresHuman === true
    - Test 4: outcome.knowledgeQueried.length >= 1
  </behavior>
  <action>
**Aproximación de mocking:** vitest provee `vi.mock()`. Mock al nivel del módulo:
- `vi.mock('ai', () => ({ generateText: vi.fn(), Output: { object: vi.fn() }, stepCountIs: vi.fn(), tool: vi.fn() }))`
- `vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn(() => 'mock-model') }))`
- `vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ rpc: vi.fn(...) })) }))`
- `vi.mock('@/lib/observability', () => ({ runWithPurpose: (_, fn) => fn(), getCollector: () => null }))`

Estructura de cada test:

```typescript
// sub-loop-happy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks ANTES de imports
vi.mock('ai', async () => {
  const Output = { object: ({ schema }: any) => ({ schema }) }
  const generateText = vi.fn(async () => ({
    output: {
      status: 'canonical',
      canonicalText: 'Nuestro ELIXIR DEL SUEÑO combina melatonina + magnesio.',
      sourceTopic: 'precio_comparativo',
      nuncaDecirRules: [],
      requiresHuman: false,
      reason: 'kb_match',
    }
  }))
  return { generateText, Output, stepCountIs: () => null, tool: () => ({}) }
})
// ... resto de mocks

import { runSubLoop } from '@/lib/agents/somnio-v4/sub-loop'

describe('sub-loop happy path', () => {
  it('returns canonical outcome on KB hit', async () => {
    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: { workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490', conversationId: 'conv-1', sessionId: 'sess-1', userMessage: 'cuanto cuesta', recentMessages: [] }
    })
    expect(outcome.status).toBe('canonical')
    if (outcome.status === 'canonical') {
      expect(outcome.sourceTopic).toBe('precio_comparativo')
    }
  })
})
```

```typescript
// sub-loop-no-match.test.ts (similar shape, mock retorna no_match)
```

Ejecutar:
```bash
pnpm vitest run src/__tests__/integration/somnio-v4/
```
Ambos test files pasan.
  </action>
  <verify>
    <automated>pnpm vitest run src/__tests__/integration/somnio-v4/ --reporter=basic 2>&1 | grep -E "Test Files.*passed"</automated>
  </verify>
  <acceptance_criteria>
    - sub-loop-happy.test.ts: 2 tests pasan
    - sub-loop-no-match.test.ts: 4 tests pasan
    - Mocks aislados (no llamadas reales a Anthropic/OpenAI/Supabase)
  </acceptance_criteria>
  <done>Integration tests verdes.</done>
</task>

<task type="auto">
  <name>Task 3: Commit + push de wiring + tests</name>
  <files>(archivos del Plan 12 hasta este punto)</files>
  <read_first>
    - CLAUDE.md (Reglas 1, 4)
  </read_first>
  <action>
```bash
git add "src/app/(dashboard)/agentes/routing/editor/page.tsx" src/lib/agents/production/webhook-processor.ts src/__tests__/integration/somnio-v4/
git commit -m "feat(somnio-v4): plan-12 — pre-flip wiring (routing-editor + webhook pre-warm) + integration tests

- routing/editor/page.tsx: import '@/lib/agents/somnio-v4' (dropdown registry list)
- webhook-processor.ts: import('../somnio-v4') en Promise.all pre-warm (no branch — D-16 sin preload)
- Integration tests sub-loop:
  - sub-loop-happy.test.ts: 2 tests (canonical outcome con KB hit)
  - sub-loop-no-match.test.ts: 4 tests (no_match → handoff_humano + requiresHuman=true)

Pre-flip estado: v4 deployable, registrado en agentRegistry, visible en routing-editor.
SIN tráfico productivo todavía (D-25/D-32 — Regla 6 vía ausencia de routing_rule).

Standalone: somnio-sales-v4
Decisions: D-13, D-22, D-24, D-25, D-32, D-34, D-77

Co-Authored-By: Claude <noreply@anthropic.com>"
git push origin main
```
  </action>
  <verify>
    <automated>git log -1 --pretty=%s | grep -q "feat(somnio-v4): plan-12"</automated>
  </verify>
  <acceptance_criteria>
    - Commit + push completados
    - Vercel deploy ok
  </acceptance_criteria>
  <done>v4 deployado y registrado en runtime.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Smoke test manual del usuario en /sandbox + verify dropdown routing-editor</name>
  <what-built>
    v4 deployado a Vercel preview/prod, registrado en agentRegistry, integration tests pasando.
    Falta confirmar visualmente que funciona end-to-end con tráfico real (en sandbox, no en prod).
  </what-built>
  <how-to-verify>
**STOP — pre-flip QA del usuario (D-34).**

Pasos del usuario:

**A) Verificar dropdown routing-editor:**
1. Abrir `/agentes/routing-editor` en preview/prod
2. Confirmar que `somnio-sales-v4` aparece como opción en el dropdown de agent_id
3. NO crear regla todavía (eso es Plan 13)

**B) Smoke test en /sandbox:**
1. Abrir `/sandbox`
2. Seleccionar agent `somnio-sales-v4`
3. Workspace: Somnio
4. Enviar un mensaje universal-claro: `"hola, cuanto cuesta?"` → esperar respuesta de tipo template (no sub-loop, alta confidence)
5. Enviar un mensaje ambiguo: `"y mi tía dice que esto es magia"` → esperar escalación al sub-loop con outcome canonical o no_match
6. Enviar mensaje edge-case: `"estoy embarazada, puedo tomarlo?"` → esperar handoff humano (escalate_if del KB doc edge-cases/uso_en_embarazo.md)

**C) Verificar observability:**
1. Abrir el dashboard de observability (si existe panel UI; alternativa Supabase Studio):
```sql
SELECT event_type, payload
FROM agent_observability_events
WHERE agent_id = 'somnio-sales-v4'
ORDER BY created_at DESC LIMIT 20;
```
2. Confirmar eventos esperados:
   - `pipeline_decision:comprehension_completed` (con intent_confidence)
   - `pipeline_decision:subloop_low_confidence_invoked` (en mensaje ambiguo)
   - `pipeline_decision:subloop_completed` con outcome
   - Si edge-case: `pipeline_decision:handoff_low_confidence_fallback`

**D) Verificar UI unknown_cases:**
1. Tras el smoke con mensaje edge-case, abrir `/agentes/somnio-v4/unknown-cases`
2. Confirmar que el caso aparece en la lista "sin cluster" (status='pending')

**Criterios de éxito:**
- ✅ Dropdown muestra v4
- ✅ Sandbox responde sin errores
- ✅ Observability events tienen agent='somnio-sales-v4'
- ✅ Unknown case capturado en DB

Si algún paso falla, pedir al asistente que arregle ANTES de continuar al Plan 13 (flip).
Si todo ok, confirmar al asistente: "smoke v4 PASS — listo para flip" y continuar al Plan 13.
  </how-to-verify>
  <resume-signal>Usuario escribe "smoke v4 PASS — listo para flip"</resume-signal>
</task>

</tasks>

<verification>
- v4 visible en routing-editor dropdown
- Sandbox responde con templates y/o canonical
- Observability eventos correctos emitidos
- Unknown case path funcional
</verification>

<success_criteria>
- Usuario aprueba el smoke; estado pre-flip listo para Plan 13
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4/12-SUMMARY.md` con:
- Hash commit
- Resultado smoke (PASS/FAIL + qué se probó)
- Sample de observability events vistos en DB
</output>
