# REGLA 6 — Evidencia de no-regresión (standalone somnio-v4-crm-subloop)

> **Regla 6 (CLAUDE.md):** cuando se modifica el comportamiento de un agente, el agente
> en producción debe seguir funcionando sin cambios. Este standalone toca el path
> `somnio-sales-v4` (DORMANT en prod, 0 workspaces); los **5 agentes no-v4 quedan
> byte-idénticos**. Esta evidencia lo demuestra.

---

## 1. BASELINE del standalone (clave — evita falso positivo)

**BASELINE = `6e0a8d1a5a6088198a29c6f1fc6272aab2b5f506`** (short `6e0a8d1a`).

Es el commit **inmediatamente anterior** al primer commit de este standalone
("docs(somnio-v4-crm-subloop): handoff .continue-here para resumir en plan-phase post-clear").

### Por qué NO se usa `main` como baseline

La rama de ejecución es `exec/debounce-v2-wave6`, que está **muchos commits adelante de
`main`** con trabajo **debounce-v2 AJENO** a este standalone (interruption-system-v2,
interrupt-reprocess, sandbox-integration, turn-ledger). Un `git diff ...main` matchearía
archivos de agentes sibling tocados por ese trabajo previo → produciría un **falso
Regla-6 violation** (o, peor, enmascararía uno real mezclando ambos conjuntos de cambios).

Por eso TODOS los diffs de esta evidencia usan `6e0a8d1a...HEAD`, NUNCA `main...HEAD`.

```bash
$ git rev-parse 6e0a8d1a
6e0a8d1a5a6088198a29c6f1fc6272aab2b5f506
```

---

## 2. Diff baseline-scoped — archivos de agente tocados

```bash
$ git diff --name-only 6e0a8d1a...HEAD -- src/lib/agents/ src/lib/domain/
src/lib/agents/engine/v4-production-runner.ts          # ← v4 path (runner)
src/lib/agents/shared/crm-mutation-tools/__tests__/orders.test.ts  # ← D-25 (test)
src/lib/agents/shared/crm-mutation-tools/orders.ts     # ← D-25 (updateOrder aditivo)
src/lib/agents/somnio-v4/__tests__/crm-actions-echo.test.ts
src/lib/agents/somnio-v4/__tests__/crm-gate.test.ts
src/lib/agents/somnio-v4/__tests__/crm-grounding.test.ts
src/lib/agents/somnio-v4/__tests__/crm-whitelist.test.ts
src/lib/agents/somnio-v4/__tests__/invocations.test.ts
src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
src/lib/agents/somnio-v4/__tests__/transitions.test.ts
src/lib/agents/somnio-v4/config.ts
src/lib/agents/somnio-v4/constants.ts
src/lib/agents/somnio-v4/crm-gate.ts
src/lib/agents/somnio-v4/crm-grounding.ts
src/lib/agents/somnio-v4/engine-v4.ts
src/lib/agents/somnio-v4/invocations.ts
src/lib/agents/somnio-v4/phase.ts
src/lib/agents/somnio-v4/response-track.ts
src/lib/agents/somnio-v4/somnio-v4-agent.ts
src/lib/agents/somnio-v4/sub-loop/crm-echo.ts
src/lib/agents/somnio-v4/sub-loop/index.ts
src/lib/agents/somnio-v4/sub-loop/prompt.ts
src/lib/agents/somnio-v4/sub-loop/tools.ts
src/lib/agents/somnio-v4/transitions.ts
src/lib/agents/somnio-v4/types.ts
src/lib/domain/__tests__/resolve-or-create-contact.test.ts  # ← D-24 (test)
src/lib/domain/contacts.ts                                  # ← D-24 (resolveOrCreateContact aditivo)
```

**Único agente cuyo código de producción cambió: `somnio-v4/**` + su runner
`engine/v4-production-runner.ts`.** Más dos toques a módulos **compartidos**
(justificados en §4). **NINGÚN** archivo bajo `somnio-v3/`, `godentist/`,
`godentist-fb-ig/`, `somnio-recompra/`, `somnio-pw-confirmation/`.

---

## 3. Greps de no-regresión (5 agentes intactos)

### 3.1 git diff baseline-scoped — los 5 siblings deben estar VACÍOS

```bash
$ git diff --name-only 6e0a8d1a...HEAD | grep -E "somnio-v3/|godentist/|godentist-fb-ig/|somnio-recompra/|somnio-pw-confirmation/"
(VACIO)
```

