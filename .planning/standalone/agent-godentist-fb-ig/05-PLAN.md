---
phase: agent-godentist-fb-ig
plan: 05
type: execute
wave: 3
depends_on: [02, 03, 04]
files_modified:
  - src/lib/agents/agent-catalog.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/agents/engine/types.ts
  - src/lib/agents/engine/v3-production-runner.ts
  - src/app/(dashboard)/agentes/routing/editor/page.tsx
autonomous: true
requirements: [GFB-02, GFB-07, GFB-08]

must_haves:
  truths:
    - "agent-catalog.ts tiene una entry { id: 'godentist-fb-ig', name: 'GoDentist Valoraciones — FB/IG', description: 'Sibling de GoDentist...' } agregada al array AGENT_CATALOG"
    - "webhook-processor.ts incluye `import('../godentist-fb-ig')` en el Promise.all de pre-warm cold-lambda (lineas 225-232) — anti Pitfall 2 / B-001"
    - "webhook-processor.ts incluye un branch `else if (agentId === 'godentist-fb-ig')` paralelo al branch godentist (linea ~765-790) que invoca V3ProductionRunner con agentModule='godentist-fb-ig'"
    - "engine/types.ts extiende el union `agentModule?` para incluir `'godentist-fb-ig'` (linea 158)"
    - "engine/v3-production-runner.ts incluye un branch `if (agentModule === 'godentist-fb-ig')` que invoca processMessage del sibling (linea 153-172)"
    - "engine/v3-production-runner.ts extiende la condicion VAL tag (linea 597) a `if (agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig') return` (Pitfall 6 — sin esto los leads FB/IG no reciben tag VAL y metricas se rompen)"
    - "src/app/(dashboard)/agentes/routing/editor/page.tsx incluye `import '@/lib/agents/godentist-fb-ig'` en las lineas 25-30 (Q1 RESUELTA: el editor usa agentRegistry.list() directo, sufficient con side-effect import)"
    - "TypeScript compila sin errores en TODO el codebase: npx tsc --noEmit retorna 0 errores nuevos"
    - "Anti-regresion grep: grep -c 'import(\\'../godentist-fb-ig\\')' src/lib/agents/production/webhook-processor.ts retorna >=2 (pre-warm + dispatch)"
  artifacts:
    - path: "src/lib/agents/agent-catalog.ts"
      provides: "Entry godentist-fb-ig en AGENT_CATALOG — visible en routing-editor dropdown"
      contains: "id: 'godentist-fb-ig'"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Pre-warm cold-lambda + dispatch branch para sibling"
      contains: "godentist-fb-ig"
    - path: "src/lib/agents/engine/types.ts"
      provides: "agentModule union extendida con 'godentist-fb-ig'"
      contains: "godentist-fb-ig"
    - path: "src/lib/agents/engine/v3-production-runner.ts"
      provides: "Branch processMessage del sibling + extension VAL tag check (Pitfall 6)"
      contains: "godentist-fb-ig"
    - path: "src/app/(dashboard)/agentes/routing/editor/page.tsx"
      provides: "Side-effect import del sibling para auto-register en agentRegistry"
      contains: "godentist-fb-ig"
  key_links:
    - from: "src/lib/agents/production/webhook-processor.ts (pre-warm Promise.all)"
      to: "src/lib/agents/godentist-fb-ig/index.ts (auto-register on import)"
      via: "import('../godentist-fb-ig') en cold-lambda gate (linea 225-232) — Pitfall 2 mitigation"
      pattern: "import\\('\\.\\./godentist-fb-ig'\\)"
    - from: "src/lib/agents/production/webhook-processor.ts (dispatch branch)"
      to: "src/lib/agents/engine/v3-production-runner.ts (V3ProductionRunner)"
      via: "new V3ProductionRunner(adapters, { workspaceId, agentModule: 'godentist-fb-ig' }).processMessage(...)"
      pattern: "agentModule: 'godentist-fb-ig'"
    - from: "src/lib/agents/engine/v3-production-runner.ts (agentModule branch)"
      to: "src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts (processMessage)"
      via: "await import('../godentist-fb-ig'); processMessage(v3Input)"
      pattern: "import\\('\\.\\./godentist-fb-ig'\\)"
    - from: "src/lib/agents/engine/v3-production-runner.ts (VAL tag side-effect)"
      to: "domain tags.assignTag (Pitfall 6)"
      via: "applyGodentistValTagIfNeeded ahora dispara para godentist Y godentist-fb-ig — leads FB/IG cuentan en metricas"
      pattern: "agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'"
