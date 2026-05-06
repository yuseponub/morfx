---
plan: 04
phase: somnio-sales-v4-runtime-wiring
wave: 3
depends_on: [01, 03]
files_modified:
  - src/lib/agents/production/webhook-processor.ts
addresses_decisions: [D-1, D-13, D-15]
addresses_research_pitfalls: [Pitfall 2 / B-001 cold-lambda race]
autonomous: true
estimated_tasks: 1
must_haves:
  truths:
    - "webhook-processor.ts tiene branch agentId === 'somnio-sales-v4' instantiando V4ProductionRunner"
    - "Branch v4 ADITIVO — branches v3/godentist/godentist-fb-ig/V1 default sin tocar (Regla 6)"
    - "Pre-warm import('../somnio-v4') ya presente en Promise.all del cold-start (línea 231 actual del padre)"
    - "Branch v4 hace await import('../somnio-v4') dentro del branch + await import('../engine/v4-production-runner') (anti-cold-lambda race — Pitfall 2 / B-001 — DYNAMIC IMPORT only, NO static `from` import)"
    - "getCollector()?.setRespondingAgentId('somnio-sales-v4') antes de processMessage (D-10/D-12 set-before-run)"
    - "logger.info confirma 'V4 agent processing complete' al cierre"
    - "Cero edits a branches v3, godentist, godentist-fb-ig (Regla 6)"
    - "npx tsc --noEmit sin errores nuevos en webhook-processor.ts"
  artifacts:
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Branch v4 productivo en webhook"
      contains: "agentId === 'somnio-sales-v4'"
  key_links:
    - from: "Webhook inbound WhatsApp Somnio post-flip (Plan 08)"
      to: "V4ProductionRunner.processMessage"
      via: "branch en webhook-processor.ts línea ~819"
      pattern: "if \\(agentId === 'somnio-sales-v4'\\)"
    - from: "V4ProductionRunner constructor"
      to: "somnio-v4 agent processMessage"
      via: "dynamic import + agentRegistry side-effect"
      pattern: "import\\('\\.\\./somnio-v4'\\)"
---

<objective>
Wave 3 — Branch productivo `agentId === 'somnio-sales-v4'` en `webhook-processor.ts`. Plan ADITIVO 100% (Regla 6).

Sin este branch, post-flip (Plan 08) los webhooks Somnio caen al `else` V1 path y v4 nunca se ejecuta — exactamente el bug que motivó este standalone.

**Plan paralelizable con Plan 05 en Wave 3:**
- Plan 04 (este) modifica SÓLO `webhook-processor.ts`
- Plan 05 modifica SÓLO `comprehension.ts`, `sub-loop/index.ts`, `sub-loop/nunca-decir-check.ts`
- Cero overlap de archivos → executor puede correr en paralelo

**Mecánica:**

1. **Insertar branch nuevo** entre el bloque `if (agentId === 'godentist-fb-ig')` (líneas 792-818) y el bloque `else { /* V1 path */ }` (línea 819+). El branch v4 debe estar ANTES del else final.

2. **Patrón EXACTO** copiado del bloque v3 (líneas 740-765) con substituciones:
   - `agentId === 'somnio-sales-v3'` → `agentId === 'somnio-sales-v4'`
   - `await import('../somnio-v3')` → `await import('../somnio-v4')`
   - `await import('../engine/v3-production-runner')` + `V3ProductionRunner` → `await import('../engine/v4-production-runner')` + `V4ProductionRunner`
   - `setRespondingAgentId('somnio-v3')` → `setRespondingAgentId('somnio-sales-v4')` (mantener literal igual al agent_id)
   - Logger message `'V3 agent processing complete'` → `'V4 agent processing complete'`
   - `agentModule` config: el v3 NO pasa `agentModule` explícito (default = 'somnio-v3'). Para v4, pasar `{ workspaceId, agentModule: 'somnio-v4' }` explícito por simetría con godentist branch.

3. **Pre-warm verification:** Confirmar que `await import('../somnio-v4')` ya está en el `Promise.all` cold-start del padre (líneas 226-235 del actual webhook-processor.ts):

```typescript
// Existing pre-warm block (Plan 12 padre — KEEP UNTOUCHED):
await Promise.all([
  import('../somnio'),
  import('../somnio-v3'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'),  // ← ya presente desde Plan 12 padre
  import('../godentist-fb-ig'),
])
```

Si el pre-warm `import('../somnio-v4')` NO está en Promise.all → AÑADIRLO. Anti-Pitfall 2 / B-001 cold-lambda race: si llega un webhook Somnio cuando lambda recién despertó, v4 podría no estar registrada cuando routing-engine valida agent_id, lo cual cae a fallback_legacy.

