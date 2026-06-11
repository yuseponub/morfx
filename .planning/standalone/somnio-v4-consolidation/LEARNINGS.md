# Standalone: somnio-v4-consolidation - Learnings

**Fecha:** 2026-06-10/11
**Duración:** ~2 días (12 planes, 9 waves; Wave 2 paralela en worktrees)
**Plans ejecutados:** 12 + code review + fix + verificación

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| **CR-01 (Critical): sandbox construía mutation-tools REALES contra workspace real** | La extracción del core (Plan 11) perdió `simulate: true` — el core no lo construía en `V4AgentInput` y nadie lo threadeaba; `runCrmGate` recibía `simulate ?? false`. D-22 invertido silenciosamente | Campo neutral `simulate?: boolean` en `TurnCoreInput`, threadeado por el core; sandbox setea `true` (`73e9a7e8`) | Ver "El punto ciego de los mocks" abajo — la lección central de la fase |
| **H-01: retry de `VersionConflictError` muerto** | El catch-all de `loopBody()` del core convertía el error a `{kind:'error'}` antes de poder escapar al wrapper; el runner viejo reintentaba 3× | Wrapper inspecciona `result.cause instanceof VersionConflictError` y reintenta (máx 3) (`6affc832`) | Inventariar paths de error con semántica especial ANTES de extraer; el catch-all genérico se los traga |
| **H-02: `systemEvent` perdido → timers del sandbox rotos** | `sandbox-adapters.ts` lo destructuraba sin usarlo; turnos de timer entraban por comprehension con mensaje vacío | Campo neutral `systemEvent` en `TurnCoreInput` (`73e9a7e8`) | Mismo punto ciego que CR-01 |
| **M-01: early-return CKPT-6b Path B exponía output descartado** | El shape viejo era `{success:true, messages:[], sin newMode}`; el nuevo filtraba el output de msg1 no comprometido → handoff fantasma posible | Flag `outputDiscarded` en el core + supresión en `mapResult` del runner (`73e9a7e8` + `6affc832`) | Los early-returns también son contrato — caracterizar su shape, no solo el happy path |
| Bug G-3 (pre-existente, matado en Plan 03): `sentMessageContents.push` de texto jamás enviado | Branch fallback inerte que el adapter parent dropeaba | Borrado + warning observable `v4_messages_without_templates` | Código muerto que "parece" funcional miente en la observabilidad |

## El Punto Ciego de los Mocks (lección central)

**NI los 353 tests de caracterización, NI los smokes E2E, NI los gates D-10/D-11 detectaron CR-01/H-01/H-02.** Los encontró el code review post-fase. Causa raíz común: las suites de paridad mockean el agente completo y **no asertan los campos del `V4AgentInput`** que recibe — un mock que ignora su input es un agujero en el gate, y el diff-cero de Regla 6 no aplica a archivos nuevos (el core).

**Regla para futuras extracciones de mecanismo:**
1. Antes de extraer, inventariar TODOS los campos del input/output en la frontera (no solo los que el happy path usa).
2. Por cada campo: un assert de threading (el mock captura el input y se verifica el campo). Los tests E11/E12 añadidos en el fix son el patrón.
3. Paths de error con semántica especial (retry, discriminadores `interrupted_at_ckpt_`) necesitan test dedicado — el catch-all los neutraliza en silencio.
4. Code review post-extracción NO es opcional: es el único gate que lee el diff con ojos de contrato, no de asserts.

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Orden W1 (limpiar muerto) → gate → W2 (extraer) | Extraer directo | El core nunca contiene código muerto; blast radius de regresión acotado a 4 planes en el gate intermedio |
| Extracción de menor a mayor blast radius: helper checkpoint → drain/struct → orchestrator → wrapper prod → wrapper sandbox | Big-bang | Cada paso deja la suite verde con asserts intactos; el orchestrator fue "move, no rewrite" porque el loop ya estaba delgado |
| Suite del consumidor viejo = suite de facto del core | Suite nueva del core | 353 asserts de caracterización ya codificaban el comportamiento real de producción (con el caveat del punto ciego arriba) |
| D-15 deprecación (no borrado) de `confidence` legacy | Borrarlo | Load-bearing en guards R0 (Pitfall 4 del audit) |
| Campos neutrales en `TurnCoreInput` (`simulate`, `systemEvent`, `phoneNumber`) | Special-case sandbox dentro del core | El core no debe saber quién lo llama; los adapters parametrizan |

