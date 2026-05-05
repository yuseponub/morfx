# Routing Rule — User Action Required to Activate Sibling

**Standalone:** agent-godentist-fb-ig
**Status:** sibling SHIPPED but INACTIVE (no routing rule = no traffic = aislamiento Regla 6 satisfecho)
**Owner of this action:** the workspace operator (user)
**When to execute:** when ready to activate the sibling for FB/IG inbound traffic on the GoDentist Valoraciones workspace

---

## Decision context (D-15 manual)

Per **D-15** (CONTEXT.md), the activation of the `godentist-fb-ig` sibling is 100% under the operator's control via routing rule. The migration intentionally does NOT auto-create this rule because:

1. The operator must choose a `priority` slot that does not collide with existing rules in `routing_rules` (UNIQUE INDEX `uq_routing_rules_priority WHERE active=true`).
2. The operator confirms the timing of activation — code is deployed but inactive until the rule exists.
3. Manual creation provides a clear audit trail (operator + timestamp via `routing_rules` defaults).

Until the rule below is inserted with `active=true`, **no FB/IG traffic on this workspace will be routed to the sibling** — the existing routing fallback continues to apply (default `godentist` agent for any matching rule, or no agent if no rule matches).

---

## Pre-flight check (recommended)

Before inserting, verify the priority slot is free for this workspace:

```sql
SELECT priority, name, active
FROM routing_rules
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
  AND active = true
ORDER BY priority;
```

Expected per **Plan 01 Audit (`01-SNAPSHOT.md` §Q-D)**: workspace currently has **0 active rules** — gap is wide open. Recommended priority: **100** (low integer leaves room above and below for future rules).

If new rules have been added since the audit, pick any free integer that is not currently in the `priority` column.

---

## SQL to execute (workspace operator copies this)

Copy and paste into your SQL Editor (Supabase dashboard) or run via the routing-editor UI at `/agentes/routing/editor`:

```sql
-- Activate godentist-fb-ig sibling for FB Messenger / Instagram Direct
-- on the GoDentist Valoraciones workspace.
INSERT INTO routing_rules (
  workspace_id,
  rule_type,
  priority,
  active,
  conditions,
  event,
  name
)
VALUES (
  'f0241182-f79b-4bc6-b0ed-b5f6eb20c514',
  'agent_router',            -- CHECK constraint: must be 'lifecycle_classifier' or 'agent_router'
  100,                       -- adjust if priority 100 is taken (see pre-flight check above)
  true,
  jsonb_build_object(
    'all', jsonb_build_array(
      jsonb_build_object(
        'fact', 'channel',
        'operator', 'in',
        'value', jsonb_build_array('facebook', 'instagram')
      )
    )
  ),
  jsonb_build_object(
    'type', 'route',
    'params', jsonb_build_object('agent_id', 'godentist-fb-ig')
  ),
  'GoDentist FB/IG sibling routing'
);
```

**Verification post-insert:**

```sql
SELECT id, priority, active, name, conditions, event
FROM routing_rules
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
  AND name = 'GoDentist FB/IG sibling routing';
```

You should see the row with `active=true` and the conditions/event JSONB matching the insert.

---

## Effect of activation

After this rule lands with `active=true`:

- Any inbound conversation in workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` with `channel IN ('facebook', 'instagram')` will route to `agent_id='godentist-fb-ig'`.
- Inbound conversations on other channels (whatsapp, etc.) for the same workspace will continue to fall through to the default `godentist` agent (or whatever rules already exist with higher priority).
- The next lambda invocation reads the updated `routing_rules` (no cache that delays this).

**Smoke 2 (E2E saludo D-05) and Smoke 3 (lead-capture happy path) — D-18 deferred** become live at this point. Per CONTEXT.md D-18, the user runs them manually:

- Smoke 2: send any inbound message from a personal FB/IG account to the GoDentist Valoraciones page → bot replies with the lead-capture saludo (contains `goBot 🤖`, `Habeas Data`, `Ley 1581`).
- Smoke 3: reply with `"Juan Pérez, 3001234567"` → bot replies with `pedir_datos_parcial` interpolating `{{campos_faltantes}}` to ask for "Sede de tu preferencia" (already has nombre + celular, missing critical field is `sede_preferida`).

Verify via `agent_observability_events` that `agent='godentist-fb-ig'` (NOT `'godentist'`) appears for both flows — anti-Pitfall 1 confirmation in production.

---

## Rollback (instant)

If the sibling produces incorrect responses or you want to revert to default routing:

```sql
UPDATE routing_rules
SET active = false
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
  AND name = 'GoDentist FB/IG sibling routing';
```

Effect: next lambda invocation routes FB/IG traffic back to the default. Original `godentist` agent (or fallback) takes over immediately. No code revert needed.

For a permanent removal (if you decide the sibling shouldn't have a rule at all):

```sql
DELETE FROM routing_rules
WHERE workspace_id = 'f0241182-f79b-4bc6-b0ed-b5f6eb20c514'
  AND name = 'GoDentist FB/IG sibling routing';
```

---

## Anti-pitfall reminders

- **Pitfall 3 (workspace mismatch):** the workspace UUID `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` is locked verbatim in this SQL. Do NOT change it unless you are intentionally activating the sibling on a different workspace (which would require updating the catalog migration to include that workspace too).
- **Pitfall 4 (priority collision):** if priority `100` is taken by the time you run this, pick another free integer per the pre-flight check above. Do NOT reuse a priority of an existing active rule — the UNIQUE INDEX will reject the insert.
- **Pitfall 7 (channel not populated):** if the `agent_observability_events` post-activation show `agent='godentist'` instead of `'godentist-fb-ig'`, that means the conversation's `channel` was NULL or didn't match `facebook`/`instagram`. Check `conversations.channel` and the `routing-channel-fact` resolver. Plan 01 Audit Q-B already confirmed channel is populating correctly for FB/IG conversations as of 2026-05-05.

---

*Authored: 2026-05-05*
*Wave 7 Plan 09 Task 3 — operator action gate*
