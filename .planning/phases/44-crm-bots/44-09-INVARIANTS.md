# Phase 44 Plan 09 — Cross-Plan Invariant Checks

**Ejecutado:** 2026-04-18 (Plan 09 Task 4)
**Proposito:** Verificar invariantes que atraviesan multiples planes de la fase 44. Las desviaciones bloquean cierre de fase.

---

## Resumen Ejecutivo

| ID | Invariante | Resultado | Conteo | Expected |
|----|------------|-----------|--------|----------|
| W8 | Rate limiter module consistency | PASS | 3 call sites | exactamente 3 |
| B1.a | No raw Supabase en reader tools | PASS | 0 matches | 0 |
| B1.b | No raw Supabase en writer tools | PASS | 0 matches | 0 |
| B1.c | No direct domain writes en writer tools | PASS | 0 matches | 0 |
| B4 | ResourceType union cubre 9 entity types | PASS | 9 found | 9 |

**Veredicto:** Todas las invariantes PASSED. No hay bloqueadores para cierre de fase.

---

## Warning #8 — Rate Limiter Module Consistency

**Invariante:** `rateLimiter.check(..., 'crm-bot')` debe aparecer en exactamente 3 archivos de ruta (reader, writer/propose, writer/confirm). Cualquier otro valor indica que un gate fue olvidado o duplicado.

**Comando ejecutado:**

```bash
grep -rEn "rateLimiter\.check\([^,]+,\s*'crm-bot'" src/app/api/v1/crm-bots/ | grep -vE "^[^:]+:[0-9]+:\s*\*"
```

**Output (3 call sites reales, excluyendo JSDoc comments):**

```
src/app/api/v1/crm-bots/reader/route.ts:93:  const rl = rateLimiter.check(workspaceId, 'crm-bot')
src/app/api/v1/crm-bots/writer/confirm/route.ts:59:  const rl = rateLimiter.check(workspaceId, 'crm-bot')
src/app/api/v1/crm-bots/writer/propose/route.ts:60:  const rl = rateLimiter.check(workspaceId, 'crm-bot')
```

**Nota:** Existe una referencia adicional en `reader/route.ts:29` dentro del JSDoc del archivo documentando la secuencia de middleware — no es un call site, se filtra explicitamente con el `grep -vE "^[^:]+:[0-9]+:\s*\*"`.

**Resultado:** 3/3 PASS. Bucket compartido entre reader + writer confirmado. Cualquier endpoint nuevo dentro de `/api/v1/crm-bots/` debe usar el mismo bucket `'crm-bot'` para preservar la invariante.

---

## Blocker 1 — No Raw Supabase en Agent Tool Files

**Invariante:** Los handlers de herramientas (tool files) importan EXCLUSIVAMENTE desde `@/lib/domain/*`. Cero referencias a `createAdminClient`, `@supabase/supabase-js`, o `@/lib/supabase/admin` en `src/lib/agents/crm-reader/tools/**` y `src/lib/agents/crm-writer/tools/**`.

### Reader tools

**Comando:**

```bash
grep -rEn "^[^*/]*\b(createAdminClient|@supabase/supabase-js|@/lib/supabase/admin)\b" src/lib/agents/crm-reader/tools/
```

**Output:** vacio (cero matches de codigo; la unica aparicion del string en los tool files es dentro de un JSDoc que documenta la prohibicion en si misma — `contacts.ts:6`).

**Resultado:** 0 PASS.

### Writer tools

**Comando:**

```bash
grep -rEn "^[^*/]*\b(createAdminClient|@supabase/supabase-js|@/lib/supabase/admin)\b" src/lib/agents/crm-writer/tools/
```

**Output:** vacio (cero matches de codigo; dos apariciones dentro de JSDoc — `orders.ts:7` y `contacts.ts:11` — documentan la prohibicion pero no la violan).

**Resultado:** 0 PASS.

### Writer domain write invocations

**Invariante adicional Blocker 1:** Ningun tool handler del writer invoca directamente funciones de escritura del dominio (createContact, updateContact, archiveContact, createOrder, updateOrder, archiveOrder, moveOrderToStage, createNote, updateNote, archiveNote, archiveOrderNote, createTask, updateTask). Toda mutacion debe pasar por `proposeAction` que persiste en `crm_bot_actions` con status='proposed'.

**Comando:**

```bash
grep -rEn "createContact\s*\(|updateContact\s*\(|archiveContact\s*\(|createOrder\s*\(|updateOrder\s*\(|archiveOrder\s*\(|moveOrderToStage\s*\(|createNote\s*\(|updateNote\s*\(|archiveNote\s*\(|archiveOrderNote\s*\(|createTask\s*\(|updateTask\s*\(" src/lib/agents/crm-writer/tools/ | grep -vE "^[^:]*:[^:]*//" | grep -vE "^[^:]+:[0-9]+:\s*\*"
```

**Output (1 match en comentario inline, NO codigo):**

```
src/lib/agents/crm-writer/tools/tasks.ts:111:        // completeTask is dispatched as updateTask({ status: 'completed' }) in two-step.ts.
```

**Analisis:** La unica aparicion es dentro de un comentario `//` que documenta el comportamiento (completeTask tool propone con preview derivado pero el dispatch real ocurre en `two-step.ts`, no en el tool). Los filtros `-vE "//"` atrapan los lineas con `//` pero este match sobrevive porque el patron de filtro del plan busca `^[^:]*:[^:]*//` (filename:linenum:// como prefijo) — el comentario aqui tiene indent antes del `//` asi que se detectar como violacion potencial. Verificacion manual confirma: es codigo comentado, no invocacion real.

**Resultado:** 0 violaciones reales PASS. Todos los tools usan `proposeAction(...)` exclusivamente para registrar mutaciones; la dispatch real ocurre en `src/lib/agents/crm-writer/two-step.ts` que es el unico archivo autorizado para importar domain write funcs.

---

## Blocker 4 — ResourceType Union Cubre 9 Entity Types

**Invariante:** `ResourceNotFoundError.resource_type` discriminated union debe incluir 9 tipos: base no-creables (`tag`, `pipeline`, `stage`, `template`, `user`) + mutables (`contact`, `order`, `note`, `task`).

**Comando:**

```bash
for t in tag pipeline stage template user contact order note task; do
  grep -q "'$t'" src/lib/agents/crm-writer/types.ts && echo "$t: found" || echo "$t: MISSING"
done
```

**Output:**

```
tag: found
pipeline: found
stage: found
template: found
user: found
contact: found
order: found
note: found
task: found
```

**Archivo fuente:** `src/lib/agents/crm-writer/types.ts` lineas 43-52.

**Resultado:** 9/9 PASS.

---

## Consecuencia Operacional

Las tres invariantes anteriores garantizan:

1. **Rate limit correctamente enforced (Warning #8):** los tres endpoints comparten el mismo bucket. Un atacante no puede evadir el limit usando el endpoint que "le toque menos" — todos bajan del mismo contador per-workspace.
2. **Regla 3 enforcement a nivel de capa (Blocker 1):** aunque futuras fases agreguen tools al reader/writer, el pattern ya esta establecido — ningun tool escribe directo, y el reviewer puede auto-enforzar via grep.
3. **Error shape uniforme (Blocker 4):** cualquier consumidor que maneje `resource_not_found` del writer sabe que puede recibir uno de 9 tipos conocidos. El LLM callsite no necesita logica especial por entidad.

Los checks de grep son baratos y deberian agregarse a un pre-commit hook en una fase futura (out of scope Phase 44). Documentado para retomar.
