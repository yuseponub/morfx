---
phase: ui-agent-content-editor
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/knowledge-base/serialize.ts
  - src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts
  - src/lib/domain/__tests__/agent-templates.test.ts
  - src/lib/domain/__tests__/agent-knowledge-base.test.ts
  - scripts/__tests__/knowledge-sync-guard.test.ts
autonomous: true
requirements: [D-01, D-01b, D-02, D-06, D-08, D-09, D-10]
nyquist_compliant: true

must_haves:
  truths:
    - "buildContentToEmbed produces one deterministic string from KB column values (no .md, no parser)"
    - "The serializer string form is locked by an exact-output unit test"
    - "Test stub files exist for both new domain files and the sync guard so later waves have a RED target"
  artifacts:
    - path: "src/lib/agents/somnio-v4/knowledge-base/serialize.ts"
      provides: "Canonical buildContentToEmbed(row) shared by migration re-embed + UI domain"
      contains: "export function buildContentToEmbed"
    - path: "src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts"
      provides: "Exact-output lock test for the serializer (A1 / Pitfall 1)"
    - path: "src/lib/domain/__tests__/agent-templates.test.ts"
      provides: "RED stubs for D-02 / D-08 / Regla 3"
    - path: "src/lib/domain/__tests__/agent-knowledge-base.test.ts"
      provides: "RED stubs for D-01b / D-06 / D-09 / D-10"
    - path: "scripts/__tests__/knowledge-sync-guard.test.ts"
      provides: "RED stub for D-01 / Pitfall 4 sync guard"
  key_links:
    - from: "serialize.ts"
      to: "agent-knowledge-base.ts (Wave 2) + migration re-embed pass (Wave 1)"
      via: "shared import — single source of the embedding text form"
      pattern: "buildContentToEmbed"
---

<objective>
Lock the canonical KB embedding serializer (`buildContentToEmbed`) and create the Wave 0 vitest scaffolding so every later wave has an automated RED→GREEN target.

Purpose: RESEARCH Pitfall 1 is the highest-risk finding — byte-equivalence with legacy `.md` embeddings is impossible because `parser.ts:108-174` (`parseSections`) is lossy/one-way and the DB never stores the raw `body`. The honest, safe design is ONE deterministic serializer used by BOTH the migration re-embed pass (Plan 02) AND the UI domain re-embed (Plan 04). v4 is DORMANT in prod (zero traffic) so re-embedding all 18 topics once is safe. This plan makes that serializer concrete and string-exact-tested so it can never silently drift.

Output: `serialize.ts` + its exact-output test, plus 4 test stub files (domain templates, domain KB, sync guard) that fail until later waves implement the behavior.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/ui-agent-content-editor/CONTEXT.md
@.planning/standalone/ui-agent-content-editor/RESEARCH.md
@.planning/standalone/ui-agent-content-editor/PATTERNS.md

<interfaces>
<!-- Existing sync assembly the serializer must stay semantically aligned with -->
From src/lib/agents/somnio-v4/knowledge-base/sync.ts:42-45:
```typescript
const contentToEmbed = parsed.frontmatter.scope_summary
  ? `${parsed.frontmatter.scope_summary}\n\n${parsed.body}`
  : parsed.body
const bodyHash = createHash('sha256').update(contentToEmbed).digest('hex')
```

From src/lib/agents/somnio-v4/knowledge-base/parser.ts:46-56 (the parsed shape that maps to DB columns):
```typescript
export interface ParsedKbDoc {
  frontmatter: Frontmatter   // topic, keywords, category, scope_summary, ...
  body: string
  sections: {
    hechosDelProducto: string      // → DB column hechos_del_producto
    posicionDelNegocio: string     // → DB column posicion_del_negocio
    debeContener: string[]         // → DB column debe_contener
    nuncaDecir: string[]           // → DB column nunca_decir
    cuandoEscalar: string[]        // → DB column cuando_escalar
  }
}
```