4. **Configuración del runner:** v3 no pasa `agentModule` (relies on default 'somnio-v3' del runner). Para v4, el V4ProductionRunner ya tiene default `agentModule ?? 'somnio-v4'` (Plan 01 Task 3). Pero pasar el literal explícito por simetría con godentist (línea 770) y godentist-fb-ig (línea 798) — consistencia stylistic + traceability en logs.

5. **Anti-regression checks (multiple):**

```bash
# Branches anteriores sin tocar:
grep -B1 -A 26 "if (agentId === 'somnio-sales-v3')" src/lib/agents/production/webhook-processor.ts | head -30
# expect: bloque idéntico al pre-Plan 04

grep -B1 -A 26 "if (agentId === 'godentist')" src/lib/agents/production/webhook-processor.ts | head -30
grep -B1 -A 26 "if (agentId === 'godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts | head -30

# else V1 path inmediatamente después del v4 branch:
grep -B 1 -A 15 "// V1 path — unchanged" src/lib/agents/production/webhook-processor.ts | head -20

# Orden de branches:
grep -n "if (agentId === '" src/lib/agents/production/webhook-processor.ts
# expect lines (orden):
#   ~740: somnio-sales-v3
#   ~766: godentist
#   ~792: godentist-fb-ig
#   ~819: somnio-sales-v4  ← NUEVO
#   else: V1 default
```

6. **Cero edits** a:
   - PW confirmation branch (líneas 311-410)
   - Recompra branch (líneas 444-700+ approx)
   - Routing engine logic (líneas 1-300+)
   - Pre-warm Promise.all (excepto añadir somnio-v4 si faltaba — VERIFICAR antes que ya esté)

7. **Type check:**

```bash
npx tsc --noEmit 2>&1 | grep -E "webhook-processor" | head -10
# expect: 0 errores
```

8. **Smoke imagined (NO ejecutar — Plan 07/08 lo hacen):**
   - Webhook llega con `routerDecidedAgentId = 'somnio-sales-v4'` → enters branch v4 → V4ProductionRunner.processMessage → somnio-v4 agent → respuesta.
   - Sin routing rule activa apuntando a v4 (que se crea en Plan 08 SQL flip), este branch nunca se ejecuta en prod por ahora — está dormido, esperando el flip. Esto es exactamente lo que queremos: deploy seguro sin afectar prod.

**Pitfall 2 / B-001 cold-lambda race (CLAUDE.md scope godentist-fb-ig):** documentado en CLAUDE.md cuando un agente sibling se añade. La solución es double pre-warm: (1) Promise.all al top-level handler, (2) await import dentro del branch al invocar. Plan 04 hereda el patrón. **Dynamic import ÚNICAMENTE** dentro del branch (consistente con godentist-fb-ig precedent que también usa dynamic import) — NO static `import { V4ProductionRunner } from ...` al top-level del archivo. (W-2 fix iter 1: el verify usa un patrón único `grep -qE` que solo acepta dynamic import; el `from '...'` static no es alternativa válida.)

Output: webhook con branch v4 inerte, listo para Plan 08 atomic flip que lo activa.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@src/lib/agents/production/webhook-processor.ts
@src/lib/agents/engine/v4-production-runner.ts
</context>

<interfaces>
<!-- Existing v3 branch — clone target -->
```typescript
// from src/lib/agents/production/webhook-processor.ts:740-765
if (agentId === 'somnio-sales-v3') {
  await import('../somnio-v3')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, { workspaceId })

  getCollector()?.setRespondingAgentId('somnio-v3')

  engineOutput = await runner.processMessage({
    sessionId: '',
    conversationId,
    contactId: contactId!,
    message: messageContent,
    workspaceId,
    history: [],
    phoneNumber: phone,
    messageTimestamp: input.messageTimestamp,
  })

  getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
    agentId,
    conversationId,
    contactId,
  })
  logger.info({ conversationId, agentId }, 'V3 agent processing complete')
}
```

<!-- Pre-warm Promise.all (already exists from Plan 12 padre) -->
```typescript
// from src/lib/agents/production/webhook-processor.ts:226-235
await Promise.all([
  import('../somnio'),
  import('../somnio-v3'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'),  // ← VERIFICAR que esté presente
  import('../godentist-fb-ig'),
])
```

<!-- Insertion point: after godentist-fb-ig branch, before else V1 -->
```typescript
// from src/lib/agents/production/webhook-processor.ts:818-819
    } else if (agentId === 'godentist-fb-ig') {
      /* ... 26 lines ... */
      logger.info({ conversationId, agentId }, 'GoDentist FB/IG sibling processing complete')
    } else {
      // V1 path — unchanged (default)
```

