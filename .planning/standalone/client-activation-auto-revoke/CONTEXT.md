# Client Activation Auto-Revoke — Contexto

**Tipo:** Standalone (fix estructural transversal CRM/routing)
**Origen:** Conversación 2026-04-28. Bug productivo: contacto `3137549286` quedó con `is_client=true` después de que su pedido salió del stage activador (devolución/cancelación). El sistema actual marca `is_client=true` al ENTRAR a stage activador pero NUNCA lo revoca al salir.
**Workspace afectado prioritario:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) — el routing de Somnio depende de `isClient` para decidir `somnio-recompra-v1` vs `somnio-sales-v3`.

---

## Problema

Trigger Postgres `mark_client_on_stage_change` (migration `20260221000000_client_activation_badge.sql:49-115`) es **one-way**:
- Set `is_client=true` cuando `OLD.stage_id != NEW.stage_id` AND `NEW.stage_id IN activation_stage_ids`
- **NO existe lógica para set false** cuando un pedido sale de stage activador

Consecuencia productiva:
- Cliente compra → pedido entra a stage `entregado` → `is_client=true` ✓
- Pedido se devuelve / cancela → sale de `entregado` → `is_client` permanece `true` ✗
- Próximo mensaje del contacto → routing lo manda a `somnio-recompra-v1` (recompra) cuando debería ir a `somnio-sales-v3` (primera compra)
- Función `backfillIsClient()` (`src/lib/domain/client-activation.ts:115`) SÍ recalcula correctamente, pero solo se ejecuta cuando cambia `client_activation_config` (no en tiempo real)

---

## Decisiones (D-01..D-05)

### D-01 — Definición de "es cliente": vivo (no histórico)

**Decisión:** `is_client = true` SI Y SOLO SI el contacto tiene `≥1 orden actual` en stage de `activation_stage_ids`. Sin ventana de gracia, sin flag histórico.

**Implicación:** Si todos los pedidos de un contacto salen de stages activadores (cancelados, devueltos, vueltos a stage anterior), `is_client` flipa a `false` automáticamente.

**Archivadas (`archived_at IS NOT NULL`):** Mantener comportamiento actual de `backfillIsClient()` que NO filtra por `archived_at`. Una orden archivada en stage activador SÍ cuenta. Si el cliente quiere excluirlas debería archivar=cambiar de stage también. (Validar en research si `backfillIsClient` actual tiene este comportamiento — código línea 138-141 NO filtra `archived_at`.)

### D-02 — Disparador: solo movimientos IN/OUT del stage activador

**Decisión:** El trigger Postgres se ejecuta SOLO cuando hay transición que cruza la frontera del set activador. NO en transiciones internas.

**Casos que disparan recálculo:**
- IN: `OLD.stage_id NOT IN activation_stage_ids` AND `NEW.stage_id IN activation_stage_ids` → mantener lógica de SET actual
- OUT: `OLD.stage_id IN activation_stage_ids` AND `NEW.stage_id NOT IN activation_stage_ids` → NUEVO: evaluar si UNSET aplica
- INSERT directo a stage activador → IN (lógica existente)

**Casos que NO disparan recálculo:**
- Transición entre dos no-activadores (ej: `nuevo` → `confirmado`, ambos fuera del set activador) → skip
- Transición entre dos activadores (raro, ej: `entregado` → `entregado-revisado` si ambos están en set) → skip (sigue siendo cliente)
- INSERT a stage no-activador → skip

**Razón:** Eficiencia. Evita queries innecesarias en cambios de stage que no pueden afectar `is_client`.

**No disparar en:**
- Archivado de orden (`UPDATE archived_at`) — D-01 dice que archivadas SÍ cuentan
- DELETE de orden — morfx no hace DELETE real (soft-delete)

### D-03 — Lugar: extender trigger Postgres existente

**Decisión:** Modificar el trigger Postgres `mark_client_on_stage_change` para incluir lógica de UNSET. NO mover a domain layer.

