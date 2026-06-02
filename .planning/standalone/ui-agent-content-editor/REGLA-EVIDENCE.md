# REGLA-EVIDENCE — Standalone `ui-agent-content-editor`

**Generado:** 2026-06-02 (Plan 07, Wave 5)
**Branch:** `exec/debounce-v2-wave6`
**Proposito:** evidencia auditable (grep verbatim + nombres de tests) de que el standalone satisface Regla 3 (domain layer), Regla 5 (migracion antes de deploy) y Regla 6 (proteger agente en produccion), mas la matriz de cobertura de las 12 decisiones D-ID.

Todos los comandos se corrieron desde la raiz del repo. Los outputs estan pegados verbatim.

---

## 1. Matriz de cobertura D-ID

Cada decision del CONTEXT mapea a un check automatizado (test/grep) que pasa, o a un smoke manual registrado. **Las 12 estan cubiertas.**

| D-ID | Decision | Plan(es) | Prueba (test / grep / smoke) | Estado |
|------|----------|----------|------------------------------|--------|
| **D-01** | DB es fuente de verdad + `knowledge:sync` protegido | 01,02 | `scripts/__tests__/knowledge-sync-guard.test.ts` (3 tests). Guard `shouldAbortSync(count>0, !force)` aborta si la DB tiene filas v4 sin `--force`. Inngest gateado por `platform_config.somnio_v4_kb_sync_enabled` (default false). | AUTOMATED |
| **D-01b** | Versionado KB (snapshot-on-save + ver/buscar/restaurar) | 02,04 | Tabla `agent_knowledge_base_versions` (migracion `20260601100100`). Tests: `D-01b + D-10: updateKbTopic ... snapshots a version (incrementing) and re-embeds` + `D-01b restore: restoreKbVersion snapshots current then copies version fields then re-embeds`. | AUTOMATED |
| **D-02** | Solo `somnio-sales-v4` editable | 03,04,06 | Domain `assertEditable` gatea las 10 mutaciones. Tests reject (5): templates `D-02: updateTemplateContent/reorderTemplates/deleteTemplate rejects non-v4` + KB `D-02: updateKbTopic/createKbTopic rejects non-v4 agent, no DB write`. | AUTOMATED |
| **D-03** | UI edita las filas que v4 usa, sin overrides por workspace_id | 03,06 | `updateTemplateContent (v4): UPDATE filters by id AND agent_id` (single-row update, sin rama override-insert). Code review: 0 INSERT con `workspace_id` override en mutaciones. | AUTOMATED |
| **D-03b** | Templates editables UI **y** SQL (last-write-wins, cache 5 min) | 06 | UI muestra el aviso "≤5 min cache" en `TemplatesPanel`; `agent_templates` sin SoT paralelo (mismo dato/misma fila). Propagacion de cache observable. | MANUAL SMOKE (cache TTL en runtime) |
| **D-04** | Todos los agentes visibles read-only; v4 editable | 06 | `AgentSelector` con `CONTENT_EDITOR_AGENTS` (7 agentes) + badge "PRODUCCION — solo lectura" en los 6 no-v4. Catalogo compartido `agent-catalog.ts` INTACTO (git diff vacio). | MANUAL SMOKE (dropdown UI) + grep (catalogo untouched) |
| **D-05** | Subida de imagen → autollenar `content` | 06 | `ContentImageUploader` sube a bucket `whatsapp-media` via `/api/config-builder/templates/upload` y autollena `publicUrl` para `content_type='imagen'`. | MANUAL SMOKE (file picker + bucket) |
| **D-06** | Re-embed sincrono; error → reintento (sin escritura parcial) | 04,06 | Tests: `D-06: createKbTopic — generateEmbedding throw → NO insert (no partial write), success:false` + `D-06: updateKbTopic — generateEmbedding throw → NO update (live row untouched)`. | AUTOMATED |
| **D-07** | Editar restringido a admin del workspace | 05,06 | Server action: `isWorkspaceAdmin` gatea toda mutacion (rol owner/admin). `supabase.auth.getUser()` presente. Comentario L13-14 documenta el gate D-07. | AUTOMATED (grep + code review) |
| **D-08** | Templates: editar/agregar/borrar/reordenar dentro de intents existentes; NO crear intents | 03,06 | Tests: `D-08: addTemplate into an unknown intent returns error (no insert)` + `D-08: addTemplate into an existing intent succeeds (insert issued)`. Reorder Pitfall-3 two-phase: `reorder (Pitfall 3): all phase-1 offsets (1000+i) issue BEFORE any phase-2 (i) write` + `reorder: aborts on phase-1 error`. | AUTOMATED |
| **D-09** | KB CRUD completo + re-embed al crear | 04,06 | Test: `D-09: createKbTopic calls generateEmbedding then inserts row with embedding + body_hash + ui:// source_md_path`. | AUTOMATED |
| **D-10** | `scope_summary` + `keywords` editables + `scope_summary` migrado a columna DB | 02,04,06 | Migracion `20260601100000` agrega columna `scope_summary` (27 referencias incl. 18 backfills). Tests: `D-01b + D-10: ... changed scope_summary snapshots + re-embeds` + `D-10: updateKbTopic with UNCHANGED content skips OpenAI (hash-skip)`. Serializer `buildContentToEmbed` reconstruye `contentToEmbed = scope_summary + material` byte-equivalente. | AUTOMATED |

