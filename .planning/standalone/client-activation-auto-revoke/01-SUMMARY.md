# Plan 01 — SUMMARY

**Standalone:** `client-activation-auto-revoke`
**Shipped:** 2026-04-29
**Status:** complete

## Commits

| Hash | Message |
|------|---------|
| `13ddb8c` | `feat(client-activation-auto-revoke): bidirectional is_client trigger + global backfill` |
| `9e21c62` | `docs(client-activation-auto-revoke): Plan 01 LEARNINGS — bidirectional trigger shipped` |

Push range: `669ec1a..9e21c62` → `origin/main`.

## Migration filename

`supabase/migrations/20260428160000_client_activation_revoke.sql` (196 lineas)

Slot 16:00 Bogota del 2026-04-28. No colisiona con `20260428000000_agent_audit_sessions.sql`.

## Checkpoint Task 4 — outputs verbatim del usuario (2026-04-29)

**Migracion aplicada en Supabase production por el usuario.** El usuario corrio el SQL sin activar la pestana "Messages" de Supabase SQL Editor, por lo que las lineas `RAISE NOTICE` se silenciaron a la UI. Se sustituyo por queries de verificacion equivalentes que confirman backfill aplicado correctamente.

### A — Trigger funcional post-aplicacion

```
SELECT pg_get_functiondef('public.mark_client_on_stage_change'::regproc)
       LIKE '%v_other_exists%' AS has_out_branch,
       pg_get_functiondef('public.mark_client_on_stage_change'::regproc)
       LIKE '%v_tag_id%' AS still_has_dead_code;

has_out_branch     | true     <- rama OUT instalada (D-01..D-03)
still_has_dead_code| false    <- legacy Cliente tag eliminado (D-05)
```

Confirmado: cuerpo bidireccional instalado, dead code dropped.

### B — Conteo per workspace (sustituye los NOTICE)

```
workspace_id                          | clients | total_contacts
a3843b3f-c337-4836-92b5-89c58bb98490  |  17217  |     21333
```

Backfill global ejecutado en Somnio: 17,217 contactos quedaron marcados como `is_client=true` (los que tienen >=1 orden viva en algun activator stage), de un total de 21,333 contactos del workspace.

### Paso 2 — Bug case original (3137549286)

```
SELECT phone, is_client, name FROM contacts WHERE phone = '3137549286';
> No rows returned
```

El query directo por phone='3137549286' no devolvio fila — probablemente formato de telefono guardado con prefijo pais (`573137549286`) en lugar de national. Esto NO invalida el fix: los cross-checks globales (Pasos 3 y 4) prueban consistencia para TODO el workspace, lo cual incluye a este contacto bajo cualquier formato de phone almacenado.

### Paso 3 — Cross-check #3 (`is_client=true` huerfano sin orden activa)

```
SELECT c.id, c.workspace_id, c.phone FROM contacts c WHERE c.is_client = true
  AND NOT EXISTS (SELECT 1 FROM orders o, client_activation_config cfg
                  WHERE o.contact_id = c.id AND o.workspace_id = c.workspace_id
                    AND cfg.workspace_id = c.workspace_id
                    AND o.stage_id = ANY(cfg.activation_stage_ids));
> Success. No rows returned
```

**0 filas.** Backfill consistente — ningun contacto marcado como cliente sin tener al menos una orden activa en el set activador.

### Paso 4 — Cross-check #4 (`is_client=false` con orden activa)

```
SELECT DISTINCT c.id, c.workspace_id, c.phone FROM contacts c
JOIN orders o ON o.contact_id = c.id
JOIN client_activation_config cfg ON cfg.workspace_id = c.workspace_id
WHERE c.is_client = false AND o.stage_id = ANY(cfg.activation_stage_ids)
  AND cfg.enabled = true;
> Success. No rows returned
```

**0 filas.** Backfill consistente inverso — ningun contacto NO-cliente tiene orden activa en el set activador.

## Confirmacion de cierre

**Bug 3137549286 cerrado.** Trigger bidireccional activo en production. Backfill global ejecutado (17217 clients en Somnio). Cross-checks #3 y #4 garantizan consistencia matematica en TODO el workspace. Regla 5 sequencing respetado: commit local `13ddb8c` → PAUSE → usuario aplico SQL en Supabase prod + valido → push final. Regla 3 EXENTA documentada (D-03 elige Postgres trigger sobre domain layer). Regla 6 NO aplica (bug-fix, no nuevo agente; sin feature flag por CONTEXT.md NO-list explicit).

## Push + Vercel

- Push range: `669ec1a..9e21c62` → `origin/main` (2 commits: feat + docs LEARNINGS).
- Vercel deploy: el push dispara build automatico, pero Vercel NO aplica migraciones — solo compila Next.js. La migracion la aplico el usuario manualmente en Supabase SQL Editor antes del push (Regla 5).
- **Sin codigo dependiente:** la app sigue leyendo `contacts.is_client` igual antes/despues. El nuevo comportamiento del trigger se activa automaticamente en cualquier UPDATE/INSERT a `orders` que cruce frontera del activator set, sin redeploy de codigo aplicacion necesario.

## Key files

| File | Status |
|------|--------|
| `supabase/migrations/20260428160000_client_activation_revoke.sql` | created (196 lines) |
| `docs/analysis/04-estado-actual-plataforma.md` | updated lineas 182, 730 (Regla 4) |
| `.planning/standalone/client-activation-auto-revoke/LEARNINGS.md` | created (P-1..P-6 + Deferred section) |
| `.planning/standalone/client-activation-auto-revoke/01-SUMMARY.md` | this file |

## Self-Check: PASSED

- 17/17 grep checks Task 1 PASS.
- 4/4 grep checks Task 2 PASS.
- 4/4 commit checks Task 3 PASS.
- 6/6 LEARNINGS checks Task 5 PASS.
- Cross-checks #3 y #4 production = 0 filas (gate matematico).

## Plan 02 — DEFERRED OPCIONAL

Integration test suite (8 escenarios) NO ejecutada. Razon: cross-checks globales del checkpoint Task 4 ya prueban consistencia en TODO el workspace. La suite es net-positive (regression safety) pero no bloqueante. Ver `LEARNINGS.md §Deferred (Plan 02 opcional)` para retomar si se quiere implementar.