**Razones:**
- Atomicidad: mismo TX que el `UPDATE orders SET stage_id = ...`
- Imposible bypassear: cualquier ruta que muta stage (domain layer, SQL manual, otra app) dispara el trigger
- Consistencia con la lógica actual de SET (también está en el trigger)
- No requiere cambios en `moveOrderToStage` ni en `crm-writer-adapter`

**Implicación arquitectural:**
- La nueva migration crea `mark_client_on_stage_change_v2()` (o reemplaza el actual con `CREATE OR REPLACE`)
- Lógica del UNSET: `EXISTS (SELECT 1 FROM orders WHERE contact_id = NEW.contact_id AND stage_id = ANY(activation_stage_ids) AND id != NEW.id)` — si NO existe otra orden viva en stage activador del mismo contacto → `UPDATE contacts SET is_client = false`

**Edge case multi-pedido:** Contacto con 2 pedidos en stage activador. Uno sale → `is_client` permanece `true` porque el otro sigue. El trigger usa `EXISTS` con `id != NEW.id` para no contar el pedido que está cambiando.

### D-04 — Backfill: automático en la misma migration

**Decisión:** La migration `20260XXX000000_client_activation_revoke.sql` ejecuta backfill global al final, recorriendo cada workspace con `client_activation_config.enabled=true`.

**Implementación sugerida (research valida):**
```sql
-- Al final de la migration, después de CREATE OR REPLACE FUNCTION + trigger:
DO $$
DECLARE
  v_workspace_id UUID;
BEGIN
  FOR v_workspace_id IN
    SELECT workspace_id FROM client_activation_config WHERE enabled = true
  LOOP
    -- Reset todos los contactos del workspace a false
    UPDATE contacts SET is_client = false WHERE workspace_id = v_workspace_id AND is_client = true;
    -- Set true solo a los que tienen al menos 1 orden en stage activador
    UPDATE contacts c SET is_client = true
    FROM (
      SELECT DISTINCT o.contact_id
      FROM orders o, client_activation_config cfg
      WHERE o.workspace_id = v_workspace_id
        AND cfg.workspace_id = v_workspace_id
        AND o.contact_id IS NOT NULL
        AND o.stage_id = ANY(cfg.activation_stage_ids)
    ) AS clients
    WHERE c.id = clients.contact_id;
  END LOOP;
END $$;
```

**Garantías:** Limpia 3137549286 y cualquier otro contacto mal marcado en TODOS los workspaces sin acción manual.

**Caso 3137549286 puntual:** El backfill global lo cubre. NO necesita UPDATE manual previo. El usuario puede correr el SELECT post-deploy para verificar:
```sql
SELECT phone, is_client FROM contacts WHERE phone = '3137549286';
```

### D-05 — Tag legacy "Cliente": investigación pendiente en research-phase

**Decisión:** `gsd-research-phase` DEBE responder ANTES de planning:

1. ¿Existe un row `tags WHERE name = 'Cliente'` en algún workspace? (SQL grep contra prod read-only)
2. Si existe, ¿hay código que filtre/lea por ese tag? Grep en `src/`:
   - `WHERE name = 'Cliente'`
   - `tag.name === 'Cliente'`
   - Templates / automations / agents que lo referencian
3. ¿La UI lo muestra en algún lado (lista de tags del contacto, filtros)?

**Branches según resultado:**

- **Caso A — Existe Y se usa:** El nuevo trigger debe también `DELETE FROM contact_tags WHERE contact_id = NEW.contact_id AND tag_id = (SELECT id FROM tags WHERE workspace_id = NEW.workspace_id AND name = 'Cliente')` cuando hace UNSET. Mantener simetría set/unset del tag.

- **Caso B — Existe pero NO se usa (código muerto):** Eliminar líneas 94-105 del trigger viejo en la nueva migration (limpiar deuda técnica). NO tocar `contact_tags` rows existentes (riesgo nulo, deja al usuario decidir limpieza manual).

- **Caso C — No existe en ningún workspace:** Eliminar líneas 94-105 del trigger viejo. Confirmar que el `SELECT t.id INTO v_tag_id` siempre retorna NULL → el `IF v_tag_id IS NOT NULL` siempre era false → código nunca ejecutó.