<!-- INSERT v4 branch BETWEEN line 818 (end of godentist-fb-ig) and line 819 (else V1) -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Insertar branch agentId === 'somnio-sales-v4' antes del else V1 default</name>
  <files>src/lib/agents/production/webhook-processor.ts</files>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts (lines 200-250 = pre-warm Promise.all; lines 720-840 = agent dispatch branches)
    - src/lib/agents/engine/v4-production-runner.ts (post-Plan 01)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-1, D-13, D-15)
    - .planning/standalone/somnio-sales-v4/PATTERNS.md (sección "webhook-processor" si aplica)
    - CLAUDE.md (Regla 6 — agentes en prod intocados)
  </read_first>
  <action>
**Paso 1 — Verificar pre-warm (línea ~231):**

```bash
grep -n "import('../somnio-v4')" src/lib/agents/production/webhook-processor.ts
```

Esperado: al menos 1 match en el bloque Promise.all (línea ~231 del archivo actual). Si NO está → añadirlo:

```typescript
await Promise.all([
  import('../somnio'),
  import('../somnio-v3'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'), // Standalone: somnio-sales-v4-runtime-wiring (Plan 04)
  import('../godentist-fb-ig'),
])
```

**Paso 2 — Insertar branch v4** entre el final del bloque godentist-fb-ig (línea 818, cierra con `logger.info(...) 'GoDentist FB/IG sibling processing complete'`) y el inicio del else V1 default (`} else { // V1 path — unchanged (default)`):

Cambio precisivamente:

DESPUÉS de:
```typescript
      logger.info({ conversationId, agentId }, 'GoDentist FB/IG sibling processing complete')
    }
```

ANTES de:
```typescript
    } else {
      // V1 path — unchanged (default)
```

INSERTAR:
```typescript
    } else if (agentId === 'somnio-sales-v4') {
      // Standalone: somnio-sales-v4-runtime-wiring (Plan 04)
      // V4 path — uses V4ProductionRunner clonado de V3 (D-13)
      // Anti-Pitfall 2 / B-001: double pre-warm (Promise.all top + dynamic import here)
      // DYNAMIC IMPORT ONLY — consistente con godentist-fb-ig precedent. NO static import al top.
      await import('../somnio-v4')
      const { V4ProductionRunner } = await import('../engine/v4-production-runner')
      const runner = new V4ProductionRunner(adapters, { workspaceId, agentModule: 'somnio-v4' })

      // D-10, D-12: capture responder BEFORE processMessage (set-before-run).
      getCollector()?.setRespondingAgentId('somnio-sales-v4')

      engineOutput = await runner.processMessage({
        sessionId: '',
        conversationId,
        contactId: contactId!,
        message: messageContent,
        workspaceId,
        history: [],
        phoneNumber: phone,
        messageTimestamp: input.messageTimestamp,
      })

      getCollector()?.recordEvent('pipeline_decision', 'webhook_agent_routed', {
        agentId,
        conversationId,
        contactId,
      })
      logger.info({ conversationId, agentId }, 'V4 agent processing complete')
```

(Notar: el `} else if` cierra el bloque godentist-fb-ig anterior y comienza la nueva condición. La indentación debe matchear las branches existentes — 4 espacios o tabs según el archivo. Verificar con `git diff` que la indentación es consistente).

**W-2 — Anti-static-import guard (consistente con godentist-fb-ig precedent):**

```bash
# Confirmar que el branch v4 usa dynamic import (await import) y NO static import al top:
grep -E "import\(.*v4-production-runner" src/lib/agents/production/webhook-processor.ts
# expect: 1 match (dynamic await import dentro del branch v4)

# Anti-static check — el archivo NO debe tener `import { V4ProductionRunner } from '../engine/v4-production-runner'` al top:
grep -E "^import \{ V4ProductionRunner" src/lib/agents/production/webhook-processor.ts
# expect: 0 matches (cero imports estáticos top-level — todos via await import)
```

**Paso 3 — Verificar branches anteriores intocados (Regla 6):**

```bash
# Comparar el bloque v3 (líneas 740-765) antes y después del cambio
git diff src/lib/agents/production/webhook-processor.ts | grep -E "^[\-\+]" | grep -v "^\+\+\+\|^\-\-\-" | grep -E "somnio-sales-v3|godentist|recompra|pw-confirmation"
# expect: 0 lines added/removed que toquen esos branches (solo líneas relevantes al v4 branch nuevo)
```

**Paso 4 — Type check:**

```bash
npx tsc --noEmit 2>&1 | grep -E "webhook-processor" | head -10
# expect: 0 errores
```

**Paso 5 — Anti-regression grep checks:**