## Metodología de Smokes con LLM Vivo (reusable)

- Baseline con flaky documentado ANTES de tocar código (BASELINE.md §"Divergencias flaky" — el baseline corrido 2 veces sin refactor ya mostraba 7 casos oscilantes).
- Pitfall 12: 1 re-run por caso divergente; errores de infra LLM (Gemini "high demand") NO cuentan como FAIL del sistema; se compara la DECISIÓN, no el texto.
- Carve-out con análisis de causa raíz: divergencia persistente se exonera SOLO si (a) el diff de la lógica de decisión está vacío, (b) el caso ya estaba documentado como flaky, (c) la dirección es segura (generated→handoff).
- **El porcentaje de smokes NO es el gate** (~70-85% estabilidad corrida-a-corrida es lo normal de esta suite); el gate real son los tests deterministas + el diff.

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| Stubs de los planes | Realidad del código | Conteos/ubicaciones desactualizados: `LostLockError` vive en `v4-messaging-adapter` (no en interruption-system-v2), sub-loop tenía 4 sites de checkpoint (no 3), pares Path A/B comparten 1 drain físico | Executors resolvieron con deviations Rule 1/3 documentadas; **pasar las deviations de plan en plan vía SUMMARYs** evitó tropezar dos veces con el mismo stub |
| Sesión GSD | Sesión concurrente del usuario (vivificacion-v3) en main | Commits interleaved + 125 archivos dirty no relacionados | `git pull --rebase` antes de cada push + stage explícito por path (NUNCA `git add -A`) + verificación nominal por archivo en el gate Regla 6 |
| Worktrees (Wave 2 paralela) | `.env.local` y push | Worktrees no tienen untracked files → smokes/push imposibles dentro de worktree | Planes con smokes o push (06, 12) corren SIN aislamiento en el main tree |

## Tips para Futuros Agentes

### Lo que funcionó bien
- Wave 2 con 4 executors paralelos en worktrees (cero overlap de `files_modified`) + merge secuencial + gate de tests post-merge.
- Gate intermedio (Plan 06) como punto de no-retorno verificado entre limpieza y extracción.
- El bug-class del 2026-05-28 (fix doble dropOwnEntry/carryState) quedó estructuralmente imposible: mecanismo único en `core/`.

### Lo que NO hacer
- NO confiar en suites que mockean el componente extraído sin asertar su input.
- NO duplicar un drain físico compartido entre Path A/B "para que cuadre el conteo" — re-leería la pending list (drain es destructivo).
- NO correr smokes LLM como gate numérico sin baseline de flakiness previo.

### Patrones a seguir
- Mantenimiento del core: cambio al mecanismo → SOLO en `src/lib/agents/somnio-v4/core/` (ambos wrappers lo heredan); cambio de un lado → solo en su adapter/wrapper. Leer `INTERRUPTION-PARITY.md` (ahora "diferencias de adapters") antes de tocar interrupción.
- Pitfalls 1/3/4 del audit confirmados y corregidos en docs (Plan 05): el AUDIT tenía 3 imprecisiones que se anotaron en sección "Correcciones post-research".

### Comandos útiles
```bash
# Suite canónica (post-fase: 358 passed | 7 skipped)
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
# Gate Regla 6 nominal por archivo
git log --grep="somnio-v4-consolidation" --oneline -- src/lib/agents/engine/v3-production-runner.ts   # debe ser vacío
```

## Deuda

**Resuelta:** ~900 líneas muertas (D-12/13/14), 3 labels fantasma (D-16), rename M-6, docs M-7, bug G-3, deuda carryState 08/09 (vía `getSeedState(carry?)`), L-01 incidental.

**Creada/pendiente:**
- M-02 (pre-existente, visibilidad): `LostLockError` tragado por catches genéricos del agente/sub-loop legacy — defensa zombie degradada.
- L-02..L-05 del REVIEW.md (calidad, no fijados deliberadamente).
- P1-3 sigue viva: saturación Gemini sin fallback → standalone candidato **`gemini-fallback-haiku`** (prioritario pre-flip RAG) + **`v4-smoke-stability`** (calibración gates borderline). Anotados en memoria 2026-06-11.