Recognized headers in parser.ts:151-161 (the serializer must emit these EXACT header strings, with tilde):
`## Hechos del producto`, `## Posición del negocio`, `## Debe contener la respuesta`, `## NUNCA decir`, `## Cuándo escalar a humano`
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create canonical serializer serialize.ts with locked string form</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/sync.ts (lines 35-45 — current contentToEmbed assembly)
    - src/lib/agents/somnio-v4/knowledge-base/parser.ts (lines 95-174 — header strings + bullet form to mirror)
    - .planning/standalone/ui-agent-content-editor/RESEARCH.md (§scope_summary Migration "Recommended design", A1)
    - .planning/standalone/ui-agent-content-editor/PATTERNS.md (serialize.ts section, lines 108-124)
  </read_first>
  <action>
Create `src/lib/agents/somnio-v4/knowledge-base/serialize.ts`. Export a TYPE for the column-shaped input and a pure function `buildContentToEmbed`. The function is the SINGLE source of the embedding text form for both the migration re-embed (Plan 02) and the UI domain re-embed (Plan 04).

Exact implementation (lock this string form — header strings mirror parser.ts:151-161 verbatim, WITH tildes):

```typescript
// src/lib/agents/somnio-v4/knowledge-base/serialize.ts
// Canonical KB embedding serializer (standalone ui-agent-content-editor, Plan 01).
// SINGLE source of the embedding text form. Imported by:
//   - the migration re-embed pass (Plan 02 backfill)
//   - src/lib/domain/agent-knowledge-base.ts (Plan 04 — UI re-embed)
// RESEARCH Pitfall 1 / A1: byte-equivalence with legacy .md embeddings is IMPOSSIBLE
// (parser.ts:108-174 parseSections is lossy). This serializer re-embeds all 18 topics
// ONCE during the migration; legacy + future embeddings are then produced by THIS function.

export interface KbContentColumns {
  scope_summary: string | null
  hechos_del_producto: string | null
  posicion_del_negocio: string | null
  debe_contener: string[]
  nunca_decir: string[]
  cuando_escalar: string[]
}

/**
 * Builds the deterministic text fed to generateEmbedding for a KB topic, FROM DB COLUMNS
 * (never from .md / parser). Form:
 *
 *   [scope_summary + "\n\n"]            (omitted entirely when scope_summary is null/empty)
 *   "## Hechos del producto\n" + hechos_del_producto + "\n\n"
 *   "## Posición del negocio\n" + posicion_del_negocio + "\n\n"
 *   "## Debe contener la respuesta\n" + debe_contener bullets + "\n\n"
 *   "## NUNCA decir\n" + nunca_decir bullets + "\n\n"
 *   "## Cuándo escalar a humano\n" + cuando_escalar bullets
 *
 * Bullets render as "- {item}" joined by "\n". Empty arrays render the header followed
 * by an empty body (header line + nothing). Section text values are used verbatim (no trim
 * beyond what callers store). The trailing section has NO trailing newline.
 */
export function buildContentToEmbed(row: KbContentColumns): string {
  const bullets = (items: string[]): string => items.map((b) => `- ${b}`).join('\n')

  const sections: string[] = [
    `## Hechos del producto\n${row.hechos_del_producto ?? ''}`,
    `## Posición del negocio\n${row.posicion_del_negocio ?? ''}`,
    `## Debe contener la respuesta\n${bullets(row.debe_contener)}`,
    `## NUNCA decir\n${bullets(row.nunca_decir)}`,
    `## Cuándo escalar a humano\n${bullets(row.cuando_escalar)}`,
  ]

  const body = sections.join('\n\n')
  const scope = row.scope_summary && row.scope_summary.length > 0 ? `${row.scope_summary}\n\n` : ''
  return `${scope}${body}`
}
```

Do NOT call the parser, gray-matter, the filesystem, or OpenAI from this file. It is a pure string function. The separator between scope_summary and the body is `\n\n` (matches sync.ts:43). The separator between sections is `\n\n`. The header strings carry tildes (Posición, Cuándo) exactly as parser.ts:153,160.
  </action>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/knowledge-base/serialize.ts` succeeds
    - `grep -c "export function buildContentToEmbed" src/lib/agents/somnio-v4/knowledge-base/serialize.ts` returns 1
    - `grep -c "export interface KbContentColumns" src/lib/agents/somnio-v4/knowledge-base/serialize.ts` returns 1
    - `grep -F "## Hechos del producto" src/lib/agents/somnio-v4/knowledge-base/serialize.ts` matches; same for "## Posición del negocio", "## Debe contener la respuesta", "## NUNCA decir", "## Cuándo escalar a humano"
    - `grep -E "createAdminClient|gray-matter|node:fs|generateEmbedding|parseKbDoc" src/lib/agents/somnio-v4/knowledge-base/serialize.ts` returns 0 matches (pure function, no side effects)
  </acceptance_criteria>
  <verify>
    <automated>grep -c "export function buildContentToEmbed" src/lib/agents/somnio-v4/knowledge-base/serialize.ts && grep -F "## Cuándo escalar a humano" src/lib/agents/somnio-v4/knowledge-base/serialize.ts</automated>
  </verify>
  <done>serialize.ts exists with the exact string form locked; pure function with no I/O imports.</done>
