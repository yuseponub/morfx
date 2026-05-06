---
plan: 06
phase: somnio-sales-v4-runtime-wiring
wave: 4
depends_on: [01, 04, 05]
files_modified:
  - src/lib/agents/engine/v4-production-runner.ts
addresses_decisions: [D-3, D-16, D-17, D-18]
addresses_research_pitfalls: []
autonomous: true
estimated_tasks: 1
must_haves:
  truths:
    - "V4ProductionRunner gate del NoRepetitionFilter usa USE_NO_REPETITION_V4 (no USE_NO_REPETITION) — D-16 flag separado"
    - "Filter aplica a todos los templates output (response-track + sub-loop template_match — D-17)"
    - "Bloque está envuelto en try/catch con fail-open (sender envía bloque completo si filter crashea — patrón v3 línea 322 verbatim)"
    - "Modelo del filter (decisión D-18 post-research): el filter usa el modelo que ya tiene hardcoded en src/lib/agents/somnio/no-repetition-filter.ts (NO se cambia el filter aquí — Plan 06 solo cablea el flag)"
    - "Gate OFF por default (env var unset → false). En prod permanece OFF hasta usuario decida activarla en futuro standalone"
    - "Cero edits a v3-production-runner.ts (Regla 6)"
    - "npx tsc --noEmit clean"
  artifacts:
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "V4ProductionRunner con NoRepetitionFilter wired bajo USE_NO_REPETITION_V4"
      contains: "USE_NO_REPETITION_V4"
  key_links:
    - from: "process.env.USE_NO_REPETITION_V4 === 'true'"
      to: "NoRepetitionFilter.filterBlock"
      via: "if-block en V4ProductionRunner.processMessage line ~280 (clone of v3 line 280)"
      pattern: "USE_NO_REPETITION_V4"
---

<objective>
Wave 4 — Wirear `NoRepetitionFilter` dentro de `V4ProductionRunner` GATED por flag separado `USE_NO_REPETITION_V4` (D-16).

**Por qué:** D-3 lockea que NoRepetitionFilter quede wired en v4 aunque hoy esté OFF en prod ("anade la logica si depronto la usamos luego"). En el clone hecho en Plan 01 Task 3, el bloque actualmente referencia `process.env.USE_NO_REPETITION` (legacy v3 flag clonado verbatim). Plan 06 lo refactoriza al flag aislado `USE_NO_REPETITION_V4`.

**Por qué flag separado (D-16):** v3 prod hoy tiene `USE_NO_REPETITION=false` (default). Si v4 compartiera el flag, activarlo en v3 prod obligaría a v4 a tenerlo igual, violando aislamiento. Flag separado permite:
- Toggle independiente por agente
- v3 puede correr con repetition-filter ON (futuro), v4 OFF (default), sin conflicto
- Reverse: v4 ON, v3 OFF (Plan 07/08 podrían experimentar con él en sandbox)

**D-17:** filter aplica a templates response-track Y outputs sub-loop `template_match`. La dedupe es por contenido enviado al cliente, no por origen. **El bloque clonado de v3 (líneas 276-325 v3-production-runner.ts) ya cumple esto** porque el filter recibe `output.templates` que incluye TODOS los templates emitidos en el turn (sin importar si vinieron de response-track o sub-loop). Plan 06 NO cambia esa lógica — la mantiene verbatim.

**D-18 — modelo del filter (decisión post-research):**

RESEARCH §D-18: "NoRepetitionFilter no fue testeado en este research (es deuda menor, flag OFF default)". Decisión: **NO cambiar el modelo del filter en este Plan**. El filter (`src/lib/agents/somnio/no-repetition-filter.ts`) tiene su modelo hardcoded internamente. Plan 06 solo cablea el flag — el modelo queda como esté hoy (probablemente Sonnet o Haiku según commit history). Cuando el flag se active en producción (futuro standalone), se decide el swap del modelo del filter.

**Implementación:**

Refactorizar el bloque del NoRepetitionFilter en `src/lib/agents/engine/v4-production-runner.ts`:

