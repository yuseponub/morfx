# Client Activation Auto-Revoke — Learnings

**Shipped:** 2026-04-29 (Plan 01 cierre — migracion aplicada en Somnio prod + push)
**Standalone path:** `.planning/standalone/client-activation-auto-revoke/`
**Bug origen:** Contacto `3137549286` con `is_client=true` tras devolucion. Trigger one-way del 2026-02-21 nunca revocaba.
**Plans:** 01 (migracion compuesta + backfill global + docs + push). Plan 02 (integration tests) deferido — opcional, ver §Deferred section.

## Commits

### Plan 01 — Bidirectional trigger + global backfill
- `13ddb8c` `feat(client-activation-auto-revoke): bidirectional is_client trigger + global backfill`

## Salidas relevantes del backfill (Somnio)

NOTICE output del Paso 1 NO se capturo (usuario no activo la pestana "Messages" antes de correr — `RAISE NOTICE` se silencio a la UI; logs siguen disponibles en Supabase project logs si se necesitaran). Se sustituyo por query equivalente que confirma backfill aplicado:

```
-- Verificacion equivalente post-aplicacion (ejecutada 2026-04-29):
-- SELECT cfg.workspace_id, COUNT(*) FILTER (WHERE c.is_client=true) AS clients, COUNT(*) AS total
-- FROM client_activation_config cfg JOIN contacts c ON c.workspace_id=cfg.workspace_id
-- WHERE cfg.enabled=true GROUP BY cfg.workspace_id;

workspace_id                          | clients | total_contacts
a3843b3f-c337-4836-92b5-89c58bb98490  |  17217  |     21333
```

**Snapshot trigger funcional post-aplicacion:**
```
-- SELECT pg_get_functiondef('public.mark_client_on_stage_change'::regproc)
--        LIKE '%v_other_exists%' AS has_out_branch,
--        ... LIKE '%v_tag_id%' AS still_has_dead_code;

has_out_branch     | true     <- rama OUT instalada (D-01..D-03)
still_has_dead_code| false    <- legacy Cliente tag eliminado (D-05)
```

**Cross-checks RESEARCH §Production Verification SQL Bundle:**
- Cross-check #3 (`is_client=true` huerfano sin orden activa en activator set): **0 filas** ✓
- Cross-check #4 (`is_client=false` con orden activa en activator stage): **0 filas** ✓

Gate matematico cumplido: backfill global garantiza consistencia bidireccional en TODO el workspace, no solo en el contacto 3137549286 originador del bug.

## Patterns aprendidos (reusables)

### P-1: D-05 finding — Tag legacy `Cliente` era dead code

**Contexto:** El trigger del 2026-02-21 incluia `INSERT INTO contact_tags` con tag `name = 'Cliente'` (case-sensitive). Research grep exhaustivo en `src/` (`rg "['\"]Cliente['\"]" src/`) confirmo zero consumers funcionales:
- 3 hits totales, todos unrelated (fallback display name, HTML tooltip, speaker label en transcript).
- El badge "Cliente" del inbox v2 se alimenta de `contacts.is_client` directo, NO del tag.
- El trigger porteado del 2026-02-03 cambio `LOWER(name) = 'cliente'` a `name = 'Cliente'` — case-sensitivity break implica que workspaces con tag legacy lowercase nunca matchearon, lo que sugiere que el branch nunca disparo en prod desde el 2026-02-21.

**Leccion:** Antes de portear codigo en migraciones (especialmente case-sensitive checks contra `tags`), grep src/ + grep prod read-only. Dead code en triggers genera deuda silenciosa que se acarrea de migracion en migracion.

### P-2: EXISTS con `OLD.contact_id` (no `NEW.contact_id`) en triggers de unset bidireccional

**Contexto:** Para evaluar "¿queda otra orden activa del contacto?" en la rama OUT del trigger, la subquery EXISTS DEBE usar `OLD.contact_id`, no `NEW.contact_id`. Razon:
- Si el UPDATE reasigna el contacto (`OLD.contact_id <> NEW.contact_id`), evaluar `NEW.contact_id` busca ordenes del NUEVO duenio cuando lo que queremos saber es si el VIEJO duenio sigue siendo cliente.
- El `id <> NEW.id` excluye el orden que esta cambiando (siempre seguro porque el id no cambia entre OLD y NEW).
- Defensive trailing block evalua tambien al nuevo contacto si el reasignamiento lo deja con primera orden en activator stage.