</task>

<task type="auto">
  <name>Task 2: Exact-output unit test for the serializer (locks A1)</name>
  <read_first>
    - src/lib/agents/somnio-v4/knowledge-base/serialize.ts (the function from Task 1)
    - src/lib/domain/__tests__/resolve-or-create-contact.test.ts (vitest style/imports in this repo)
  </read_first>
  <action>
Create `src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts`. Assert the EXACT output string for two fixtures so the form can never silently drift:

Fixture A (full row with scope_summary):
- input: `{ scope_summary: 'Atiende preguntas sobre dosis y horario.', hechos_del_producto: 'Se toma 30 min antes de dormir.', posicion_del_negocio: 'No prometer cura.', debe_contener: ['Mencionar dosis', 'Recordar constancia'], nunca_decir: ['Cura el insomnio'], cuando_escalar: ['Cliente reporta efecto adverso'] }`
- expected (assert with `toBe`, exact):
```
Atiende preguntas sobre dosis y horario.

## Hechos del producto
Se toma 30 min antes de dormir.

## Posición del negocio
No prometer cura.

## Debe contener la respuesta
- Mencionar dosis
- Recordar constancia

## NUNCA decir
- Cura el insomnio

## Cuándo escalar a humano
- Cliente reporta efecto adverso
```

Fixture B (null scope_summary + empty arrays): input `{ scope_summary: null, hechos_del_producto: 'X', posicion_del_negocio: null, debe_contener: [], nunca_decir: [], cuando_escalar: [] }` → assert the output STARTS WITH `## Hechos del producto\nX` (no leading scope block) and that the three empty sections render as bare headers (`## Debe contener la respuesta\n` with empty body). Assert `result.startsWith('## Hechos del producto')` is true and `result.includes('## NUNCA decir\n\n## Cuándo escalar')` is true (empty array → header + empty line + next header).