```typescript
// Antes (post-Plan 01 — clonado verbatim de v3 con flag legacy):
if (process.env.USE_NO_REPETITION === 'true') {
  // ...
}

// Después (Plan 06 — flag separado v4):
if (process.env.USE_NO_REPETITION_V4 === 'true') {
  // ...
}
```

Eso es el cambio principal. Verificar que el resto del bloque (líneas 280-325 del v3 que se clonaron) sigue intacto:
- `import('../somnio/no-repetition-filter')` — same path (filter es shared, no se duplica)
- `import('../somnio/outbound-registry')` — same path
- `import('../somnio/minifrase-generator')` — same path
- `buildOutboundRegistry(input.conversationId, session.id, inputTemplatesEnviados)` — same call
- `noRepFilter.filterBlock(blockForFilter, registry, inputTemplatesEnviados)` — same call
- Try/catch con fail-open (línea 321-324 de v3): si filter crashea → `templatesToSend = output.templates` (sender envía bloque completo) — same patrón

Nota: el filter está en `src/lib/agents/somnio/no-repetition-filter.ts` (path compartido entre v1/v3/v4). Cero edits ahí (Regla 6 — v3 también lo usa).

**Cero side-effect:** flag default unset → `process.env.USE_NO_REPETITION_V4 === 'true'` evalúa `false` → bloque skipea. Cero impacto a v4 prod hasta que alguien setee la env var explícitamente. Plan 08 deploy es seguro.

**Anti-regression Regla 6:**
```bash
git diff src/lib/agents/engine/v3-production-runner.ts
# expect: empty (v3 sigue con USE_NO_REPETITION legacy)

git diff src/lib/agents/somnio/no-repetition-filter.ts src/lib/agents/somnio/outbound-registry.ts src/lib/agents/somnio/minifrase-generator.ts
# expect: empty (shared filters intocados)
```

Output: V4ProductionRunner con filter cableado bajo flag aislado. Plan 07/08 deploy con flag OFF (cero impacto).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@src/lib/agents/engine/v3-production-runner.ts
@src/lib/agents/engine/v4-production-runner.ts
@src/lib/agents/somnio/no-repetition-filter.ts
</context>

<interfaces>
<!-- v3-production-runner.ts NoRepetitionFilter block (line 279 — to be cloned with flag swap) -->
```typescript
// from src/lib/agents/engine/v3-production-runner.ts:279-325
// No-repetition filter (if USE_NO_REPETITION=true)
if (process.env.USE_NO_REPETITION === 'true') {
  try {
    const { NoRepetitionFilter } = await import('../somnio/no-repetition-filter')
    const { buildOutboundRegistry } = await import('../somnio/outbound-registry')

    const registry = await buildOutboundRegistry(
      input.conversationId,
      session.id,
      inputTemplatesEnviados,
    )

    const { generateMinifrases } = await import('../somnio/minifrase-generator')
    await generateMinifrases(registry)

    const noRepFilter = new NoRepetitionFilter(this.config.workspaceId)

    const blockForFilter = templatesToSend.map(t => ({
      templateId: t.templateId,
      content: t.content,
      contentType: t.contentType as 'texto' | 'template' | 'imagen',
      priority: t.priority,
      intent: output.intentInfo?.intent ?? 'unknown',
      orden: 0,
      isNew: true,
      delaySeconds: 0,
    }))

    const filterResult = await noRepFilter.filterBlock(
      blockForFilter,
      registry,
      inputTemplatesEnviados,
    )

    const survivingIds = new Set(filterResult.surviving.map(s => s.templateId))
    templatesToSend = templatesToSend.filter(t => survivingIds.has(t.templateId))

    if (filterResult.filtered.length > 0) {
      console.log(
        `[V3-RUNNER] No-rep filter: ${filterResult.filtered.length} filtered, ${filterResult.surviving.length} surviving`
      )
    }
  } catch (noRepError) {
    console.error('[V3-RUNNER] No-rep filter crashed, sending full block (fail-open):', noRepError)
    templatesToSend = output.templates
  }
}
```