**Nota del usuario (2026-04-28):** *"hasta ahora no he visto ningun tag que reflejado en esas ordenes, unicamente el icono en el badge de conversaciones de whatsapp(el icono si se mantiene) pero lo del tag no se si te refieras a eso o a un contact tag literal, depronto existe la regla pero si es tag tag(no el icono) es codigo muerto(revisar bien para ver cual de los 2 es)"*

El icono en badge del inbox v2 es separado — viene de `contacts.is_client` directo, no del tag. Eso ya queda correcto con el fix de D-01..D-04.

---

## Locked requirements

1. Trigger Postgres `mark_client_on_stage_change` ahora maneja UNSET cuando última orden viva en stage activador sale del set.
2. Lógica IN/OUT optimizada: solo dispara recálculo en cruces de frontera del set activador.
3. Backfill global ejecutado en la misma migration que crea el trigger nuevo.
4. Sin cambios en domain layer (`moveOrderToStage`, `client-activation.ts`) — el trigger es self-contained.
5. Tag legacy "Cliente" decidido en research-phase según hallazgos en DB y código.
6. Routing fact `isClient` (`src/lib/agents/routing/facts.ts`) sigue funcionando sin cambios — lee DB en cada eval.
7. Compatibilidad con `agent-lifecycle-router` D-15: el fact `isClient` puede flipear true→false sin romper la regla priority-900 (router se evalúa por mensaje, no cachea).

---

## Verificación post-deploy (UAT)

1. `SELECT phone, is_client FROM contacts WHERE phone = '3137549286';` → `is_client = false`
2. Mover un pedido de prueba en Somnio: stage activador → no-activador → verificar `is_client` flipa a false (si era el único pedido del contacto).
3. Crear pedido nuevo en stage activador → `is_client` flipa a true.
4. Mover pedido entre dos no-activadores → `is_client` no cambia (no debería disparar recálculo).
5. Contacto con 2 pedidos en stage activador, mover uno a no-activador → `is_client` permanece true (el otro sigue activo).
6. Verificar routing: contacto con `is_client=false` después del fix → enrutado a `somnio-sales-v3` (no a recompra).

---

## Archivos previstos a modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/20260XXX000000_client_activation_revoke.sql` | NUEVO. CREATE OR REPLACE FUNCTION + DO block backfill |
| (Tag legacy) | Decisión post-research (D-05): eliminar líneas 94-105 del trigger anterior o agregar DELETE en UNSET |
| `src/lib/domain/client-activation.ts` | Sin cambios funcionales. Posible doc comment indicando que el trigger ahora hace unset también |
| `src/lib/domain/__tests__/client-activation.test.ts` | NUEVOS tests si existe el archivo. Si no, considerar crear suite de integración. Validar IN/OUT/multi-order |

---

## NO hacer

- NO cambiar `moveOrderToStage()` ni `crm-writer-adapter.ts` — atomicidad del trigger ya cubre.
- NO agregar feature flag — el comportamiento actual es buggy, el nuevo es correcto, sin "rollback" deseable.
- NO emitir evento Inngest `contact.is_client_changed` en este standalone (out of scope; abrir standalone separado si surge necesidad de observabilidad).
- NO tocar la UI de `/settings/activacion-cliente` — el flujo de config queda igual.
- NO modificar `backfillIsClient()` del domain — sigue sirviendo para el botón "Recalcular" del standalone `client-activation-backfill`.
- NO ampliar scope a borrar histórico de tags `Cliente` ya creados manualmente por usuarios — solo evaluar el código del trigger.

---

## Próximo paso

`/gsd-research-phase client-activation-auto-revoke` — investigar:

1. Tag 'Cliente' (D-05): SQL contra prod + grep en src/.
2. Patrón actual del trigger Postgres con `EXISTS` para edge case multi-pedido.
3. Tests existentes en `client-activation.test.ts` y patrón a seguir.
4. Verificar `backfillIsClient()` no filtra por `archived_at` (D-01 derived).
5. Confirmar que `agent-lifecycle-router` no cachea `isClient`.
6. Estimar volumen de contactos a backfillear en Somnio (`SELECT COUNT(*) FROM contacts WHERE workspace_id = '...' AND is_client = true`).