---

<objective>
Wave 3 — Registrar el sibling en los 5 sitios canonicos del codebase: AGENT_CATALOG (UI dropdown), webhook-processor (cold-lambda pre-warm + dispatch branch), engine/types.ts (union extension), engine/v3-production-runner.ts (agentModule branch + VAL tag side-effect extension), routing/editor/page.tsx (auto-register import).

Purpose: Sin estos 5 sitios, el sibling es codigo muerto: el agentRegistry no lo conoce en cold lambdas, el webhook no sabe a que processMessage llamar, el routing-editor no ofrece la opcion en el dropdown, y los leads capturados no reciben tag VAL (rompiendo metricas).

**Pitfalls criticas mitigadas en este plan:**
- **Pitfall 2 (B-001 cold-lambda race):** sin pre-warm, route.ts:138 valida agent_id contra agentRegistry vacio en cold start → fallback_legacy → mensaje atendido por agente equivocado.
- **Pitfall 6 (VAL tag omitido):** sin extender la condicion en runner:597, los leads FB/IG NO reciben tag VAL → metricas de valoraciones FB/IG=0 falsamente. Pattern 5 Sitio 6.
- **Q1 RESUELTA en Wave 0:** el routing-editor (page.tsx:65) usa `agentRegistry.list()` directo, NO getAgentsForWorkspace. Solo agregar el import side-effect en lineas 25-30 es suficiente.

Output: 5 archivos modificados (todos cambios pequenos: 1-3 lineas cada uno excepto webhook-processor que tiene branch dispatch ~25 lineas).

Despues de este plan, el sibling es funcional end-to-end (cuando se cree la routing rule manual en Plan 09). Falta solo: tests (Plan 06), migracion templates (Plan 07), push (Plan 08), verificacion final + LEARNINGS (Plan 09).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist-fb-ig/CONTEXT.md
@.planning/standalone/agent-godentist-fb-ig/RESEARCH.md
@.planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md
@.planning/standalone/agent-godentist-fb-ig/04-SUMMARY.md
@CLAUDE.md
@src/lib/agents/agent-catalog.ts
@src/lib/agents/production/webhook-processor.ts
@src/lib/agents/engine/types.ts
@src/lib/agents/engine/v3-production-runner.ts
@src/app/(dashboard)/agentes/routing/editor/page.tsx

<interfaces>
<!-- Sites de registracion (5 totales) -->
SITE_1 = 'src/lib/agents/agent-catalog.ts'                           // AGENT_CATALOG entry
SITE_2 = 'src/lib/agents/production/webhook-processor.ts:225-232'    // pre-warm Promise.all
SITE_3 = 'src/lib/agents/production/webhook-processor.ts:765-790'    // dispatch branch
SITE_4 = 'src/lib/agents/engine/types.ts:158'                        // agentModule union
SITE_5 = 'src/lib/agents/engine/v3-production-runner.ts:153-172,597' // agentModule branch + VAL tag check
SITE_6 = 'src/app/(dashboard)/agentes/routing/editor/page.tsx:25-30' // side-effect import (Q1 RESUELTA)

<!-- Pattern repetido en cada site: -->
// 'godentist-fb-ig' (string literal con casing locked por D-03 + Pitfall 8)
// import('../godentist-fb-ig') (relative import al sibling module)
// agentModule: 'godentist-fb-ig' (passed to V3ProductionRunner constructor)
</interfaces>