**Leccion:** En triggers bidireccionales sobre tablas con FK que pueden cambiar en mismo UPDATE (contact_id, workspace_id, etc.), siempre razonar sobre OLD vs NEW per-rama. Default a OLD para revocacion, NEW para activacion.

### P-3: `IS NOT DISTINCT FROM` para guardas de equality con NULL posible

**Contexto:** El guard original `IF TG_OP = 'UPDATE' AND OLD.stage_id = NEW.stage_id THEN RETURN NEW` falla si alguno de los dos `stage_id` es NULL — el `=` retorna NULL (no true/false), y el IF entonces NO skipea como deberia. Substituir por `IS NOT DISTINCT FROM` resuelve: trata NULL = NULL como true.

**Leccion:** En PL/pgSQL, cualquier guard de "no cambio" o "valores iguales" sobre columnas nullable DEBE usar `IS NOT DISTINCT FROM` (o `IS DISTINCT FROM` para "cambio"). El `=` es un footgun para casos edge.

### P-4: Backfill DO $$ + RAISE NOTICE para observabilidad en Supabase SQL Editor

**Contexto:** Backfill bulk dentro de migracion es opaco si no emite mensajes — el usuario no sabe si proceso 0 o 17217 contactos. El patron `DO $$ ... GET DIAGNOSTICS x = ROW_COUNT; RAISE NOTICE 'msg=%', x; END $$` da visibilidad per-iteracion sin requerir tabla de logs separada.

**Patron reusable:**
```sql
DO $$
DECLARE
  v_loop_var TYPE;
  v_count INTEGER;
BEGIN
  FOR v_loop_var IN SELECT ... LOOP
    UPDATE ... ;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'context: var=% count=%', v_loop_var, v_count;
  END LOOP;
END $$;
```

**Caveat operativo:** Supabase SQL Editor tiene una pestana "Messages" / "NOTICE output" — el usuario debe activarla **ANTES de correr** o los NOTICE se silencian a la UI (siguen disponibles en logs del proyecto). Como mitigacion, el plan deberia incluir una query de fallback que reconstruya el conteo per-workspace (joining `client_activation_config + contacts` con `COUNT FILTER`) — sirve de sanity check incluso si los NOTICE se perdieron, como ocurrio en este standalone.

**Leccion:** Migraciones con bulk operations DEBEN emitir RAISE NOTICE per-batch + tener query de fallback documentada en el plan. Sirve para validar que el backfill corrio + sirve de baseline en auditorias futuras.

### P-5: Regla 5 simplest variant — migracion sin codigo dependiente

**Contexto:** Estandar de Regla 5 es "aplicar migracion en prod ANTES de pushear codigo que la usa". En este standalone NO HAY codigo dependiente — la app sigue leyendo `contacts.is_client` igual antes/despues. La migracion (1) reemplaza el cuerpo del trigger y (2) hace backfill. Failure mode bounded: si SQL falla, el trigger one-way previo sigue activo, app no rompe.

**Workflow simplificado:**
1. Crear migracion + commit local.
2. PAUSE → usuario aplica SQL en Supabase prod + valida.
3. Push (sincronizacion repo ↔ prod, no introduce nuevo comportamiento).

**Leccion:** Regla 5 es un spectrum. Cuando NO hay codigo dependiente, el push final es archival (mantiene repo como source of truth pero no introduce runtime change). Documentar el subtype "migracion-only" en el plan para que el usuario entienda la naturaleza low-risk del checkpoint.

### P-6: CREATE OR REPLACE FUNCTION mantiene trigger binding