<!-- Plan 01 Task 3 already cloned this block with [V3-RUNNER] → [V4-RUNNER] log prefix.
     Plan 06 refactorizes the env var literal: USE_NO_REPETITION → USE_NO_REPETITION_V4. -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Refactor flag legacy USE_NO_REPETITION → USE_NO_REPETITION_V4 en v4-production-runner.ts (D-16)</name>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts (post-Plan 01 — bloque NoRepetition alrededor de línea 280)
    - src/lib/agents/engine/v3-production-runner.ts (clone source — para confirmar que el bloque clonado es estructuralmente idéntico)
    - src/lib/agents/somnio/no-repetition-filter.ts (shared filter — solo READ para entender shape de filterBlock)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-3, D-16, D-17, D-18)
  </read_first>
  <action>
**Paso 1 — Confirmar estado del bloque post-Plan 01 Task 3:**

```bash
grep -n "USE_NO_REPETITION" src/lib/agents/engine/v4-production-runner.ts
# expect: al menos 1 línea con `if (process.env.USE_NO_REPETITION === 'true')` (legacy literal clonado verbatim de v3)
```

Si Plan 01 Task 3 ya hizo el rename a `USE_NO_REPETITION_V4` → este Task es no-op (verificación + acceptance pass). Si Plan 01 dejó literal legacy → continúa con el rename.

**Paso 2 — Reemplazar literal:**

Solo UNA substitución textual:

```bash
# Localiza la línea (debería ser una sola ocurrencia):
grep -n "if (process.env.USE_NO_REPETITION === 'true')" src/lib/agents/engine/v4-production-runner.ts
```

Edita el archivo cambiando ESA línea (y solo esa) de:
```typescript
if (process.env.USE_NO_REPETITION === 'true') {
```
a:
```typescript
// D-16: flag separado v4 (no compartir con v3 prod). Default OFF — activa SOLO cuando
//       futuro standalone decida turn ON el filter en v4. Plan 06.
if (process.env.USE_NO_REPETITION_V4 === 'true') {
```

NADA más en el bloque cambia. Mantener:
- Try/catch con fail-open (`templatesToSend = output.templates` en catch)
- Imports dynamic de `../somnio/no-repetition-filter`, `../somnio/outbound-registry`, `../somnio/minifrase-generator`
- `buildOutboundRegistry(input.conversationId, session.id, inputTemplatesEnviados)`
- `new NoRepetitionFilter(this.config.workspaceId)`
- `noRepFilter.filterBlock(blockForFilter, registry, inputTemplatesEnviados)`
- Log prefix `[V4-RUNNER]` (de Plan 01 Task 3)

**Paso 3 — Anti-regression Regla 6:**

```bash
git diff src/lib/agents/engine/v3-production-runner.ts
# expect: empty (v3 SIGUE con USE_NO_REPETITION legacy)

git diff src/lib/agents/somnio/no-repetition-filter.ts src/lib/agents/somnio/outbound-registry.ts src/lib/agents/somnio/minifrase-generator.ts
# expect: empty (shared filters NO se tocan — el filter mismo no se modifica, solo el gate)
```

**Paso 4 — Verificar que el bloque sigue funcional:**

```bash
# Confirmar que el flag aparece SOLO una vez en v4-production-runner.ts:
grep -c "USE_NO_REPETITION_V4" src/lib/agents/engine/v4-production-runner.ts
# expect: 1

# Confirmar que el flag legacy YA NO está en v4-production-runner.ts:
grep "process.env.USE_NO_REPETITION " src/lib/agents/engine/v4-production-runner.ts
grep "process.env.USE_NO_REPETITION'" src/lib/agents/engine/v4-production-runner.ts
# expect: 0 matches (literal legacy gone)

# (NOTA: el grep anterior usa `USE_NO_REPETITION ` con espacio o `USE_NO_REPETITION'` con quote
# para distinguir USE_NO_REPETITION del USE_NO_REPETITION_V4 — ambos contienen el prefix)

# El flag legacy SIGUE en v3-production-runner.ts (Regla 6):
grep "process.env.USE_NO_REPETITION === 'true'" src/lib/agents/engine/v3-production-runner.ts
# expect: 1 match
```

**Paso 5 — Type check:**

```bash
npx tsc --noEmit 2>&1 | grep -E "v4-production-runner" | head -5
# expect: 0 errors
```

**Paso 6 — Smoke unit test (no API call):**

Verificar que el flag se lee correctamente — agregar un test rápido o ejecutar manualmente con `console.log` removed después:

```bash
# Compile + dry-run del módulo (no exportar nada nuevo):
node -e "console.log('USE_NO_REPETITION_V4 unset →', process.env.USE_NO_REPETITION_V4)"
# expect: USE_NO_REPETITION_V4 unset → undefined