<security_relevant>
**Workspace isolation:** Todos los cambios en este plan son additivos — extienden union types y branches if/else. NO tocan logica de auth, RLS, o data access. Regla 3 trivialmente satisfecha.

**Pitfall 6 (VAL tag):** Si el ejecutor olvida extender la condicion en runner:597, el sibling capturara datos pero NO disparara el side-effect del tag VAL. Resultado: dashboard de metricas standalone "Conversation Tags to Contact" muestra valoraciones FB/IG=0 (falsamente) vs WhatsApp>0. Mitigacion: grep verification obligatoria en acceptance_criteria + Plan 09 verification.

**Cold-lambda race (Pitfall 2):** Sin pre-warm en webhook-processor:225-232, una primera llamada FB/IG en lambda fresca emite agent_id='godentist-fb-ig' que el agentRegistry no conoce → fallback_legacy → mensaje atendido por godentist (saludo conversacional viejo) o agent default. Mitigacion: import('../godentist-fb-ig') al Promise.all + grep verification.
</security_relevant>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extender agent-catalog.ts (Site 1) + page.tsx (Site 6)</name>
  <read_first>
    - src/lib/agents/agent-catalog.ts (file completo, ~80 LOC)
    - src/app/(dashboard)/agentes/routing/editor/page.tsx (lineas 20-90 — focus en imports lineas 25-30 y agentRegistry.list() linea 65)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Pattern 7 + §Multi-Agent Registration Pattern §Sitio 2
    - .planning/standalone/agent-godentist-fb-ig/01-SUMMARY.md §Q1 status (RESUELTA)
  </read_first>
  <action>
**Paso 1 — Editar `src/lib/agents/agent-catalog.ts`:**

Agregar la siguiente entry al array `AGENT_CATALOG` (despues del entry `godentist`, manteniendo orden alfabetico-ish del codebase):

```typescript
  {
    id: 'godentist-fb-ig',
    name: 'GoDentist Valoraciones — FB/IG',
    description: 'Sibling de GoDentist para FB Messenger / Instagram Direct. Saludo lead-capture (nombre+celular upfront + Habeas Data inline).',
  },
```

**Paso 2 — Editar `src/app/(dashboard)/agentes/routing/editor/page.tsx`:**

Agregar el siguiente import en el bloque de side-effect imports (lineas 25-30, despues del import de `somnio-v4`):

```typescript
import '@/lib/agents/godentist-fb-ig' // Standalone: agent-godentist-fb-ig (D-03)
```

**Q1 confirmacion:** El editor usa `agentRegistry.list()` directo en linea 65. Esto agregara `'godentist-fb-ig'` al dropdown automaticamente via side-effect del `agentRegistry.register(godentistFbIgConfig)` en el index.ts del sibling.

**Paso 3 — Validar TypeScript:**

```bash
npx tsc --noEmit 2>&1 | grep -E "(agent-catalog|routing/editor/page)" | head -5
```

Esperado: 0 errores en estos archivos.

**Paso 4 — Commit:**

```bash
git add src/lib/agents/agent-catalog.ts src/app/\(dashboard\)/agentes/routing/editor/page.tsx
git commit -m "feat(agent-godentist-fb-ig): register sibling in AGENT_CATALOG + routing-editor side-effect import"
```

