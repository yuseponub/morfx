---
phase: somnio-recompra-template-catalog
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/somnio-recompra/response-track.ts
  - src/lib/agents/somnio-recompra/constants.ts
autonomous: true

must_haves:
  truths:
    - "`TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'` en response-track.ts (D-02 revert T2)"
    - "`direccion_completa` concat incluye `state.datos.departamento` en response-track.ts:346 (D-12)"
    - "`INFORMATIONAL_INTENTS` set incluye `'registro_sanitario'` en constants.ts:67-71 (D-06)"
    - "`resolveSalesActionTemplates` exportada (añadir `export` a la function declaration) para habilitar tests directos en Plan 04"
    - "`npm run typecheck` pasa exit 0 (no type errors post-cambios)"
    - "Ningun cambio empuja a Vercel — Wave 1 queda en local hasta Plan 05"
  artifacts:
    - path: "src/lib/agents/somnio-recompra/response-track.ts"
      provides: "Template lookup apunta a catalogo propio (somnio-recompra-v1) + direccion_completa contiene departamento + resolveSalesActionTemplates exportada"
      contains: "const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'"
    - path: "src/lib/agents/somnio-recompra/constants.ts"
      provides: "registro_sanitario reconocido como intent informational"
      contains: "'registro_sanitario'"
  key_links:
    - from: "src/lib/agents/somnio-recompra/response-track.ts"
      to: "agent_templates table via TemplateManager.getTemplatesForIntents"
      via: "parametro agentId='somnio-recompra-v1' en linea 122-123"
      pattern: "TEMPLATE_LOOKUP_AGENT_ID"
    - from: "src/lib/agents/somnio-recompra/response-track.ts:346"
      to: "template preguntar_direccion_recompra variable substitution"
      via: "extraContext.direccion_completa con ciudad + departamento"
      pattern: "direccion_completa:"
    - from: "src/lib/agents/somnio-recompra/constants.ts:67-71"
      to: "response-track.ts:72 INFORMATIONAL_INTENTS.has(intent) check"
      via: "Set membership"
      pattern: "INFORMATIONAL_INTENTS"
---

<objective>
Wave 1 (parallel con Plan 03) — Code: revertir T2, completar direccion_completa con departamento, agregar registro_sanitario al set informational, exportar resolveSalesActionTemplates para testeability.

Purpose: Alinear el codigo al contrato que el catalogo de Plan 01 establece:
- D-02: El fix T2 provisional se revierte — `TEMPLATE_LOOKUP_AGENT_ID` vuelve a `'somnio-recompra-v1'` ahora que el catalogo existe propio.
- D-12: El contract del template `preguntar_direccion_recompra` requiere que `direccion_completa` incluya departamento; hoy la concat solo usa direccion+ciudad.
- D-06: Deuda tecnica pre-existente — `registro_sanitario` esta en RECOMPRA_INTENTS pero NO en INFORMATIONAL_INTENTS, por eso Haiku lo clasifica correcto pero response-track lo ignora.

Output: 2 archivos modificados (4 cambios de linea en response-track.ts + 1 cambio de linea en constants.ts). 2 commits atomicos (uno por archivo) o 1 commit combinado. NO push.