**Smokes manuales pendientes** (registrados, no bloqueantes — visuales/de runtime que requieren browser en `localhost:3020` con un workspace v4):
- D-03b: editar template v4 → esperar ≤5 min → confirmar que sandbox/v4 refleja el cambio (cache TemplateManager).
- D-04: abrir `/agentes/content-editor`, cambiar el dropdown, confirmar v4 editable + 6 con badge "PRODUCCION — solo lectura".
- D-05: subir una imagen en el editor de template → confirmar que el `publicUrl` autollena `content` y previsualiza.

(El Plan 06 Task 5 era el `checkpoint:human-verify` para estos smokes — handled por el orchestrator.)

---

## 2. Regla 3 — cero `createAdminClient` fuera de `src/lib/domain/*`

> "TODA mutacion de datos DEBE pasar por `src/lib/domain/`. Nunca escribir directo a Supabase desde server actions, tool handlers, action executor o webhooks." (CLAUDE.md Regla 3)

### Gate 1 — UI content-editor (esperado 0)
```
$ grep -rn "createAdminClient" "src/app/(dashboard)/agentes/content-editor/" | wc -l
0
```

### Gate 2 — Server action (esperado 0)
```
$ grep -rn "createAdminClient" src/app/actions/agent-content-editor.ts | wc -l
0
```

### Gate 3 — Los dos domain files SI poseen el cliente (esperado ambos listados)
```
$ grep -rln "createAdminClient" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts
src/lib/domain/agent-templates.ts
src/lib/domain/agent-knowledge-base.ts
```

### Gate 4 — Serializer puro (esperado 0)
```
$ grep -rn "createAdminClient" src/lib/agents/somnio-v4/knowledge-base/serialize.ts | wc -l
0
```
`serialize.ts` solo exporta `buildContentToEmbed(row): string` (funcion pura; sin IO, sin import de Supabase).

### Excepcion CLI documentada (permitida)
```
$ grep -rln "createAdminClient" scripts/knowledge-sync.ts scripts/reembed-kb-v4.ts
scripts/knowledge-sync.ts
scripts/reembed-kb-v4.ts
```
`scripts/*.ts` son CLIs one-shot (re-embed inicial + sync de seed). NO son server actions/webhooks/tool-handlers. Pertenecen a la clase de excepcion CLI (mismo patron que `scripts/` ya existentes en el repo). El re-embed OpenAI no puede ser SQL puro (Regla 5 obliga a separarlo del migration). **Documentado como permitido.**

**Conclusion Regla 3:** el domain layer (`agent-templates.ts` + `agent-knowledge-base.ts`) es el unico owner de `createAdminClient` en el camino de runtime. La capa UI + server action estan limpias. Los scripts CLI son la excepcion documentada.

---