NO push.
  </action>
  <verify>
    <automated>grep -c "id: 'godentist-fb-ig'" src/lib/agents/agent-catalog.ts | awk '$1 == 1 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "GoDentist Valoraciones — FB/IG" src/lib/agents/agent-catalog.ts</automated>
    <automated>grep -q "Habeas Data inline" src/lib/agents/agent-catalog.ts</automated>
    <automated>grep -c "import '@/lib/agents/godentist-fb-ig'" "src/app/(dashboard)/agentes/routing/editor/page.tsx" | awk '$1 == 1 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "import '@/lib/agents/godentist-fb-ig'" "src/app/(dashboard)/agentes/routing/editor/page.tsx"</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): register sibling in AGENT_CATALOG"</automated>
  </verify>
  <acceptance_criteria>
    - `agent-catalog.ts` contiene exactamente 1 entry `{ id: 'godentist-fb-ig', ... }` con name "GoDentist Valoraciones — FB/IG" y description mencionando "Habeas Data inline".
    - `routing/editor/page.tsx` contiene exactamente 1 linea `import '@/lib/agents/godentist-fb-ig'` en el bloque de side-effect imports (lineas 25-30 aproximadas).
    - TypeScript compila ambos archivos sin errores nuevos.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - Sibling visible en dropdown del routing-editor (cuando page.tsx se renderiza, el side-effect import dispara `agentRegistry.register(godentistFbIgConfig)` y `agentRegistry.list()` retorna el sibling).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Extender webhook-processor.ts pre-warm + dispatch branch (Sites 2 y 3)</name>
  <read_first>
    - src/lib/agents/production/webhook-processor.ts (lineas 200-280 — pre-warm Promise.all gate; lineas 740-820 — dispatch branches)
    - src/lib/agents/godentist-fb-ig/godentist-fb-ig-agent.ts (verificar export de processMessage — viene de Plan 03)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Pattern 4 (dispatch branch) + §Pattern 6 (cold-lambda pre-warm) + §Common Pitfalls §2
  </read_first>
  <action>
**Paso 1 — Editar pre-warm (Site 2):** En `src/lib/agents/production/webhook-processor.ts:225-232` agregar `import('../godentist-fb-ig')` al Promise.all:

Localizar el bloque (aproximadamente lineas 225-232):

```typescript
await Promise.all([
  import('../somnio-recompra'),
  import('../somnio-v3'),
  import('../somnio'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'),
])
```

Cambiarlo a:

```typescript
await Promise.all([
  import('../somnio-recompra'),
  import('../somnio-v3'),
  import('../somnio'),
  import('../godentist'),
  import('../somnio-pw-confirmation'),
  import('../somnio-v4'),
  import('../godentist-fb-ig'), // Standalone: agent-godentist-fb-ig (D-03, Pitfall 2)
])
```

**Paso 2 — Editar dispatch branch (Site 3):** Localizar el branch `agentId === 'godentist'` (aproximadamente lineas 765-790). El branch existente debe verse asi:

```typescript
} else if (agentId === 'godentist') {
  await import('../godentist')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, { workspaceId, agentModule: 'godentist' })

  getCollector()?.setRespondingAgentId('godentist')

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
    agentId, conversationId, contactId,
  })
  logger.info({ conversationId, agentId }, 'GoDentist agent processing complete')
}
```

DESPUES del cierre `}` del branch godentist (y antes del else final / cierre de la cadena if/else), agregar el branch nuevo:

```typescript
} else if (agentId === 'godentist-fb-ig') {
  // Standalone: agent-godentist-fb-ig (D-03)
  // Sibling de godentist para FB Messenger / Instagram Direct.
  // Reuses V3ProductionRunner with agentModule='godentist-fb-ig'.
  await import('../godentist-fb-ig')
  const { V3ProductionRunner } = await import('../engine/v3-production-runner')
  const runner = new V3ProductionRunner(adapters, { workspaceId, agentModule: 'godentist-fb-ig' })

  getCollector()?.setRespondingAgentId('godentist-fb-ig')

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
    agentId, conversationId, contactId,
  })
  logger.info({ conversationId, agentId }, 'GoDentist FB/IG sibling processing complete')
}
```

**Paso 3 — Validar TypeScript:**

```bash
npx tsc --noEmit 2>&1 | grep "webhook-processor" | head -10
```

Esperado: 0 errores. Si aparece error sobre `agentModule: 'godentist-fb-ig'` no asignable al union → significa que Site 4 (engine/types.ts) no se ha actualizado todavia. Avanzar a Task 3, los errores se resolveran al cierre.

**Paso 4 — Verificar grep de pre-warm + dispatch:**

```bash
grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts
# Esperado: minimo 2 (1 en pre-warm + 1 en dispatch)
```

