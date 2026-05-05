# Snapshot Audit Production — agent-godentist-fb-ig

**Fecha captura (stub):** 2026-05-05 — pending user SQL outputs
**Workspace target:** GoDentist Valoraciones (`f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)
**Source:** outputs verbatim de las 4 queries en `01-AUDIT.sql` + lectura del codigo para Q1/Q3.
**Proposito:** desbloquear Wave 1 con datos productivos verificados (no asumidos).

> **Estado del documento:** STUB — Q1 y Q3 resueltos por lectura directa de codigo
> en este plan. Q-A/Q-B/Q-C/Q-D + Q2 esperando outputs del Supabase SQL Editor
> (production) que el usuario debe ejecutar. Una vez pegados, Claude rellenara
> las secciones marcadas `PENDING_USER_INPUT` y emitira la decision agregada GO/BLOCKER.

---

## Query (A) — Inventario templates godentist

**Total rows:** _PENDING_USER_INPUT_
**Decision:** [ ] GO (≥50 rows) / [ ] NO-GO (<50 — escalar)

```text
PENDING_USER_INPUT — paste output from Supabase SQL Editor below

(Paste the verbatim rows of:
   SELECT intent, visit_type, priority, orden, content_type,
          LEFT(content,200) AS content_preview, delay_s, workspace_id
   FROM agent_templates
   WHERE agent_id='godentist' AND workspace_id IS NULL
   ORDER BY intent, priority, orden;
)
```

**Target row count para sanity check del migration DO block (Wave 5 Plan 07):** _PENDING_USER_INPUT_

---

## Query (A-summary) — content_type breakdown (Q2 resolution)

```text
PENDING_USER_INPUT — paste output from Supabase SQL Editor below

(Paste the verbatim rows of:
   SELECT content_type, COUNT(*) AS row_count
   FROM agent_templates
   WHERE agent_id='godentist' AND workspace_id IS NULL
   GROUP BY content_type
   ORDER BY row_count DESC;
)
```

**Q2 RESOLUTION (pending):** [ ] SAFE (mayoria texto, sin URLs WhatsApp-only) / [ ] ANOMALIA documentada: ___

---

## Query (B) — Conversations FB/IG en workspace target

```text
PENDING_USER_INPUT — paste output from Supabase SQL Editor below

(Paste the verbatim rows of:
   SELECT channel, COUNT(*) AS conversation_count, MAX(created_at) AS last_seen
   FROM conversations
   WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
   GROUP BY channel
   ORDER BY conversation_count DESC;
)
```

**Decision (pending):** [ ] GO (rows con `facebook` o `instagram`) / [ ] NO-GO (todas NULL — escalar)

---

## Query (C) — Baseline agent_templates godentist-fb-ig

```text
PENDING_USER_INPUT — paste output from Supabase SQL Editor below
(Esperado: 0 rows — sibling greenfield)

(Paste the verbatim rows of:
   SELECT id, intent, visit_type, orden, content_type,
          LEFT(content,80) AS content_preview, priority, workspace_id
   FROM agent_templates
   WHERE agent_id='godentist-fb-ig'
   ORDER BY intent, orden;
)
```

**Decision (pending):** [ ] GO (0 rows — greenfield) / [ ] NO-GO (>0 — DELETE manual antes de Plan 07)

---

## Query (D) — Priorities ocupados en routing_rules workspace target

```text
PENDING_USER_INPUT — paste output from Supabase SQL Editor below

(Paste the verbatim rows of:
   SELECT priority, name, enabled, rule_type, conditions, event
   FROM routing_rules
   WHERE workspace_id='f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
     AND enabled = true
   ORDER BY priority;
)
```

**Priority slot recomendado para routing rule manual del Plan 09:** _PENDING_USER_INPUT_
Razon: gap natural entre N y N+gap, sin colision con UNIQUE INDEX `uq_routing_rules_priority`.

---

## Open Questions Resolved

### Q1: routing-editor consume agent catalog filtrado o directo?

**Hallazgo (verificado por lectura directa de codigo):**
`src/app/(dashboard)/agentes/routing/editor/page.tsx` linea 65:

```ts
const agents = agentRegistry
  .list()
  .map((a) => ({ id: a.id, name: a.name ?? a.id }))
  .sort((a, b) => a.id.localeCompare(b.id))
```

El editor invoca **`agentRegistry.list()` directo** — NO usa `getAgentsForWorkspace`.
Los siblings se registran via side-effect imports en lineas 25-30 del mismo archivo:

```ts
import '@/lib/agents/somnio-recompra'
import '@/lib/agents/somnio-v3'
import '@/lib/agents/somnio'
import '@/lib/agents/godentist'
import '@/lib/agents/somnio-pw-confirmation'
import '@/lib/agents/somnio-v4'
```

**Implicacion:** El sibling `godentist-fb-ig` auto-aparece en el dropdown del routing-editor cuando agreguemos `import '@/lib/agents/godentist-fb-ig'` a esa lista (1 linea). NO requiere extender `getAgentsForWorkspace` ni tocar `agent-catalog.ts`.

**Plan 05 Wave 3 adjustment:** agregar 1 linea de import en `page.tsx` (registrar side-effect). Cero LOC adicionales.

**Q1 Status:** [x] RESUELTA — sin trabajo adicional mas alla de 1 import line en Wave 3 Plan 05.

---

### Q2: content_types FB/IG safe para clonado verbatim?

**Hallazgo (pending — depende de Q-A-summary output):**
_PENDING_USER_INPUT_

**Implicacion (pending):**
_Si todos `content_type='texto'` → SAFE._
_Si hay `'imagen'` o `'video'` con URL hardcoded → revisar dominio:_
- _Meta-compatible (facebook.com, instagram.com, supabase storage publico) → SAFE_
- _WhatsApp-only → ANOMALIA MENOR documentada (D-08 dice ALL clonados verbatim;_
  _el sibling enviara el URL — Meta lo aceptara o degradacion graceful)._

**Q2 Status:** [ ] PENDING — esperando output Q-A-summary del usuario.

---

### Q3: robot Railway acepta string 'godentist-valoraciones' para sibling?

**Hallazgo (verificado por lectura directa de codigo):**
`src/lib/agents/godentist/dentos-availability.ts` linea 50:

```ts
body: JSON.stringify({
  workspaceId: 'godentist-valoraciones',
  credentials: ROBOT_CREDENTIALS,
  date,
  sucursal,
}),
```

El `workspaceId` es un **string literal hardcoded** (`'godentist-valoraciones'`), NO el UUID de Supabase ni una expresion dinamica. Confirmado tambien:

- `ROBOT_URL = 'https://godentist-production.up.railway.app'` (linea 8) — hardcoded
- `ROBOT_CREDENTIALS = { username: 'JROMERO', password: '123456' }` (linea 9) — hardcoded
- El robot recibe `workspaceId` + `credentials` + `date` + `sucursal` y NO discrimina por agent_id

**Implicacion:** El sibling clonando `dentos-availability.ts` verbatim (Wave 1 Plan 02 listing) usara la misma string `'godentist-valoraciones'` → ambos agentes (godentist y godentist-fb-ig) hablan al mismo robot Railway con misma credencial JROMERO/123456 contra la misma cuenta Dentos. Funciona out-of-the-box.

**Plan 02 Wave 1 adjustment:** ninguno — el archivo se clona verbatim como esta. Cero ajustes.

**Q3 Status:** [x] RESUELTA — clone verbatim sin ajustes.

---

## Decision agregada

- [ ] **Wave 0 PASA — desbloquear Wave 1.** Todas las decisions GO + las 3 Qs RESUELTAS.
- [ ] **Wave 0 BLOCKER — pausar fase.** Razon: ___

> **Status actual del stub:** Q1 [x] + Q3 [x] resueltas por lectura de codigo.
> Q2 + decisions Q-A/Q-B/Q-C/Q-D pendientes del output SQL del usuario.
> Aprobacion final tras pegar outputs.

---

## Datos locked para Waves 1-7

- **Q-A row count:** _PENDING_USER_INPUT_ (target del sanity check en Plan 07 DO block)
- **Priority slot recomendado para Plan 09:** _PENDING_USER_INPUT_
- **Q1 plan adjustment:** ninguno — `page.tsx` solo necesita 1 import line (`import '@/lib/agents/godentist-fb-ig'` en lineas 25-30 de `editor/page.tsx`)
- **Q3 plan adjustment:** ninguno — `dentos-availability.ts` clonado verbatim