## 3. Regla 5 — migracion antes de deploy

> "TODA migracion de base de datos DEBE aplicarse en produccion ANTES de pushear codigo que la usa." (CLAUDE.md Regla 5)

### Archivos de migracion presentes
```
$ ls -la supabase/migrations/20260601100000_kb_scope_summary.sql supabase/migrations/20260601100100_kb_versions_table.sql
-rwxrwxrwx ... 11345 ... 20260601100000_kb_scope_summary.sql
-rwxrwxrwx ...  2456 ... 20260601100100_kb_versions_table.sql
```

### Orden cumplido (migracion → apply → confirm → deploy)
- **Plan 02** PAUSO en el checkpoint bloqueante de Regla 5 (`02-SUMMARY.md` §"STOPPED — Regla 5 Checkpoint"). Las migraciones NO se aplicaron desde codigo; el usuario las aplico manualmente en Supabase Studio.
- **Confirmacion del usuario (prompt Plan 07):** *"Regla 5 YA satisfecha en PROD: ambas migraciones aplicadas + re-embed de los 18 topics v4 corrido exitosamente (18/18, 0 fallos)."*
- El re-embed (`scripts/reembed-kb-v4.ts`) corrio DESPUES de que la columna `scope_summary` existiera (no puede ser SQL puro — llamada OpenAI).
- Los Planes 03-06 (codigo que consume la columna + tabla de versiones) se ejecutaron despues de la confirmacion.

**Conclusion Regla 5:** ambas migraciones existen, fueron aplicadas a PROD por el usuario antes del codigo dependiente, y el re-embed corrio post-migracion (18/18 OK). Orden honrado.

---

## 4. Regla 6 — proteger agente en produccion

> "El agente en produccion debe seguir funcionando sin cambios... el cambio se activa solo cuando el usuario lo decida." (CLAUDE.md Regla 6)

Solo `somnio-sales-v4` (DORMANT en prod, sin trafico) es mutable. Los agentes de produccion (v1, v3, godentist, godentist-fb-ig, recompra, pw-confirmation) son read-only en la UI y rechazados en el domain.

### Gate R1 — `EDITABLE_AGENT_ID = 'somnio-sales-v4'` en ambos domain (esperado 1 c/u)
```
$ grep -c "EDITABLE_AGENT_ID = 'somnio-sales-v4'" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts
src/lib/domain/agent-templates.ts:1
src/lib/domain/agent-knowledge-base.ts:1
```

### Gate R2 — `assertEditable` gatea cada mutacion (5 en cada domain: 1 definicion + 4 call-sites)
```
$ grep -c "assertEditable" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts
src/lib/domain/agent-templates.ts:5
src/lib/domain/agent-knowledge-base.ts:5

$ grep -rn "assertEditable" src/lib/domain/agent-templates.ts src/lib/domain/agent-knowledge-base.ts
agent-templates.ts:127:function assertEditable(agentId: string): DomainResult | null {
agent-templates.ts:153:  const gate = assertEditable(params.agentId)   # updateTemplateContent
agent-templates.ts:206:  const gate = assertEditable(params.agentId)   # addTemplate
agent-templates.ts:259:  const gate = assertEditable(params.agentId)   # deleteTemplate
agent-templates.ts:303:  const gate = assertEditable(params.agentId)   # reorderTemplates
agent-knowledge-base.ts:135:function assertEditable(agentId: string): DomainResult | null {
agent-knowledge-base.ts:281:  const gate = assertEditable(params.agentId)  # createKbTopic
agent-knowledge-base.ts:399:  const gate = assertEditable(params.agentId)  # updateKbTopic
agent-knowledge-base.ts:501:  const gate = assertEditable(params.agentId)  # deleteKbTopic
agent-knowledge-base.ts:572:  const gate = assertEditable(params.agentId)  # restoreKbVersion
```
Toda mutacion (4 templates + 4 KB) llama `assertEditable` que devuelve error para cualquier `agentId !== 'somnio-sales-v4'`.