```bash
grep -c "agentId === 'godentist-fb-ig'" src/lib/agents/production/webhook-processor.ts
# Esperado: 1
```

**Paso 5 — Commit:**

```bash
git add src/lib/agents/production/webhook-processor.ts
git commit -m "feat(agent-godentist-fb-ig): pre-warm cold-lambda + dispatch branch in webhook-processor (Pitfall 2)"
```

NO push.
  </action>
  <verify>
    <automated>grep -c "import('\.\./godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts | awk '$1 >= 2 { exit 0 } { exit 1 }'</automated>
    <automated>grep -c "agentId === 'godentist-fb-ig'" src/lib/agents/production/webhook-processor.ts | awk '$1 == 1 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "agentModule: 'godentist-fb-ig'" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "GoDentist FB/IG sibling processing complete" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>grep -q "setRespondingAgentId('godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): pre-warm cold-lambda + dispatch branch"</automated>
  </verify>
  <acceptance_criteria>
    - `webhook-processor.ts` contiene >=2 ocurrencias de `import('../godentist-fb-ig')` (1 pre-warm + 1 dispatch).
    - `webhook-processor.ts` contiene exactamente 1 branch `else if (agentId === 'godentist-fb-ig')`.
    - El branch invoca V3ProductionRunner con `agentModule: 'godentist-fb-ig'`.
    - El branch llama setRespondingAgentId('godentist-fb-ig'), recordEvent y logger con mensaje "GoDentist FB/IG sibling".
    - El branch NO duplica codigo del godentist (es paralelo, NO modifica el branch godentist).
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - Webhook entry: cuando routing emite agentId='godentist-fb-ig', el dispatch invoca al sibling. Cold-lambda race resuelto.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Extender engine/types.ts + engine/v3-production-runner.ts (Sites 4 y 5)</name>
  <read_first>
    - src/lib/agents/engine/types.ts (lineas 150-170 — focus en agentModule union linea 158)
    - src/lib/agents/engine/v3-production-runner.ts (lineas 130-200 — agentModule branches; lineas 560-640 — applyGodentistValTagIfNeeded)
    - .planning/standalone/agent-godentist-fb-ig/RESEARCH.md §Pattern 5 + §Multi-Agent Registration Pattern §Sitio 5 + §Sitio 6 + §Common Pitfalls §6
  </read_first>
  <action>
**Paso 1 — Editar `src/lib/agents/engine/types.ts:158`:**

Localizar la linea ~158 que tiene el union `agentModule?:`. La linea actual debe verse:

```typescript
agentModule?: 'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-pw-confirmation' | 'somnio-v4'
```

(o similar — el orden puede variar, lo importante es el union literal). Extender el union para incluir `'godentist-fb-ig'`:

```typescript
agentModule?: 'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-pw-confirmation' | 'somnio-v4' | 'godentist-fb-ig'
```

**Paso 2 — Editar `src/lib/agents/engine/v3-production-runner.ts:153-172` (branch agentModule):**

Localizar el bloque (aproximadamente lineas 153-172) que tiene branches `if (this.config.agentModule === 'godentist')` ... `else if (this.config.agentModule === 'somnio-recompra')` ... `else if (this.config.agentModule === 'somnio-pw-confirmation')` ... `else { ... somnio-v3 fallback }`.

Agregar un nuevo branch despues del godentist (manteniendo el orden por dependencia: el godentist branch y el sibling branch son visualmente cercanos para mostrar la simetria):

```typescript
if (this.config.agentModule === 'godentist') {
  const { processMessage } = await import('../godentist/godentist-agent')
  output = await processMessage(v3Input as any) as unknown as V3AgentOutput
} else if (this.config.agentModule === 'godentist-fb-ig') {
  // Standalone: agent-godentist-fb-ig (D-03)
  // Sibling de godentist para FB Messenger / Instagram Direct.
  const { processMessage } = await import('../godentist-fb-ig')
  output = await processMessage(v3Input as any) as unknown as V3AgentOutput
} else if (this.config.agentModule === 'somnio-recompra') {
  // ... (existing branch sin cambios)
```

