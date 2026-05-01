---
phase: somnio-sales-v4
plan: 04
subsystem: knowledge-base
tags: [gray-matter, openai-embeddings, pgvector, sha-256, zod, tsx]

# Dependency graph
requires:
  - phase: somnio-sales-v4
    provides: "Plan 01 — agent_knowledge_base table con columnas embedding(1536) + nunca_decir TEXT[] + body_hash"
  - phase: somnio-sales-v4
    provides: "Plan 02 — pgvector extension + vector search RPC (consumido en Plan 05)"
provides:
  - "parseKbDoc(raw, filePath) — gray-matter + Zod schema validator + section parser (D-45/D-49)"
  - "FrontmatterSchema (Zod) + Frontmatter type + ParsedKbDoc type"
  - "coherenceCheck(filePath, category) — folder vs frontmatter validator (D-48)"
  - "generateEmbedding(text) — OpenAI text-embedding-3-small (1536-dim) singleton wrapper"
  - "syncKbDoc(filePath, raw) — SHA-256 hash gate + upsert con persistencia nunca_decir (W-09 / D-51)"
  - "pnpm knowledge:sync CLI — recursive walk de src/lib/agents/somnio-v4/knowledge/**/*.md (D-55)"
  - "SOMNIO_V4_AGENT_ID + SOMNIO_WORKSPACE_ID literals (D-13, D-23)"
affects:
  - "Plan 05 — kb-search-tool reusa generateEmbedding y consume nunca_decir column desde RPC"
  - "Plan 09 — Inngest knowledge-sync function invocará syncKbDoc por archivo"
  - "Plan 11 — corpus inicial poblará knowledge/ y ejecutará pnpm knowledge:sync"

# Tech tracking
tech-stack:
  added:
    - "gray-matter ^4.0.3 (frontmatter YAML parser)"
    - "tsx ^4.21.0 devDependency (CLI runner — no estaba previamente)"
  patterns:
    - "Pattern: SHA-256 body hash gate para skip embedding regeneration (Pitfall 7)"
    - "Pattern: Singleton OpenAI client con lazy env-var validation (no falla en build/import)"
    - "Pattern: Section parser case-insensitive con/sin tilde para markdown headers"
    - "Pattern: normalizeFrontmatterDates() pre-Zod para Date→YYYY-MM-DD (gray-matter auto-Date pitfall)"

key-files:
  created:
    - "src/lib/agents/somnio-v4/config.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/parser.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/embed.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/sync.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts"
    - "src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts"
    - "scripts/knowledge-sync.ts"
  modified:
    - "package.json (gray-matter dep + tsx devDep + knowledge:sync script)"
    - "pnpm-lock.yaml"

key-decisions:
  - "D-13: SOMNIO_V4_AGENT_ID = 'somnio-sales-v4' literal (locked)"
  - "D-23: SOMNIO_WORKSPACE_ID hardcoded en config (workspace exclusivo)"
  - "D-24: Cero imports desde @/lib/agents/somnio-v3/* (verificado vía grep, 0 matches)"
  - "D-45: 7 frontmatter fields (5 required + 2 optional), Zod-validated"
  - "D-46: Section parser ignora silenciosamente headers desconocidos (extensibilidad)"
  - "D-48: coherence-check normaliza backslash Windows a forward-slash"
  - "D-49: 4 secciones canónicas (canonica/alternativa/nuncaDecir/sources)"
  - "D-51 / W-09: nunca_decir persistido verbatim en upsert payload (alimenta Plan 05 post-gen check)"
  - "D-55: pnpm knowledge:sync CLI vía tsx; auto-sync post-deploy en Plan 09"
  - "Pitfall 7: SHA-256 hash del body — skip embedding regen si hash coincide (cost gate)"

patterns-established:
  - "Pattern: Domain wrapper exception authorized — KB tabla nueva sin domain layer; createAdminClient AQUÍ es el único legítimo uso (RESEARCH Shared Patterns autoriza)"
  - "Pattern: Lazy singleton OpenAI client (no env-var read en module-load — solo en first call)"
  - "Pattern: gray-matter + Zod combo con normalize step intermedio (Date→string YYYY-MM-DD)"
  - "Pattern: Section parser flush-on-header con buffer dedupe (### no se confunde con ##)"
  - "Pattern: Recursive walkMd() con readdir+stat (no glob deps, Node nativo)"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-05-01
---

# Plan 04: Knowledge Base Sync Layer Summary

**Capa completa de Knowledge Base para somnio-sales-v4 — gray-matter parser + Zod frontmatter validation + coherence-check + OpenAI embeddings (text-embedding-3-small dim=1536) + sync core con SHA-256 hash gate + persistencia de `nunca_decir` column (W-09) + CLI tsx para `pnpm knowledge:sync`.**

## Performance