**Contexto:** El trigger `orders_mark_client_on_stage` se creo el 2026-02-21 apuntando a `mark_client_on_stage_change()`. Esta migracion `CREATE OR REPLACE FUNCTION` cambia el cuerpo, pero el trigger sigue funcional sin recrearlo. NO ejecutar `DROP TRIGGER` + `CREATE TRIGGER` — eso es innecesario y arriesga perder el binding entre el drop y el create si algo falla en medio.

**Leccion:** PL/pgSQL es funcion-y-binding-separado. CREATE OR REPLACE FUNCTION es atomico para el cuerpo. Triggers atan nombre-de-funcion, no cuerpo, asi que el cambio se propaga automaticamente al siguiente fire.

## Anti-patterns evitados

- **NO emitir Inngest event para is_client change** — CONTEXT.md NO-list explicit. Si surge necesidad de observabilidad downstream, abrir standalone separado.
- **NO modificar `src/lib/domain/client-activation.ts`** — `backfillIsClient()` sigue valido para el boton "Recalcular" del standalone `client-activation-backfill`. Domain-level y trigger-level conviven (el primero es manual desde UI, el segundo es automatico per-mutacion).
- **NO purgar `contact_tags` con tag `Cliente`** — CONTEXT.md NO-list explicit. La limpieza historica de datos que el usuario manualmente creo es decision del usuario, no de esta migracion.
- **NO feature flag** — CONTEXT.md NO-list explicit. El comportamiento previo era buggy, el nuevo es correcto, sin rollback deseable.

## Deferred (Plan 02 opcional)

Integration test suite en `src/__tests__/integration/client-activation-trigger.test.ts` mirroring el patron de `orders-cas.test.ts`. RESEARCH §Test Strategy lista 8 escenarios:
1. INSERT a activator → flips true.
2. UPDATE non-activator → activator → flips true.
3. UPDATE activator → non-activator (sin otra orden) → flips false.
4. UPDATE activator → non-activator (con otra orden activator) → STAYS true.
5. UPDATE non-activator → non-activator → no cambio.
6. UPDATE activator → activator (mismo set) → no cambio.
7. INSERT outside activator → no cambio.
8. Same-TX two-order updates same contact → final state correcto.

**Razon de deferral:** El UAT manual del checkpoint Task 4 cubre los escenarios criticos via cross-check #3 y #4 globales (0 filas = consistencia matematica garantizada en TODO el workspace, no solo en el caso originador). La suite automatizada es net-positive (regression safety) pero no bloqueante para el cierre del bug. Re-evaluar si surge regression en el trigger en futuras migraciones.

Para retomar: abrir nuevo plan `02-PLAN.md` en este standalone, mirror estructura de `src/__tests__/integration/orders-cas.test.ts` (env-gated con `describe.skipIf(!envReady)`), implementar los 8 escenarios.

## Files modified summary

| File | Change |
|------|--------|
| `supabase/migrations/20260428160000_client_activation_revoke.sql` | NUEVO — CREATE OR REPLACE FUNCTION + composite index + DO $$ realtime guard + DO $$ backfill |
| `docs/analysis/04-estado-actual-plataforma.md` | Updated lineas Seccion 2.5 + Triggers DB para reflejar bidireccionalidad + dead-code Cliente removido |

## Files NOT modified (intentional — out of scope)

| File | Reason |
|------|--------|
| `src/lib/domain/client-activation.ts` | D-03: logica vive en trigger DB. backfillIsClient() sigue valido para UI manual recalc. |
| `src/lib/domain/orders.ts` (`moveOrderToStage`) | D-03: trigger atomico cubre todas las rutas, no necesita wrapper en domain. |
| `src/lib/agents/crm-writer/two-step.ts` | D-03: trigger se dispara desde UPDATE underlying, no requiere proxy. |
| `src/lib/agents/routing/facts.ts` (`isClient`) | RQ-5: lee live DB per request, sin cache. Funciona transparente con flag bidireccional. |
| `src/app/(dashboard)/whatsapp/components/conversation-item.tsx` | D-05: badge alimentado por `contacts.is_client`, no por tag `Cliente`. Sin cambios. |
| `contact_tags` rows historicas con `Cliente` tag | CONTEXT.md NO-list: limpieza de datos historicos out of scope. |