```bash
# Branches presentes en el orden esperado:
grep -nE "(if|else if) \(agentId === '" src/lib/agents/production/webhook-processor.ts
# expect 4 matches:
#   ~740: if (agentId === 'somnio-sales-v3')
#   ~766: } else if (agentId === 'godentist')
#   ~792: } else if (agentId === 'godentist-fb-ig')
#   ~819: } else if (agentId === 'somnio-sales-v4')   ← NUEVO

# El else final (V1) sigue presente y no se modificó:
grep -A 2 "// V1 path — unchanged" src/lib/agents/production/webhook-processor.ts | head -5

# V4ProductionRunner referenciado solo en branch v4 (cero ediciones a los otros branches que aún usan V3ProductionRunner para godentist/fb-ig):
grep -c "V4ProductionRunner" src/lib/agents/production/webhook-processor.ts
# expect: 1 (solo el branch v4)

grep -c "V3ProductionRunner" src/lib/agents/production/webhook-processor.ts
# expect: ≥3 (v3 + godentist + godentist-fb-ig branches sin tocar)
```

**Paso 6 — Razón por la cual NO se necesita feature flag (D-1, Regla 6):**

El branch v4 está deployable sin riesgo porque:
1. **Sin routing rule activa** apuntando a `somnio-sales-v4` (esa la crea Plan 08 SQL flip), `routerDecidedAgentId` nunca = 'somnio-sales-v4'.
2. **agentRegistry.register(somnioV4Config)** ya está activo desde Plan 12 padre — el dropdown del routing-editor lista v4 pero no hay regla creada por el operador.
3. **Resultado:** branch inerte hasta el momento del flip. Cero impacto a prod. Regla 6 satisfecha.

Documentar en SUMMARY.md que el branch quedó dormido post-deploy (Plan 04 push) hasta Plan 08.
  </action>
  <verify>
    <automated>grep -q "if (agentId === 'somnio-sales-v4')" src/lib/agents/production/webhook-processor.ts && grep -q "V4ProductionRunner" src/lib/agents/production/webhook-processor.ts && grep -qE "await import\(['\"]\\.\\./engine/v4-production-runner['\"]\\)" src/lib/agents/production/webhook-processor.ts && ! grep -qE "^import \{ V4ProductionRunner" src/lib/agents/production/webhook-processor.ts && grep -q "import('../somnio-v4')" src/lib/agents/production/webhook-processor.ts && grep -q "setRespondingAgentId('somnio-sales-v4')" src/lib/agents/production/webhook-processor.ts && grep -q "V4 agent processing complete" src/lib/agents/production/webhook-processor.ts && grep -c "V3ProductionRunner" src/lib/agents/production/webhook-processor.ts | awk '$1 >= 3' | head -1 | wc -l | grep -q "^1$" && npx tsc --noEmit 2>&1 | grep -E "webhook-processor" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `if (agentId === 'somnio-sales-v4')` branch agregado en webhook-processor.ts
    - Branch usa `V4ProductionRunner` (no V3)
    - **Branch hace `await import('../somnio-v4')` y `await import('../engine/v4-production-runner')` (dynamic imports — anti Pitfall 2). NO existe `import { V4ProductionRunner } from '../engine/v4-production-runner'` static al top-level del archivo (W-2 fix — single grep -qE pattern enforces dynamic-only, consistente con godentist-fb-ig precedent).**
    - `setRespondingAgentId('somnio-sales-v4')` se llama BEFORE processMessage
    - Logger emite `'V4 agent processing complete'` al final
    - Pre-warm `import('../somnio-v4')` confirmed en Promise.all
    - V3ProductionRunner sigue referenciado ≥3 veces (v3 + godentist + godentist-fb-ig sin tocar)
    - Cero ediciones a branches v3, godentist, godentist-fb-ig (verificable git diff)
    - Cero ediciones a PW confirmation o recompra branches
    - Cero ediciones al else V1 final
    - `npx tsc --noEmit` sin errores
    - Orden branches: somnio-sales-v3 → godentist → godentist-fb-ig → somnio-sales-v4 → else V1
  </acceptance_criteria>
  <done>Webhook branch v4 dormido en prod. Plan 08 lo activa con SQL flip.</done>
</task>

</tasks>

<verification>
- Branch v4 inserted aditivo (Regla 6 — branches anteriores intocados)
- Pre-warm cubre Pitfall 2 / B-001
- Dynamic import only — patrón consistente con godentist-fb-ig precedent (W-2 fix)
- agentRegistry side-effect ya activado por padre (sin duplicar)
- Cero impacto a prod hasta SQL flip de Plan 08
</verification>

<success_criteria>
- Plan 08 SQL flip puede activar v4 con confianza — el branch está cableado y compila
- Plan 07 Smoke A no depende de este Plan — usa el sandbox path (Plan 03)
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/04-SUMMARY.md` con:
- Línea exacta donde se insertó el branch (start, end)
- Confirmación que pre-warm ya tenía 'import(\'../somnio-v4\')'
- git diff stats (lines added — esperado ~24 líneas inserted)
- Estado del deploy: branch dormido (sin routing rule activa)
</output>
</output>