- **Duration:** ~25min (excluyendo `pnpm install` calls de ~5min total)
- **Started:** 2026-05-01T18:00:00Z (approx)
- **Completed:** 2026-05-01T23:12:00Z
- **Tasks:** 6 ejecutados (1-5 implementación atómica + 6 final/SUMMARY; commit/push de Wave-1 unificado se reemplazó por commits per-task según política CLAUDE.md y constraint del prompt — no push)
- **Files created:** 8 nuevos (5 KB-layer + 1 config + 1 CLI + 2 tests)
- **Files modified:** 2 (package.json + pnpm-lock.yaml)

## Accomplishments

- **Parser robusto** validado con 8 unit tests cubriendo cada D-45 frontmatter field + cada D-49 section + edge case (date Date-vs-string Pitfall fixed inline).
- **Coherence-check** validado con 3 tests (match, mismatch, Windows backslash normalization).
- **OpenAI wrapper** singleton-lazy listo para reuse en Plan 05 (kb-search-tool) sin re-init.
- **Sync core** con SHA-256 hash gate (Pitfall 7) — skip embedding regen cuando body no cambia, cost-effective ante deploys repetidos.
- **W-09 / D-51 verificado vía grep:** `nunca_decir: parsed.sections.nuncaDecir` presente en sync.ts línea 59.
- **CLI smoke test PASS:** `pnpm knowledge:sync` ejecuta exit-0 con corpus vacío reportando "(empty corpus — Plan 11 will populate)".
- **Cero leaks de v3:** D-24 verificado vía `grep -rE "from '@/lib/agents/somnio-v3" src/lib/agents/somnio-v4/` retorna 0.

## Task Commits

Cada task se committeó atómicamente:

1. **Task 1: gray-matter + tsx + knowledge:sync script** — `f4e915f` (chore)
2. **Task 2: config + parser + coherence-check** — `a2b892c` (feat)
3. **Task 3: parser + coherence-check tests** — `799ae54` (test, incluye Rule-1 fix gray-matter Date)
4. **Task 4: embed + sync core con hash gate + nunca_decir** — `0ab74c0` (feat)
5. **Task 5: CLI scripts/knowledge-sync.ts** — `a0ed186` (feat)
6. **Task 6: SUMMARY.md** — pendiente commit final post-write

## Files Created/Modified

### Created
- `src/lib/agents/somnio-v4/config.ts` — `SOMNIO_V4_AGENT_ID`, `SOMNIO_WORKSPACE_ID` literals (D-13/D-23)
- `src/lib/agents/somnio-v4/knowledge-base/parser.ts` — `parseKbDoc`, `FrontmatterSchema`, `Frontmatter`, `ParsedKbDoc`; gray-matter + Zod + section parser
- `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` — `coherenceCheck` (D-48)
- `src/lib/agents/somnio-v4/knowledge-base/embed.ts` — `generateEmbedding` (OpenAI text-embedding-3-small 1536-dim)
- `src/lib/agents/somnio-v4/knowledge-base/sync.ts` — `syncKbDoc`, `SyncResult`, re-exports `generateEmbedding` + `SOMNIO_WORKSPACE_ID`
- `src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` — 8 unit tests
- `src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` — 3 unit tests
- `scripts/knowledge-sync.ts` — CLI tsx wrapper para `pnpm knowledge:sync`

### Modified
- `package.json`: añade `"gray-matter": "^4.0.3"` (deps), `"tsx": "^4.21.0"` (devDeps), `"knowledge:sync": "tsx scripts/knowledge-sync.ts"` (scripts)
- `pnpm-lock.yaml`: lockfile regenerado

## Decisions Made

Plan ejecutado siguiendo decisions D-04, D-13, D-23, D-24, D-45, D-46, D-47, D-48, D-49, D-51, D-55 del CONTEXT.md. Decisión adicional in-flight:

- **Normalize Date→string antes de Zod** (no estaba en plan): gray-matter auto-parsea YAML `2026-05-01` como `Date` object. Plan asumía string. Solución defensiva: helper `normalizeFrontmatterDates()` convierte Date→`YYYY-MM-DD` antes de Zod safeParse, preservando regex format check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsx no estaba instalado**
- **Found during:** Task 1 (instalación gray-matter)
- **Issue:** Plan indica "verificar que tsx y openai ya están en dependencies", pero `tsx` no estaba en `package.json` ni en `node_modules`. El script `pnpm knowledge:sync` requeriría tsx para correr.
- **Fix:** `pnpm add -D tsx@^4.21.0` (devDependency).
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `node_modules/.bin/tsx` exists; smoke test `pnpm knowledge:sync` exit 0.
- **Committed in:** `f4e915f` (Task 1 commit)