Use a single literal template-string constant for the Fixture A expected value (build it with explicit `\n` joins so the test itself documents the byte form).
  </action>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts` passes (all assertions green)
    - The test contains a `toBe(` assertion (exact-string lock), verifiable: `grep -c "toBe(" src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts` >= 1
    - Test imports `buildContentToEmbed` from `../serialize`
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts</automated>
  </verify>
  <done>Serializer string form is locked by a passing exact-output test.</done>
</task>

<task type="auto">
  <name>Task 3: Create three RED test stub files for later waves</name>
  <read_first>
    - src/lib/domain/__tests__/resolve-or-create-contact.test.ts (S-4 mock harness: chain createAdminClient → from → select/eq/or/maybeSingle thenable builder)
    - .planning/standalone/ui-agent-content-editor/VALIDATION.md (Per-Decision Verification Map + Wave 0 Requirements)
    - scripts/knowledge-sync.ts (the script Plan 05 will guard)
  </read_first>
  <action>
Create three test files. They will be RED now (importing modules that don't exist yet) — that is intentional; Waves 2/3 turn them GREEN. Use `describe.skip` or `it.todo` ONLY where the imported module does not exist yet so Wave 0 itself does not break the full suite; replace `.skip`/`.todo` with real assertions when the target module lands (note this explicitly in each file's header comment so executors know to un-skip).

1. `src/lib/domain/__tests__/agent-templates.test.ts` — stubs:
   - `it.todo('D-02: updateTemplateContent rejects agent_id !== somnio-sales-v4')`
   - `it.todo('D-02: reorderTemplates rejects non-v4 agent')`
   - `it.todo('D-08: addTemplate into an unknown intent returns error')`
   - `it.todo('D-08: addTemplate into an existing intent succeeds')`
   - `it.todo('Regla 3: every query filters by agent_id (and workspace where applicable)')`
   - Header comment: "Wave 0 stub (Plan 01). Plan 03 implements src/lib/domain/agent-templates.ts and converts these it.todo → real assertions using the resolve-or-create-contact.test.ts mock harness."

2. `src/lib/domain/__tests__/agent-knowledge-base.test.ts` — stubs:
   - `it.todo('D-09: createKbTopic calls generateEmbedding then inserts row with embedding + body_hash')`
   - `it.todo('D-06: generateEmbedding throw → no DB write (row untouched, returns success:false)')`
   - `it.todo('D-01b: two updateKbTopic calls produce two version rows (version_num 1,2)')`
   - `it.todo('D-01b: restoreKbVersion snapshots current then copies version fields then re-embeds')`
   - `it.todo('D-10: editing scope_summary changes body_hash and triggers re-embed')`
   - `it.todo('D-02: KB mutations reject agent_id !== somnio-sales-v4')`
   - `it.todo('Pitfall 2: every KB query filters .eq(workspace_id).eq(agent_id)')`
   - Header comment: "Wave 0 stub (Plan 01). Plan 04 implements src/lib/domain/agent-knowledge-base.ts and converts these."

3. `scripts/__tests__/knowledge-sync-guard.test.ts` — stubs:
   - `it.todo('D-01/Pitfall 4: sync aborts when agent_knowledge_base has rows for somnio-sales-v4 and --force absent')`
   - `it.todo('D-01: sync proceeds when --force passed')`
   - Header comment: "Wave 0 stub (Plan 01). Plan 05 adds the guard to scripts/knowledge-sync.ts and converts these."
  </action>
  <acceptance_criteria>
    - All three files exist: `test -f src/lib/domain/__tests__/agent-templates.test.ts && test -f src/lib/domain/__tests__/agent-knowledge-base.test.ts && test -f scripts/__tests__/knowledge-sync-guard.test.ts`
    - `npx vitest run src/lib/domain/__tests__/agent-templates.test.ts src/lib/domain/__tests__/agent-knowledge-base.test.ts scripts/__tests__/knowledge-sync-guard.test.ts` exits 0 (todo/skip do not fail)
    - `grep -c "it.todo\|describe.skip" src/lib/domain/__tests__/agent-templates.test.ts` >= 5
    - Each file's header comment names the implementing plan (03/04/05)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/domain/__tests__/agent-templates.test.ts src/lib/domain/__tests__/agent-knowledge-base.test.ts scripts/__tests__/knowledge-sync-guard.test.ts</automated>
  </verify>
  <done>Three stub test files exist and pass (todo/skip), giving Waves 2-3 explicit RED targets.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries
| Boundary | Description |
|----------|-------------|
| none (this wave) | Pure utility + test scaffolding; no auth, no DB, no network, no user input crosses any boundary in this plan. |

## STRIDE Threat Register
| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-UICE01-01 | Tampering | serialize.ts string form drifting silently across waves | mitigate | Exact-output `toBe` unit test (Task 2) locks the byte form; any drift fails CI. |
| T-UICE01-02 | Information disclosure | serializer accidentally pulling secrets/PII | accept | Pure function over already-stored KB content; no env/secret access (grep gate forbids createAdminClient/fs/network imports). |
</threat_model>

<verification>
- `npx vitest run src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts` green.
- Three stub files run green (todo/skip).
- `grep -E "createAdminClient|node:fs|generateEmbedding" src/lib/agents/somnio-v4/knowledge-base/serialize.ts` = 0 matches.
</verification>

<success_criteria>
- buildContentToEmbed exists, is pure, and its exact output is locked by a passing test.
- Wave 0 RED targets for templates domain, KB domain, and sync guard exist and pass as todo/skip.
</success_criteria>

<output>
After completion, create `.planning/standalone/ui-agent-content-editor/01-SUMMARY.md`.
</output>