**CRITICAL — Regla 5 + D-09:** Este codigo NO pushea a Vercel. El push ocurre en Plan 05 Task 2, DESPUES de aplicar la migracion SQL en prod en Plan 05 Task 1. Si se pushea prematuro, el lookup buscaria saludo bajo somnio-recompra-v1 con copy VIEJO (pre-migracion) → saludo genericos al cliente.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-02, D-06, D-12
@.planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Existing Patterns #3 (response-track.ts pipeline), §Pitfalls 5 (registro_sanitario bug), §Validation Architecture (export para testeability), §Code Examples (Mini-diff response-track + constants)
@.planning/standalone/somnio-recompra-template-catalog/01-PLAN.md (contrato del catalogo — Plan 02 es consumer)
@CLAUDE.md §Regla 3 (domain layer — no aplica, templates no tienen domain), §Regla 5 (migracion antes de deploy — NO pushear este plan)
@src/lib/agents/somnio-recompra/response-track.ts (estado actual — leer lineas 28-40, 283-378 antes de editar)
@src/lib/agents/somnio-recompra/constants.ts (estado actual — leer linea 67-71 antes de editar)
@src/lib/agents/somnio-recompra/state.ts (confirmar `state.datos.departamento` existe en interface DatosCliente — ya verified en RESEARCH §Existing Patterns #3)

<interfaces>
<!-- response-track.ts linea 39 (estado actual — DEBE cambiar) -->
const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3'  // OLD (T2 fix provisional)
const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'  // NEW (D-02 revert)

<!-- response-track.ts linea 346 branch preguntar_direccion happy-path (estado actual — DEBE cambiar) -->
// OLD:
direccion_completa: [direccion, ciudad].filter(Boolean).join(', '),
// NEW (D-12):
direccion_completa: [direccion, ciudad, state.datos.departamento].filter(Boolean).join(', '),

<!-- response-track.ts linea 283 (estado actual — DEBE agregar export) -->
async function resolveSalesActionTemplates(   // OLD
export async function resolveSalesActionTemplates(   // NEW (habilita test directo en Plan 04)

<!-- constants.ts lineas 67-71 (estado actual — DEBE agregar 'registro_sanitario') -->
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones',
  'pago', 'envio', 'ubicacion', 'contraindicaciones', 'dependencia',
  'tiempo_entrega',
])
// NEW (D-06):
export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
  'saludo', 'precio', 'promociones',
  'pago', 'envio', 'registro_sanitario', 'ubicacion', 'contraindicaciones', 'dependencia',
  'tiempo_entrega',
])
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: response-track.ts — revert T2 + direccion_completa incluye departamento + export resolveSalesActionTemplates</name>
  <read_first>
    - src/lib/agents/somnio-recompra/response-track.ts LINEAS COMPLETAS (409 lineas) — leer todo una vez para entender el pipeline antes de editar
    - .planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Existing Patterns #3 (pipeline completo), §Pitfalls 1 (hasSaludoCombined no dropea imagen post-D-05), §Code Examples (Mini-diff response-track.ts)
    - src/lib/agents/somnio-recompra/state.ts linea 80-92 (createPreloadedState — confirma que departamento se preloadea)
    - src/lib/agents/somnio-recompra/types.ts linea 16-27 (DatosCliente interface — confirma que state.datos.departamento: string | null existe)
  </read_first>
  <behavior>
    - Test 1 (post-cambio): `TEMPLATE_LOOKUP_AGENT_ID` constante contiene literal `'somnio-recompra-v1'` (verified by grep).
    - Test 2 (post-cambio + Plan 04): llamar `resolveSalesActionTemplates('preguntar_direccion', state)` con `state.datos = {direccion: 'Calle 48A #27-85', ciudad: 'Bucaramanga', departamento: 'Santander', ...}` devuelve `extraContext.direccion_completa === 'Calle 48A #27-85, Bucaramanga, Santander'`.
    - Test 3 (post-cambio + Plan 04): importar `resolveSalesActionTemplates` desde `response-track.ts` NO falla (funcion exportada).
    - Test 4 (post-cambio): si `state.datos.departamento` es `null`, `direccion_completa` = `'Calle 48A #27-85, Bucaramanga'` (filter(Boolean) dropea null — idempotente).
  </behavior>
  <action>
    Abrir `src/lib/agents/somnio-recompra/response-track.ts` y aplicar **3 cambios exactos**:

    **Cambio 1 — Linea 39 (revert T2, D-02):**

    OLD (linea 39):
    ```typescript
    const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3'
    ```

    NEW (linea 39):
    ```typescript
    const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'
    ```

    **Tambien actualizar el comment de las lineas 28-37** (reemplazar el comment de justificacion que hoy dice "recompra reuses the somnio-sales-v3 template set" — describe el estado PRE-fix). Reemplazar por:

    ```typescript
    // ============================================================================
    // Template lookup agent_id
    // ============================================================================
    // Recompra has its own independent template catalog under agent_id='somnio-recompra-v1'.
    // See phase somnio-recompra-template-catalog (CONTEXT.md D-01) — recompra is "a
    // different agent" per user decision, and maintains its own copy (saludo, preguntar
    // direccion, informational templates).
    //
    // T2 of recompra-greeting-bugs (commit cdc06d9) temporarily pointed this to
    // 'somnio-sales-v3' because the recompra-v1 catalog was incomplete. The catalog
    // migration (supabase/migrations/<ts>_recompra_template_catalog.sql, Plan 01 of this
    // phase) completed the catalog, and this constant reverts to the correct agent id (D-02).
    ```

    **Cambio 2 — Linea 283 (export para testeability):**

    OLD (linea 283):
    ```typescript
    async function resolveSalesActionTemplates(
    ```

    NEW (linea 283):
    ```typescript
    export async function resolveSalesActionTemplates(
    ```

    **Cambio 3 — Linea 346 (D-12, direccion_completa incluye departamento):**

    OLD (lineas 341-349 region — ubicar el branch `faltantes.length === 0 || (direccion && ciudad)`):
    ```typescript
        if (faltantes.length === 0 || (direccion && ciudad)) {
          // All critical data present — ask for address confirmation
          return {
            intents: ['preguntar_direccion_recompra'],
            extraContext: {
              direccion_completa: [direccion, ciudad].filter(Boolean).join(', '),
              nombre_saludo: getGreeting(state.datos.nombre),
            },
          }
        }
    ```

    NEW (mismas lineas — añadir `state.datos.departamento` al array de concat):
    ```typescript
        if (faltantes.length === 0 || (direccion && ciudad)) {
          // All critical data present — ask for address confirmation.
          // direccion_completa includes departamento per D-12 (Plan 02 of
          // somnio-recompra-template-catalog) — the template contract requires
          // "direccion + ciudad + departamento" concatenated with ", ".
          return {
            intents: ['preguntar_direccion_recompra'],
            extraContext: {
              direccion_completa: [direccion, ciudad, state.datos.departamento].filter(Boolean).join(', '),
              nombre_saludo: getGreeting(state.datos.nombre),
            },
          }
        }
    ```

    **Dejar INTACTO el branch `!datosCriticos` (lineas 352-360)** — usa `campos_faltantes` no `direccion_completa`, y D-12 solo lockea el happy path (Open Q#2 en RESEARCH — Opcion A: documentar como deuda en LEARNINGS, no tocar aqui).

    **Verificar post-edicion con typecheck:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-02-01.log
    # Expected: exit 0, sin errors nuevos en response-track.ts.
    ```

    Si el typecheck falla en otros archivos pre-existentes (deuda tecnica documentada en STATE.md), verificar que ningun error nuevo se introduzca por estos cambios:
    ```bash
    npm run typecheck 2>&1 | grep -E "response-track\.ts:(39|283|346)"
    # Expected: 0 lineas (no errors en las lineas editadas)
    ```

    **Commit atomico:**
    ```bash
    git add src/lib/agents/somnio-recompra/response-track.ts
    git commit -m "refactor(somnio-recompra-template-catalog): revert T2 + direccion_completa con departamento + export resolveSalesActionTemplates (D-02, D-12)"
    ```

    **NO push.**
  </action>
  <verify>
    <automated>grep -q "^const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'$" src/lib/agents/somnio-recompra/response-track.ts</automated>
    <automated>! grep -q "const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-sales-v3'" src/lib/agents/somnio-recompra/response-track.ts</automated>
    <automated>grep -q "^export async function resolveSalesActionTemplates(" src/lib/agents/somnio-recompra/response-track.ts</automated>
    <automated>grep -q "direccion_completa: \[direccion, ciudad, state.datos.departamento\].filter(Boolean).join(', ')" src/lib/agents/somnio-recompra/response-track.ts</automated>
    <automated>! grep -qF "direccion_completa: [direccion, ciudad].filter(Boolean).join(', ')" src/lib/agents/somnio-recompra/response-track.ts</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-02-01.log; ! grep -E "response-track\.ts:(39|283|346)" /tmp/tc-02-01.log | grep -q "error"</automated>
    <automated>git log -1 --format=%s | grep -qF "refactor(somnio-recompra-template-catalog): revert T2 + direccion_completa con departamento + export resolveSalesActionTemplates"</automated>
  </verify>
  <acceptance_criteria>
    - `response-track.ts:39` contiene exactamente `const TEMPLATE_LOOKUP_AGENT_ID = 'somnio-recompra-v1'`.
    - `response-track.ts:283` empieza con `export async function resolveSalesActionTemplates(` (prefijo `export` añadido).
    - La line del happy path `direccion_completa` contiene literal `[direccion, ciudad, state.datos.departamento].filter(Boolean).join(', ')`.
    - El branch `!datosCriticos` (campos_faltantes) sigue intacto (NO se toco).
    - El comment sobre T2 en lineas 28-37 fue reemplazado por la justificacion nueva que describe el estado post-migration.
    - `npm run typecheck` no produce errors NUEVOS en lineas 39/283/346 (errors pre-existentes en otros archivos son acceptable).
    - Commit atomico con mensaje empezando con `refactor(somnio-recompra-template-catalog): revert T2 + direccion_completa con departamento`.
  </acceptance_criteria>
  <done>
    - 3 cambios aplicados en response-track.ts + comment actualizado.
    - Typecheck OK (sin errores nuevos).
    - Commit en git, NO pusheado.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: constants.ts — agregar 'registro_sanitario' a INFORMATIONAL_INTENTS (D-06)</name>
  <read_first>
    - src/lib/agents/somnio-recompra/constants.ts LINEAS COMPLETAS (152 lineas) — archivo pequeño, leerlo todo
    - .planning/standalone/somnio-recompra-template-catalog/CONTEXT.md §Decisiones D-06
    - .planning/standalone/somnio-recompra-template-catalog/RESEARCH.md §Pitfalls 5 (descripcion del bug preexistente)
    - src/lib/agents/somnio-recompra/comprehension-prompt.ts (grep `registro_sanitario` para confirmar que Haiku ya lo clasifica — no hace falta tocar este archivo)
  </read_first>
  <behavior>
    - Test (post-cambio): `INFORMATIONAL_INTENTS.has('registro_sanitario') === true`.
    - Test (post-cambio): el resto de los intents (saludo, precio, promociones, pago, envio, ubicacion, contraindicaciones, dependencia, tiempo_entrega) siguen presentes. `INFORMATIONAL_INTENTS.size === 10` (antes 9).
    - Test (runtime, integrado en Plan 04): si Haiku devuelve `intent='registro_sanitario'`, `response-track.ts:82` hace `infoTemplateIntents.push('registro_sanitario')` → template con ese intent se emite al cliente.
  </behavior>
  <action>
    Abrir `src/lib/agents/somnio-recompra/constants.ts` y aplicar **1 cambio exacto** en las lineas 67-71:

    OLD (lineas 66-71):
    ```typescript
    /** Intents that the response track always answers (informational questions). 9 total. */
    export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
      'saludo', 'precio', 'promociones',
      'pago', 'envio', 'ubicacion', 'contraindicaciones', 'dependencia',
      'tiempo_entrega',
    ])
    ```

    NEW (mismas lineas — insertar `'registro_sanitario'` en la linea 69 + actualizar el comment count de 9 a 10):
    ```typescript
    /** Intents that the response track always answers (informational questions). 10 total. */
    export const INFORMATIONAL_INTENTS: ReadonlySet<string> = new Set([
      'saludo', 'precio', 'promociones',
      'pago', 'envio', 'registro_sanitario', 'ubicacion', 'contraindicaciones', 'dependencia',
      'tiempo_entrega',
    ])
    ```

    **Nota:** La posicion `'registro_sanitario'` entre `'envio'` y `'ubicacion'` es elegida por legibilidad (agrupar items cortos). El orden NO importa funcionalmente (es un Set). Lo importante es que el string `'registro_sanitario'` este dentro del array argumento del Set constructor.

    **Verificar con typecheck + grep:**
    ```bash
    npm run typecheck 2>&1 | tee /tmp/tc-02-02.log
    # Expected: exit 0, no errors nuevos en constants.ts.

    grep -c "'registro_sanitario'" src/lib/agents/somnio-recompra/constants.ts
    # Expected: 2 (uno en RECOMPRA_INTENTS linea 25, uno nuevo en INFORMATIONAL_INTENTS linea 69)
    ```

    **Commit atomico:**
    ```bash
    git add src/lib/agents/somnio-recompra/constants.ts
    git commit -m "fix(somnio-recompra-template-catalog): agregar registro_sanitario a INFORMATIONAL_INTENTS (D-06)"
    ```

    **NO push.**
  </action>
  <verify>
    <automated>grep -q "'registro_sanitario'," src/lib/agents/somnio-recompra/constants.ts</automated>
    <automated>test $(grep -c "'registro_sanitario'" src/lib/agents/somnio-recompra/constants.ts) -eq 2</automated>
    <automated>grep -A4 "INFORMATIONAL_INTENTS" src/lib/agents/somnio-recompra/constants.ts | grep -q "registro_sanitario"</automated>
    <automated>npm run typecheck 2>&1 | tee /tmp/tc-02-02.log; ! grep -F "constants.ts" /tmp/tc-02-02.log | grep -q "error"</automated>
    <automated>git log -1 --format=%s | grep -qF "fix(somnio-recompra-template-catalog): agregar registro_sanitario a INFORMATIONAL_INTENTS"</automated>
  </verify>
  <acceptance_criteria>
    - `constants.ts:INFORMATIONAL_INTENTS` Set incluye el string `'registro_sanitario'` (verificado via grep y scope line-check).
    - El comment describiendo el count fue actualizado de `9 total` a `10 total`.
    - El Set tiene 10 items distintos (sin duplicados).
    - `RECOMPRA_INTENTS` (linea 18-50) NO se modifica — `'registro_sanitario'` ya estaba ahi (verificado en constants.ts:25).
    - `npm run typecheck` no produce errores nuevos en constants.ts.
    - Commit atomico con mensaje empezando con `fix(somnio-recompra-template-catalog): agregar registro_sanitario`.
  </acceptance_criteria>
  <done>
    - 1 cambio en constants.ts (+ comment count).
    - Typecheck OK.
    - Commit en git, NO pusheado.
  </done>
</task>

</tasks>

<verification>
- `response-track.ts:39` contiene `'somnio-recompra-v1'` y NO contiene `'somnio-sales-v3'` como constante de TEMPLATE_LOOKUP_AGENT_ID.
- `response-track.ts:283` tiene el prefix `export` en `resolveSalesActionTemplates`.
- `response-track.ts` branch happy-path de preguntar_direccion contiene `state.datos.departamento` en el filter/join.
- `constants.ts` INFORMATIONAL_INTENTS Set contiene `'registro_sanitario'`.
- `npm run typecheck` pasa exit 0 o no introduce errores nuevos (pre-existentes aceptables).
- 2 commits atomicos en git (Task 1 + Task 2) NO pusheados.
</verification>

<success_criteria>
- Plan 04 puede importar `resolveSalesActionTemplates` directamente para tests unitarios puros (sin mock de resolveResponseTrack).
- Plan 05 Task 2 puede pushear todo junto con confianza — el codigo referencia catalog que Plan 05 Task 1 acaba de aplicar.
- Deuda `registro_sanitario` resuelta preventivamente (aunque no sea el foco primario de la fase).
</success_criteria>

<output>
After completion, create `.planning/standalone/somnio-recompra-template-catalog/02-SUMMARY.md` documenting:
- Commit hash de Task 1 (`refactor(...): revert T2 + direccion_completa...`)
- Commit hash de Task 2 (`fix(...): agregar registro_sanitario...`)
- Diff exacto de las lineas modificadas (copiar los 3 cambios del action de Task 1 + 1 cambio de Task 2)
- Output del typecheck — confirmar que no hay errores nuevos introducidos
- Confirmacion explicita: "NO pusheado — esperar Plan 05"
</output>