USE_NO_REPETITION_V4=true node -e "console.log('USE_NO_REPETITION_V4 set →', process.env.USE_NO_REPETITION_V4)"
# expect: USE_NO_REPETITION_V4 set → true
```

(Esto verifica que la env var es leíble en runtime. El behavior real del filter se verifica end-to-end en Plan 07 si el ejecutor decide activar el flag en sandbox.)

**Documentar en SUMMARY.md:**
- Línea exacta del cambio (un solo string substitution)
- Confirmación que NO se modificó el filter shared (`src/lib/agents/somnio/no-repetition-filter.ts`)
- Confirmación que v3-production-runner.ts sigue con flag legacy (verificable git diff)
- Razón de no swap del modelo del filter (D-18 — deferred a futuro standalone cuando se active el flag en prod)
  </action>
  <verify>
    <automated>grep -q "USE_NO_REPETITION_V4" src/lib/agents/engine/v4-production-runner.ts && grep -c "USE_NO_REPETITION_V4" src/lib/agents/engine/v4-production-runner.ts | awk '$1 == 1' | head -1 | wc -l | grep -q "^1$" && grep -q "if (process.env.USE_NO_REPETITION === 'true')" src/lib/agents/engine/v3-production-runner.ts && [ -z "$(git diff src/lib/agents/engine/v3-production-runner.ts)" ] && [ -z "$(git diff src/lib/agents/somnio/no-repetition-filter.ts src/lib/agents/somnio/outbound-registry.ts src/lib/agents/somnio/minifrase-generator.ts 2>/dev/null)" ] && npx tsc --noEmit 2>&1 | grep -E "v4-production-runner" | head -1 | wc -l | grep -q "^0$"</automated>
  </verify>
  <acceptance_criteria>
    - `v4-production-runner.ts` contiene literal `USE_NO_REPETITION_V4` en gate del filter
    - `v4-production-runner.ts` NO contiene `process.env.USE_NO_REPETITION ===` (sin sufijo `_V4`) en NINGÚN lugar
    - Bloque try/catch con fail-open preservado (`templatesToSend = output.templates` en catch)
    - Imports dynamic de no-repetition-filter, outbound-registry, minifrase-generator presentes
    - `v3-production-runner.ts` sigue con flag legacy `USE_NO_REPETITION` (Regla 6)
    - `src/lib/agents/somnio/no-repetition-filter.ts` git diff vacío
    - `src/lib/agents/somnio/outbound-registry.ts` git diff vacío
    - `src/lib/agents/somnio/minifrase-generator.ts` git diff vacío
    - `npx tsc --noEmit` sin errores
    - Default behavior unset env var → bloque skipea (verificable runtime)
  </acceptance_criteria>
  <done>NoRepetitionFilter cableado en v4 con flag aislado.</done>
</task>

</tasks>

<verification>
- Flag separado USE_NO_REPETITION_V4 wireado (D-16)
- Filter shared sin tocar (Regla 6)
- v3 prod no afectado
- Cero impacto a v4 prod default (flag OFF unless explicitly set)
</verification>

<success_criteria>
- v4 puede activar repetition-filter independientemente de v3 (flag separado D-16)
- Plan 07/08 deploy con flag OFF default (cero impacto a prod)
- Futuro standalone podrá activar el flag en v4 sin tocar v3
</success_criteria>

<output>
Crear `.planning/standalone/somnio-sales-v4-runtime-wiring/06-SUMMARY.md` con:
- Línea exacta del cambio (start-end + diff snippet)
- Confirmación grep `USE_NO_REPETITION_V4` aparece SOLO 1 vez en v4-production-runner.ts
- Confirmación grep `USE_NO_REPETITION` (sin _V4) sigue en v3-production-runner.ts
- Decisión D-18: modelo del filter no se cambia (deferred a activación futura)
</output>