**Paso 3 — Editar `src/lib/agents/engine/v3-production-runner.ts:597` (VAL tag check, Pitfall 6):**

Localizar la linea ~597 dentro de `applyGodentistValTagIfNeeded`. La linea actual debe ser:

```typescript
if (this.config.agentModule !== 'godentist') return
```

Cambiar a:

```typescript
// Standalone: agent-godentist-fb-ig (D-03, Pitfall 6) — extendido para incluir el sibling
// Sin esta extension, los leads FB/IG capturados por godentist-fb-ig NO recibiran tag VAL
// y las metricas de valoraciones FB/IG mostraran 0 falsamente.
if (this.config.agentModule !== 'godentist' && this.config.agentModule !== 'godentist-fb-ig') return
```

**Paso 4 — Validar TypeScript completo del codebase:**

```bash
npx tsc --noEmit 2>&1 | grep -E "godentist-fb-ig|webhook-processor|v3-production-runner|agent-catalog|engine/types" | head -10
```

Esperado: 0 errores. Si aparecen errores, debug:
- `Type "godentist-fb-ig" is not assignable...` en webhook-processor.ts → significa que types.ts NO se actualizo (Paso 1 incompleto). Reintentar.
- `Cannot find module '../godentist-fb-ig'` en v3-production-runner.ts → verificar que `src/lib/agents/godentist-fb-ig/index.ts` existe (Plan 03 Task 1).

**Paso 5 — Verificacion grep canon:**

```bash
grep -c "godentist-fb-ig" src/lib/agents/engine/types.ts
# Esperado: >=1 (linea del union)

grep -c "godentist-fb-ig" src/lib/agents/engine/v3-production-runner.ts
# Esperado: >=2 (branch + VAL tag check; opcionalmente comentarios)

grep -E "agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts
# Esperado: 1 match (Pitfall 6 mitigation)
```

**Paso 6 — Commit:**

```bash
git add src/lib/agents/engine/types.ts src/lib/agents/engine/v3-production-runner.ts
git commit -m "feat(agent-godentist-fb-ig): extend agentModule union + runner branch + VAL tag check (Pitfall 6)"
```

NO push.
  </action>
  <verify>
    <automated>grep -c "godentist-fb-ig" src/lib/agents/engine/types.ts | awk '$1 >= 1 { exit 0 } { exit 1 }'</automated>
    <automated>grep -c "godentist-fb-ig" src/lib/agents/engine/v3-production-runner.ts | awk '$1 >= 2 { exit 0 } { exit 1 }'</automated>
    <automated>grep -q "agentModule === 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts</automated>
    <automated>grep -E "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -cE "godentist-fb-ig|webhook-processor|v3-production-runner|agent-catalog|engine/types" | awk '$1 == 0 { exit 0 } { exit 1 }'</automated>
    <automated>git log -1 --format=%s | grep -qF "feat(agent-godentist-fb-ig): extend agentModule union"</automated>
  </verify>
  <acceptance_criteria>
    - `engine/types.ts` linea 158 (o equivalente) contiene `'godentist-fb-ig'` en el union de `agentModule`.
    - `engine/v3-production-runner.ts` contiene el branch `if (this.config.agentModule === 'godentist-fb-ig')` que invoca `import('../godentist-fb-ig')` y llama `processMessage`.
    - `engine/v3-production-runner.ts` linea 597 (o equivalente) tiene la condicion compuesta `agentModule !== 'godentist' && agentModule !== 'godentist-fb-ig'` (Pitfall 6 mitigation).
    - TypeScript compila el codebase completo sin nuevos errores.
    - Commit atomico exacto. NO push.
  </acceptance_criteria>
  <done>
    - V3ProductionRunner sabe invocar al sibling cuando agentModule='godentist-fb-ig'. VAL tag side-effect cubre ambos agentes.
    - Sibling registrado en los 5 sitios canonicos. Funcional end-to-end (modulo registracion via routing rule manual + tests + templates).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Webhook → routeAgent → agentRegistry | El sibling DEBE estar registrado pre-routeAgent en cold lambdas (Pitfall 2) |