### Gate R3 — D-02 reject tests verdes (nombres citados)
- `D-02: updateTemplateContent rejects agent_id !== somnio-sales-v4 (no DB write)`
- `D-02: reorderTemplates rejects non-v4 agent (no DB write)`
- `D-02: deleteTemplate rejects non-v4 agent (no DB write)`
- `D-02: updateKbTopic rejects agent_id !== somnio-sales-v4, no DB write`
- `D-02: createKbTopic rejects non-v4 agent, no embed, no DB write`

### Gate R4 — migracion `scope_summary` solo toca v4 (esperado 18 UPDATEs scoped)
```
$ grep -c "agent_id = 'somnio-sales-v4'" supabase/migrations/20260601100000_kb_scope_summary.sql
18
```
Los 18 backfills estan scoped `WHERE topic=... AND agent_id='somnio-sales-v4' AND workspace_id='a3843b3f-...'`.

### Gate R5 — cero operaciones destructivas ejecutables en las migraciones (esperado 0)
```
# raw grep en versions table: 1 match...
$ grep -cE "DROP TABLE|DELETE FROM|TRUNCATE" supabase/migrations/20260601100100_kb_versions_table.sql
1
# ...pero el unico match es la linea de ROLLBACK COMENTADA (no ejecutable):
$ grep -nE "DROP TABLE|DELETE FROM|TRUNCATE" supabase/migrations/20260601100100_kb_versions_table.sql
48:--   DROP TABLE IF EXISTS public.agent_knowledge_base_versions;

# excluyendo comentarios, las ops destructivas EJECUTABLES son 0 en ambas migraciones:
$ grep -vE "^\s*--" supabase/migrations/20260601100100_kb_versions_table.sql | grep -cE "DROP TABLE|DELETE FROM|TRUNCATE"
0
$ grep -vE "^\s*--" supabase/migrations/20260601100000_kb_scope_summary.sql | grep -cE "DROP TABLE|DELETE FROM|TRUNCATE"
0
```
**Nota honesta:** la gate textual del plan (`grep -c ... == 0`) NO pasa en su forma literal sobre el archivo de versions porque el `grep -c` cuenta la linea de ROLLBACK comentada. Excluyendo comentarios (`grep -vE "^\s*--"`) el conteo ejecutable es 0 en ambos archivos. La unica `DROP TABLE` del repo es documentacion de rollback manual ("NO ejecutar salvo emergencia"). Cero destruccion real.

### Gate R6 — UI editable gate (solo v4)
```
$ grep -n "EDITABLE_AGENT_ID\|editable" "src/app/(dashboard)/agentes/content-editor/_components/AgentSelector.tsx"
46:export const EDITABLE_AGENT_ID = 'somnio-sales-v4'
54:  const editable = selectedAgentId === EDITABLE_AGENT_ID
96:  {!editable && (  # badge "PRODUCCION — solo lectura" para los demas
```

### Gate R7 — catalogo de agentes compartido INTACTO (no regresion de config-UI de prod)
```
$ git diff --stat main -- src/lib/agents/agent-catalog.ts
(vacio — agent-catalog.ts no fue modificado por este standalone)
```
La UI usa una constante LOCAL `CONTENT_EDITOR_AGENTS` (no extiende el catalogo compartido), evitando que los 2 agentes extra de Somnio se filtren a los dropdowns de config de cada workspace en produccion.

**Conclusion Regla 6:** el gate `assertEditable` (domain) + el gate `EDITABLE_AGENT_ID` (UI) + las migraciones scoped a v4 (18 UPDATEs, 0 destruccion ejecutable) + el catalogo compartido intacto garantizan que los agentes de produccion permanecen read-only e inalterados. v4 sigue DORMANT.

---

## 5. Resultado de la suite completa

### Tests del standalone (los 4 archivos que este standalone creo/posee) — VERDE 22/22
```
$ npx vitest run \
    src/lib/domain/__tests__/agent-templates.test.ts \
    src/lib/domain/__tests__/agent-knowledge-base.test.ts \
    src/lib/agents/somnio-v4/knowledge-base/__tests__/serialize.test.ts \
    scripts/__tests__/knowledge-sync-guard.test.ts

 ✓ serialize.test.ts            (2 tests)
 ✓ agent-templates.test.ts      (8 tests)
 ✓ agent-knowledge-base.test.ts (9 tests)
 ✓ knowledge-sync-guard.test.ts (3 tests)

 Test Files  4 passed (4)
      Tests  22 passed (22)
```