**2. [Rule 1 - Bug] gray-matter auto-parsea YAML dates a Date objects**
- **Found during:** Task 3 (5 tests fallaron por "expected string, received Date")
- **Issue:** YAML loader de gray-matter convierte `last_reviewed: 2026-05-01` automáticamente a JS `Date` object. Schema Zod esperaba `string` con regex `^\d{4}-\d{2}-\d{2}$`. 5/11 tests fallaban con `Invalid input: expected string, received Date`. NO documentado en plan ni RESEARCH.
- **Fix:** Helper `normalizeFrontmatterDates(data)` antes de `FrontmatterSchema.safeParse(normalized)`. Si `data.last_reviewed instanceof Date` → `.toISOString().slice(0, 10)` (yields `YYYY-MM-DD`). Defensivo: spread original data, solo touchea Date fields. Mantiene el regex check para detectar formats inválidos como `MM-DD-YYYY` (que gray-matter deja como string).
- **Files modified:** src/lib/agents/somnio-v4/knowledge-base/parser.ts
- **Verification:** 11/11 tests pasan post-fix. Test "throws on last_reviewed with wrong format MM-DD-YYYY" sigue pasando (gray-matter no lo convierte a Date, lo deja como string, regex falla → throw correctamente).
- **Committed in:** `799ae54` (Task 3 commit; fix bundled con tests originales)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Ambos fixes necesarios para correctitud. No scope creep. tsx ya era implícitamente requerido por D-55. Date-normalization es invariante del stack gray-matter+Zod, no del plan.

## Issues Encountered

- **Pre-existing dirty working tree:** trabajado solo con `git add <archivos-específicos>` por task; ningún commit incluyó archivos fuera del `files_modified` list del plan. Trabajos in-progress de otras phases (voice-app, agent-godentist, debug docs, etc.) intactos en working tree.
- **`scripts/` excluido de tsconfig main:** `tsconfig.json` excluye `scripts/` directorio explícitamente. tsx resuelve directamente el alias `@/*` desde tsconfig en runtime, así que el CLI funciona — pero `npx tsc --noEmit` no le hace check. Aceptable (mismo patrón usado en otros scripts del repo).

## User Setup Required

Ninguno. Plan 04 es autónomo:
- Migraciones de Wave 0 (Plans 01-03) ya tienen archivos commit-listed pero NO aplicadas en prod (deferido a antes de Plan 11 según constraint del prompt). Plan 04 NO ejecuta queries contra esas tablas — solo expone funciones que se invocarán en Plan 09/11.
- `OPENAI_API_KEY` env var ya existe en Vercel (ya usada por data-extractor según RESEARCH). Validación lazy en `getOpenAI()` solo dispara cuando `generateEmbedding` se invoca (Plan 11+).

## Next Phase Readiness

**Listo para consumir desde:**
- **Plan 05 (kb-search-tool del sub-loop):** importará `generateEmbedding` desde `@/lib/agents/somnio-v4/knowledge-base/embed` (o re-export de sync.ts) y consumirá `result.nunca_decir` desde el RPC pgvector.
- **Plan 09 (Inngest knowledge-sync function):** invocará `syncKbDoc(filePath, raw)` por archivo desde Inngest step.run.
- **Plan 11 (corpus inicial):** poblará `src/lib/agents/somnio-v4/knowledge/{product,policies,edge-cases,faqs-no-templated}/*.md` y correrá `pnpm knowledge:sync` localmente; SQL migrations Wave 0 deben estar aplicadas en prod ANTES de este push (Regla 5).

**Sin blockers detectados.**

## Self-Check

Verificación post-write de claims del SUMMARY:

**Files (8 nuevos + 2 modificados):**
- `src/lib/agents/somnio-v4/config.ts` — FOUND
- `src/lib/agents/somnio-v4/knowledge-base/parser.ts` — FOUND
- `src/lib/agents/somnio-v4/knowledge-base/coherence-check.ts` — FOUND
- `src/lib/agents/somnio-v4/knowledge-base/embed.ts` — FOUND
- `src/lib/agents/somnio-v4/knowledge-base/sync.ts` — FOUND
- `src/lib/agents/somnio-v4/knowledge-base/__tests__/parser.test.ts` — FOUND
- `src/lib/agents/somnio-v4/knowledge-base/__tests__/coherence-check.test.ts` — FOUND
- `scripts/knowledge-sync.ts` — FOUND
- `package.json` — MODIFIED (gray-matter + tsx + knowledge:sync script)
- `pnpm-lock.yaml` — MODIFIED

**Commits (5 task-commits):**
- `f4e915f` (Task 1) — FOUND in git log
- `a2b892c` (Task 2) — FOUND in git log
- `799ae54` (Task 3) — FOUND in git log
- `0ab74c0` (Task 4) — FOUND in git log
- `a0ed186` (Task 5) — FOUND in git log

**Gates:**
- Tests: 11/11 PASS (8 parser + 3 coherence-check)
- TypeScript: `npx tsc --noEmit -p tsconfig.json` exit 0
- D-24 grep: `grep -rE "from '@/lib/agents/somnio-v3" src/lib/agents/somnio-v4/` → 0 matches
- W-09 grep: `nunca_decir: parsed.sections.nuncaDecir` presente en sync.ts línea 59
- gray-matter version: `4.0.3` (latest stable) confirmado en pnpm-lock.yaml
- Smoke test CLI: `pnpm knowledge:sync` exit 0 con mensaje "(empty corpus — Plan 11 will populate)"

## Self-Check: PASSED

---
*Phase: somnio-sales-v4*
*Plan: 04*
*Completed: 2026-05-01*