```bash
$ git diff --stat 6e0a8d1a -- \
    src/lib/agents/somnio-v3/ \
    src/lib/agents/godentist/ \
    src/lib/agents/godentist-fb-ig/ \
    src/lib/agents/somnio-recompra/ \
    src/lib/agents/somnio-pw-confirmation/
(salida vacía — 0 archivos, 0 inserciones, 0 borrados)
```

→ Los 5 agentes no-v4 son **byte-idénticos** al baseline.

### 3.2 Behavioral grep — el código v4 NO referencia constantes de otros agentes

```bash
$ grep -rn "GODENTIST_AGENT_ID\|'somnio-recompra-v1'\|'somnio-sales-v3-pw-confirmation'" src/lib/agents/somnio-v4/
(VACIO — v4 no referencia constantes de otros agentes)
```

→ No hay acoplamiento del comportamiento v4 hacia los siblings (anti-regresión del fix
provisional `cdc06d9` revertido en somnio-recompra, Pitfall 1 del scope godentist-fb-ig).

---

## 4. Justificación de los 2 toques a módulos compartidos (D-24 / D-25)

Ambos son **aditivos / opcionales** y por tanto Regla-6-safe:

| Toque | Archivo | Naturaleza | Por qué es seguro |
|-------|---------|------------|-------------------|
| **D-25** | `src/lib/agents/shared/crm-mutation-tools/orders.ts` (`updateOrder`) | Aditivo a `crm-mutation-tools` | El módulo tiene **0 consumidores en producción** (CLAUDE.md §crm-mutation-tools: "Sin consumidores en prod al ship — D-08 sin feature flag"). El único consumidor nuevo es el sub-loop v4 (DORMANT). Cambiar/extender una función de un módulo sin consumidores prod no altera ningún agente vivo. |
| **D-24** | `src/lib/domain/contacts.ts` (`resolveOrCreateContact`) | **Nueva función** en el domain layer | Es una función NUEVA, no una modificación a una existente. Los agentes prod siguen llamando a las funciones domain que ya usaban; la nueva función solo la consume el sub-loop v4 (DORMANT). |

Ninguno de los 2 toques cambia el comportamiento observable de v3 / godentist /
godentist-fb-ig / recompra / pw-confirmation.

---

## 5. Suite completa — phase gate VERDE

```bash
$ npx vitest run \
    src/lib/agents/somnio-v4/__tests__/ \
    src/lib/agents/shared/crm-mutation-tools/ \
    src/lib/agents/shared/crm-query-tools/ \
    src/lib/domain/__tests__/resolve-or-create-contact.test.ts \
    --exclude '**/{smoke-rag-*,few-shots}.test.ts'

 Test Files  20 passed | 1 skipped (21)
      Tests  192 passed | 3 skipped (195)
```

```bash
$ npx tsc --noEmit   # (filtrando los pre-existentes documentados)
# 0 errores NUEVOS
```

### Fallos PRE-EXISTENTES (NO regresiones, NO bloquean el gate)

Documentados en el prompt de ejecución como baseline-failures ajenos al CRM:

1. **`sub-loop/__tests__/few-shots.test.ts:132`** — el regex de tono "M1 probability
   framing" `compañero (humano )?experto` ya no matchea porque el prompt RAG fue
   rediseñado en un standalone PREVIO (`somnio-v4-rag-generative`). Verificado: el diff
   `6e0a8d1a...HEAD` de `sub-loop/prompt.ts` **no contiene** las líneas
   `compañero`/`experto`/`PROBABILIDAD` (este standalone no tocó el tono del prompt) →
   es una divergencia de baseline ajena al CRM, no una regresión.
2. **`somnio-v4/__tests__/smoke-rag-b.test.ts`** — network-bound (llama a modelos
   reales); excluido por diseño.
3. **6 errores tsc** en `conversations.test.ts` + `.next/dev/types/validator.ts** —
   pre-existentes, ajenos a este standalone.

Con estos excluidos, **0 fallos NUEVOS** aparecen → suite verde para el propósito del phase gate.

---

## 6. Estado en producción

- **v4 DORMANT** en prod: **0 workspaces** con `conversational_agent_id='somnio-sales-v4'`.
- **Sin feature flag** (D-16): la activación es manual per-workspace via
  `UPDATE workspace_agent_config SET conversational_agent_id='somnio-sales-v4' WHERE workspace_id='<uuid>'`.
- **Rollback = no activar** (revertir el UPDATE → v4 vuelve a DORMANT, cero efecto en clientes).

→ Regla 6 satisfecha: el path v4 está aislado y dormido; los 5 agentes en producción
quedan byte-idénticos al baseline `6e0a8d1a`.