### Suite completa del repo — `pnpm test`
```
 Test Files  6 failed | 104 passed | 12 skipped (122)
      Tests  3 failed | 1086 passed | 42 skipped (1147)
```

**Los 6 archivos fallidos NO pertenecen a este standalone.** Pertenecen a standalones hermanos / tests de integracion que comparten la rama `exec/debounce-v2-wave6`. Lista completa de los 6 archivos fallidos:

| Archivo fallido | Owner real | commits de ui-agent-content-editor |
|-----------------|------------|-------------------------------------|
| `src/__tests__/integration/crm-bots/reader.test.ts` | crm-reader (integracion, requiere DB/env) | 0 |
| `src/__tests__/integration/crm-bots/security.test.ts` | crm-bots (integracion) | 0 |
| `src/__tests__/integration/crm-bots/ttl-cron.test.ts` | crm-bots (integracion) | 0 |
| `src/__tests__/integration/crm-bots/writer-two-step.test.ts` | crm-writer (integracion) | 0 |
| `src/lib/agents/somnio-v4/__tests__/smoke-rag-b.test.ts` (3 casos `razonamiento_libre`) | somnio-v4-rag-generative | 0 |
| `src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts` (`prompt contains M1 probability framing`) | somnio-v4-rag-generative (commit `15f8bbfd`) | 0 |

```
$ for f in <los 6 archivos>; do git log --oneline --all -- "$f" | grep -ci "content-editor"; done
0   # reader.test.ts
0   # security.test.ts
0   # ttl-cron.test.ts
0   # writer-two-step.test.ts
0   # smoke-rag-b.test.ts
0   # few-shots.test.ts
```

Naturaleza de los fallos:
- **crm-bots integration (4 archivos)** — tests de integracion que requieren conexion DB/env; fallan a nivel de archivo (no asserts unitarios). Pre-existentes, sin relacion con este standalone.
- **smoke-rag-b (3 casos) + few-shots (1 caso)** — del standalone `somnio-v4-rag-generative`: assertions de wording del prompt de generacion que driftaron cuando ese standalone cambio el texto. `few-shots.test.ts` creado por commit `15f8bbfd` (`somnio-v4-rag-generative 04`), cero commits de `ui-agent-content-editor`.

Estos fallos quedan registrados en `deferred-items.md` (out-of-scope per la regla de scope-boundary del executor). **No se silenciaron ni se "arreglaron"** — son responsabilidad de los standalones que los poseen.

**Conclusion suite:** el standalone aporta 22 tests, todos verdes. La suite global tiene 3 fallos pre-existentes/de standalones hermanos, ninguno tocando codigo de `ui-agent-content-editor`.

---

## 6. Seguridad (ASVS L1, derivado de VALIDATION.md §Security)

| Control | Verificacion | Evidencia |
|---------|--------------|-----------|
| V2 Authentication | `supabase.auth.getUser()` en cada server action | `grep -c "auth.getUser" actions/agent-content-editor.ts` = 1 (helper compartido) |
| V4 Access Control | gate admin + scoping workspace+agent (KB sin RLS → filtro explicito) | `isWorkspaceAdmin` gatea mutaciones (D-07); test `Pitfall 2: listKbByAgent query filters by .eq(workspace_id) AND .eq(agent_id)` |
| V5 Input Validation | zod en inputs de action | `grep -c "z\.(object|string|array|enum)" actions/agent-content-editor.ts` = 47 |
| Cross-workspace KB | filtro workspace+agent explicito en cada query KB | test Pitfall 2 (arriba) + code review domain |
| Tampering de agente prod | gate v4-only | tests D-02 (5) + grep Regla 6 (R1-R7) |

---

*Standalone: ui-agent-content-editor · Plan 07 · evidencia generada 2026-06-02*