| V3ProductionRunner → agentModule branch | El union DEBE incluir 'godentist-fb-ig' (TypeScript safety) |
| V3ProductionRunner → VAL tag side-effect | Sibling DEBE estar en la condicion (Pitfall 6) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gfb-05-01 | Tampering | Pre-warm Promise.all incompleto | mitigate | grep verification (>=2 imports en webhook-processor) + Plan 09 cold-start smoke test si feasible |
| T-gfb-05-02 | Spoofing | Wrong agentModule string en runner branch | mitigate | TypeScript catches at compile (union type strict); test in Plan 06 |
| T-gfb-05-03 | Information Disclosure | VAL tag asignado a contacto sin consent | accept | VAL tag es metric-only, sin PII; Habeas Data cubre con disclaimer D-05 inline |
| T-gfb-05-04 | Denial of Service | Pre-warm de 7 modulos puede demorar cold start | accept | Tradeoff aceptable — alternativa (lazy load) tiene Pitfall 2 race; ~50-100ms cold start vs latency normal de 2s |
| T-gfb-05-05 | Elevation of Privilege | Sibling accidentalmente invocado en wrong workspace | mitigate | Routing rule (Plan 09 manual) acota workspace_id literal; D-15 |
</threat_model>

<verification>
- 5 archivos modificados:
  - `src/lib/agents/agent-catalog.ts` — entry godentist-fb-ig
  - `src/lib/agents/production/webhook-processor.ts` — pre-warm + dispatch branch
  - `src/lib/agents/engine/types.ts` — union extendida
  - `src/lib/agents/engine/v3-production-runner.ts` — branch + VAL tag check
  - `src/app/(dashboard)/agentes/routing/editor/page.tsx` — side-effect import
- TypeScript compila sin errores nuevos: `npx tsc --noEmit 2>&1 | grep godentist-fb-ig | wc -l` retorna 0.
- Anti-Pitfall 2 grep: `grep -c "import('../godentist-fb-ig')" src/lib/agents/production/webhook-processor.ts` retorna >=2.
- Anti-Pitfall 6 grep: `grep -E "agentModule !== 'godentist' && (this\.config\.)?agentModule !== 'godentist-fb-ig'" src/lib/agents/engine/v3-production-runner.ts` retorna match.
- Anti-Pitfall 8 (casing): grep todas las ocurrencias de `godentist-fb-ig` y validar lowercase con guion.
- 3 commits atomicos en git local. NO push.
</verification>

<success_criteria>
- Plan 06 (tests) puede importar el sibling sin errores TypeScript.
- Plan 07 (migration apply) sigue siendo la ultima dependencia operativa para que el sibling funcione end-to-end.
- Plan 09 (routing rule manual + smoke tests) puede confirmar que el dropdown del routing-editor muestra "GoDentist Valoraciones — FB/IG" como opcion seleccionable.
- En cold lambdas, una llamada FB/IG con routing rule activa NO cae a fallback_legacy (Pitfall 2 mitigada).
- Leads FB/IG capturados por el sibling reciben tag VAL automaticamente cuando completan datos criticos (Pitfall 6 mitigada).
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist-fb-ig/05-SUMMARY.md` documenting:
- Commit hashes de Tasks 1, 2, 3.
- Lista de los 5 sitios extendidos con confirmacion grep.
- Confirmacion anti-Pitfall 2: `grep -c "import('../godentist-fb-ig')" webhook-processor.ts` = N (>=2).
- Confirmacion anti-Pitfall 6: condicion compuesta presente en v3-production-runner.ts.
- Confirmacion Q1 RESUELTA: page.tsx solo agrega 1 import side-effect (no modifica getAgentsForWorkspace).
- Status del modulo: registracion completa, sibling es funcional pero sin templates en DB todavia (Plan 07).
</output>
