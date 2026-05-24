# Plan 09 — Schema fix discriminated union (Opción Z)

**Status:** DRAFT — pending user approval before execute-phase.
**Date:** 2026-05-24
**Reason:** mitigar AI_NoOutputGeneratedError observado en sesión `d958cd2f` ("tomo metformina para diabetes" turn 2, stepCount=0 latency 18.8s ambos attempts del retry).

## Goal

Reducir frecuencia del bug `AI_NoOutputGeneratedError` con `stepCount=0` en el tooling-call del sub-loop RAG, **sin tocar arquitectura**. Solo refactor del `ToolingOutputSchema` a `z.discriminatedUnion` para reducir ambigüedad de strict mode en OpenAI structured outputs.

## Context

Auditor externo identificó 3 causas para el bug (`07b-AUDIT.md` extendido + investigación en conversación 2026-05-23):
- (b) bug abierto en `vercel/ai` #10235, #13075, #11348 — HIGH prob, no arregla
- (c) OpenAI design limitation tools + response_format strict — HIGH prob, no arregla
- (d) **antipatterns en schema nuestro** — MEDIUM-HIGH prob, **ESTE es el target del Plan 09**

Quote auditor: *"Sin estos [antipatterns], el combo (b)+(c) podría fallar 1/1000; con estos podría fallar 1/50."*

Plan 09 = solo arreglar (d). Resultado esperado: reducción ~95% en frecuencia del bug. **NO eliminación.**

## Tasks

### Task 1 — Refactor `ToolingOutputSchema` (tooling-call.ts)

**Antes:**
```ts
ToolingOutputSchema = z.object({
  topic_seleccionado: z.string().nullable(),
  material_del_topic: z.object({
    hechos: z.string().nullable(),
    posicion: z.string().nullable(),
    debe_contener_aplicables: z.array(z.string()).nullable(),
    nunca_decir: z.array(z.string()).nullable(),
    cuando_escalar: z.array(z.string()).nullable(),
  }).nullable(),
  should_handoff: z.boolean(),
  handoff_reason: z.string().nullable(),
})
```

**Después:**
```ts
ToolingOutputSchema = z.discriminatedUnion('should_handoff', [
  z.object({
    should_handoff: z.literal(true),
    handoff_reason: z.string(),
    topic_seleccionado: z.null(),
    material_del_topic: z.null(),
  }),
  z.object({
    should_handoff: z.literal(false),
    handoff_reason: z.null(),
    topic_seleccionado: z.string(),
    material_del_topic: z.object({
      hechos: z.string(),
      posicion: z.string(),
      debe_contener_aplicables: z.array(z.string()),
      nunca_decir: z.array(z.string()),
      cuando_escalar: z.array(z.string()),
    }),
  }),
])
```

**Comentario en código:** explicar por qué (link a este plan + auditor).

### Task 2 — Adaptar consumers en `sub-loop/index.ts`

Líneas 230-233 ya checkean `tooling.should_handoff || !tooling.topic_seleccionado || !tooling.material_del_topic` — el TypeScript narrowing del discriminated union las simplifica a solo `tooling.should_handoff`. Mantener el extra-check defensivo está OK (defense in depth), no rompe nada.

Líneas 343, 344, 403, 483 acceden a `tooling.material_del_topic.X` — funcionan post-narrowing porque ya pasaron el guard.

**Action:** verificar typecheck. Si TS se queja en alguna línea, ajustar. No cambiar lógica.

### Task 3 — Adaptar `prompt.ts`

Línea 191: `material: NonNullable<ToolingOutput['material_del_topic']>` necesita cambiar.

**Nuevo:** `material: Extract<ToolingOutput, { should_handoff: false }>['material_del_topic']`

(extrae el material del shape success, garantizando no-null por construcción).

### Task 4 — Adaptar `debug-payload.ts`

Línea 96: `output: import('./tooling-call').ToolingOutput` — el type union sigue válido sin cambios. Verificar typecheck.

### Task 5 — Smoke local

```bash
pnpm tsc --noEmit
pnpm test src/lib/agents/somnio-v4/sub-loop/
```

Esperado: 0 type errors, tests verdes (no hay tests del schema directo, los tests existentes prueban otros aspectos).

### Task 6 — Push a Vercel + smoke E2E manual

```bash
git add src/lib/agents/somnio-v4/sub-loop/
git commit -m "fix(somnio-v4 sub-loop): schema tooling-call como discriminated union (Plan 09 Opción Z)"
git push origin main
```

Usuario corre en sandbox:
- `tomo metformina para diabetes` × 5 retries → esperado: 5/5 sin `AI_NoOutputGeneratedError`
- `soy adulto mayor de 65, me sirve?` × 3 → esperado: handoff correcto (Plan reciente lo arregló)
- Casos normales (`tengo gastritis ocasional` etc.) → esperado: respuesta generada normal

## Out of scope

- **NO** refactor de arquitectura (Y3-B → diferido a Plan 10 si Plan 09 insuficiente).
- **NO** cambio de modelos.
- **NO** cambios en `kb-search-tool.ts`.
- **NO** cambios en `generation-call.ts` ni `compliance-check.ts`.
- **NO** cambios en KBs (eso es contenido, no schema).

## Success criteria

- `pnpm tsc --noEmit` retorna 0 errores.
- `pnpm test src/lib/agents/somnio-v4/sub-loop/` verde.
- Smoke E2E sandbox: caso "metformina" produce respuesta válida en ≥4/5 retries (vs 0/2 antes).

## Failure mode

Si después del schema fix el caso "metformina" sigue rompiendo:
- Logear con observability cuándo ocurre `AI_NoOutputGeneratedError`
- Escalar a Plan 10 = arquitectura Y3-B (sin tools)

## Rollback

`git revert <commit-hash>` — los cambios son contenidos en 3-4 archivos.

## Files touched (estimado)

```
M src/lib/agents/somnio-v4/sub-loop/tooling-call.ts    (~30 líneas)
M src/lib/agents/somnio-v4/sub-loop/index.ts            (~0-5 líneas, posible no-op TS)
M src/lib/agents/somnio-v4/sub-loop/prompt.ts           (~3 líneas)
M src/lib/agents/somnio-v4/sub-loop/debug-payload.ts    (~0 líneas, posible no-op TS)
```

**Total estimado: ~30-40 líneas modificadas.**

## Effort estimate

- Coding: 30-45 min
- Smoke local: 10 min
- Push + user smoke E2E: 10-15 min
- **TOTAL: ~1 hora**
