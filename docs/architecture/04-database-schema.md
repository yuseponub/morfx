# Esquema de Base de Datos MorfX v2.0

**Actualizado:** 19 de Febrero 2026

---

## Resumen

36 tablas en PostgreSQL (Supabase) con RLS habilitado en todas. Multi-tenant via workspace_id. 25 migraciones aplicadas (20260127 → 20260217). Funciones helper para aislamiento: `is_workspace_member()`, `is_workspace_admin()`, `is_workspace_manager()`, `is_workspace_owner()`.

---

## Diagrama ER Principal

```
┌─────────────────┐
│   workspaces    │─────┐
├─────────────────┤     │
│ id (PK)         │     │ 1:N
│ name, slug      │     │
│ settings (JSONB)│     ▼
│ created_at      │  ┌─────────────────┐    ┌───────────────────┐
└─────────────────┘  │workspace_members│    │workspace_invitations│
                     ├─────────────────┤    └───────────────────┘
                     │ user_id (FK→auth)│
                     │ workspace_id(FK) │
                     │ role (owner/     │
                     │   admin/agent)   │
                     └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    contacts     │◄────│  contact_tags   │────►│      tags       │
├─────────────────┤     └─────────────────┘     ├─────────────────┤
│ id (PK)         │                              │ id (PK)         │
│ workspace_id(FK)│     ┌─────────────────┐     │ workspace_id(FK)│
│ name            │◄────│  contact_notes  │     │ name, color     │
│ phone (E.164)   │     └─────────────────┘     │ applies_to      │
│ email           │                              │   (whatsapp/    │
│ address, city   │     ┌─────────────────┐     │    orders/both) │
│ department      │◄────│contact_activity │     └─────────────────┘
│ custom_fields   │     └─────────────────┘            │
│   (JSONB)       │                                    │
└────────┬────────┘                              ┌─────┴──────────┐
         │                                       │   order_tags   │
         │ 1:N                                   └─────┬──────────┘
         ▼                                             │
┌─────────────────┐     ┌─────────────────┐            │
│ conversations   │◄────│conversation_tags│            │
├─────────────────┤     └─────────────────┘            │
│ id (PK)         │                                    │
│ contact_id (FK) │     ┌─────────────────┐            │
│ workspace_id(FK)│◄────│    messages     │     ┌──────┴──────────┐
│ status          │     ├─────────────────┤     │     orders      │
│ assigned_to     │     │ id (PK)         │     ├─────────────────┤
│ team_id         │     │ conversation_id │     │ id (PK)         │
│ agent_conv (bool│     │ direction (in/  │     │ workspace_id(FK)│
│ agent_crm (bool)│     │   out)          │     │ contact_id (FK) │
│ last_message_at │     │ type (text/img/ │     │ pipeline_id(FK) │
│ last_customer_  │     │   template/etc) │     │ stage_id (FK)   │
│   message_at    │     │ content (JSONB) │     │ name            │
│ unread_count    │     │ wamid (unique)  │     │ description     │
└─────────────────┘     │ media_url       │     │ total_value     │
                        │ status (pending/│     │ shipping_address│
                        │  sent/delivered/│     │ shipping_city   │
                        │  read/failed)   │     │ shipping_dept   │
                        │ sent_by_agent   │     │ carrier         │
                        │ template_name   │     │ tracking_number │
                        └─────────────────┘     │ shopify_order_id│
                                                │ source_order_id │
                                                │ custom_fields   │
                                                └────────┬────────┘
                                                         │ 1:N
                                                         ▼
                                                ┌─────────────────┐
                                                │ order_products  │
                                                ├─────────────────┤
                                                │ product_id (FK) │
                                                │ sku, title      │
                                                │ unit_price      │
                                                │ quantity         │
                                                │ subtotal        │
                                                └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│    pipelines    │────►│pipeline_stages  │
├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │
│ workspace_id(FK)│     │ pipeline_id(FK) │
│ name            │     │ name, color     │
│ is_default      │     │ position        │
└─────────────────┘     │ wip_limit       │
                        │ is_closed       │
                        │ order_state_id  │
                        └─────────────────┘

┌─────────────────┐     ┌─────────────────┐
│  order_states   │     │    products     │
├─────────────────┤     ├─────────────────┤
│ id, name, emoji │     │ id, sku, title  │
│ workspace_id    │     │ price, active   │
│ position        │     │ shopify_product │
└─────────────────┘     │ _id             │
                        └─────────────────┘
```

---

## Tablas por Modulo

### Core (3 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `workspaces` | id, name, slug, settings (JSONB) | ✅ | Root multi-tenant |
| `workspace_members` | user_id, workspace_id, role | ✅ | owner/admin/agent |
| `workspace_invitations` | email, workspace_id, token, expires_at | ✅ | Token-based invites |

### CRM — Contactos (4 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `contacts` | name, phone (unique/workspace), email, address, city, department, custom_fields (JSONB) | ✅ | E.164 phone format |
| `contact_tags` | contact_id, tag_id | ✅ | M2M junction |
| `contact_notes` | contact_id, user_id, content | ✅ | Immutable author |
| `contact_activity` | contact_id, action, changes (JSONB) | ✅ | Auto via trigger |

### CRM — Pedidos (8 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `orders` | contact_id, pipeline_id, stage_id, name, total_value, shipping_*, shopify_order_id, source_order_id, custom_fields | ✅ | Total auto-calculado via trigger |
| `order_products` | order_id, product_id, sku, title, unit_price, quantity, subtotal | ✅ | Snapshot pricing |
| `order_tags` | order_id, tag_id | ✅ | M2M junction |
| `pipelines` | workspace_id, name, is_default | ✅ | Multiple per workspace |
| `pipeline_stages` | pipeline_id, name, color, position, wip_limit, is_closed, order_state_id | ✅ | Ordered stages |
| `order_states` | workspace_id, name, emoji, position | ✅ | State groupings |
| `products` | workspace_id, sku, title, price, active, shopify_product_id | ✅ | Product catalog |
| `saved_views` | workspace_id, name, entity_type, filters (JSONB) | ✅ | User-saved filters |

### CRM — Tags (2 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `tags` | workspace_id, name, color, applies_to (whatsapp/orders/both) | ✅ | Shared across modules |
| `custom_field_definitions` | workspace_id, entity_type, field_name, field_type, options, is_required | ✅ | Schema definitions |

### WhatsApp (7 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `conversations` | contact_id, workspace_id, status, assigned_to, team_id, agent_conversational, agent_crm, last_message_at, last_customer_message_at, unread_count | ✅ | Unique phone/workspace, Realtime enabled |
| `messages` | conversation_id, direction, type, content (JSONB), wamid (unique), media_url, status, sent_by_agent, template_name | ✅ | Realtime enabled, dedup via wamid |
| `conversation_tags` | conversation_id, tag_id | ✅ | M2M junction |
| `whatsapp_templates` | workspace_id, name, content, status (PENDING/APPROVED/REJECTED/PAUSED), quality_rating, variable_mapping | ✅ | Meta approval workflow |
| `teams` | workspace_id, name, is_default | ✅ | Agent teams |
| `team_members` | team_id, user_id, is_online, last_assigned_at | ✅ | Round-robin tracking |
| `quick_replies` | workspace_id, shortcut, content, media_url, media_type | ✅ | Message shortcuts |

### WhatsApp — Costos (2 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `message_costs` | message_id, category, country, cost_usd | ✅ | Per-message tracking |
| `workspace_limits` | workspace_id, allowed_categories, monthly_spend_limit_usd | ✅ | Spending limits |

### Tareas (4 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `tasks` | workspace_id, title, status, priority, due_date, assigned_to, contact_id/order_id/conversation_id (exclusive arc), completed_at | ✅ | Max 1 entity link |
| `task_types` | workspace_id, name, color, position | ✅ | Custom categories |
| `task_notes` | task_id, user_id, content | ✅ | Task comments |
| `task_activity` | task_id, action, changes, postponement_count | ✅ | Auto via trigger |

### Agentes IA (4 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `agent_sessions` | conversation_id, agent_id, version (optimistic lock), status, current_mode | ✅ | Session per conversation |
| `agent_turns` | session_id, role, content, intent_detected, confidence, tools_called (JSONB), tokens_used | ✅ | Complete audit trail |
| `session_state` | session_id, intents_vistos, templates_enviados, datos_capturados, pack_seleccionado | ✅ | Flexible JSONB state |
| `agent_templates` | agent_id, intent, visit_type, content_type, content, orden, delay_s, workspace_id | ✅ | Intent-to-template mapping |
| `workspace_agent_config` | workspace_id, agent_enabled, timer_preset, response_speed, handoff_message | ✅ | Per-workspace settings |

### Automatizaciones (3 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `automations` | workspace_id, name, trigger_type, trigger_config (JSONB), conditions (JSONB), actions (JSONB[]), is_enabled | ✅ | Automation rules |
| `automation_executions` | automation_id, status (running/success/failed/cancelled), actions_log (JSONB[]), cascade_depth, duration_ms | ✅ | Execution history |
| `builder_sessions` | workspace_id, user_id, messages (JSONB), automations_created (UUID[]) | ✅ | AI builder chat |

### Integraciones (3 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `integrations` | workspace_id, type ('shopify'), config (JSONB encrypted), is_active | ✅ | Third-party connections |
| `webhook_events` | integration_id, external_id (unique), topic, payload (JSONB), status, retry_count | ✅ | Idempotency + audit |
| `sms_messages` | workspace_id, twilio_sid (unique), from/to, status, price, segments, automation_execution_id | ✅ | Twilio SMS tracking |

### Sistema (2 tablas)

| Tabla | Columnas Clave | RLS | Notas |
|-------|---------------|-----|-------|
| `tool_executions` | workspace_id, tool_name, inputs/outputs (JSONB), status, duration_ms, snapshot_before/after | ✅ | Forensic audit log |
| `api_keys` | workspace_id, key_hash (bcrypt), key_prefix, permissions, revoked_at | ✅ | External API auth |

---

## Functions & Triggers PostgreSQL

### Helper Functions (RLS)
```sql
is_workspace_member(workspace_id UUID) → BOOLEAN
is_workspace_admin(workspace_id UUID) → BOOLEAN  -- owner + admin
is_workspace_manager(workspace_id UUID) → BOOLEAN  -- alias for admin
is_workspace_owner(workspace_id UUID) → BOOLEAN  -- owner only
get_current_workspace_id() → UUID
get_workspace_from_team(team_id UUID) → UUID
get_workspace_from_integration(integration_id UUID) → UUID
validate_api_key(key_hash TEXT) → {workspace_id, permissions}
```

### Auto-Triggers
```sql
update_order_total()        -- Recalcula total_value desde order_products
update_conversation_on_message()  -- Actualiza preview, unread_count, timestamps
log_contact_changes()       -- JSONB diff → contact_activity (BEFORE trigger)
log_task_changes()          -- JSONB diff → task_activity (BEFORE trigger)
set_task_completed_at()     -- Auto-set timestamp cuando status → 'completed'
auto_tag_cliente_on_ganado()  -- Auto-tag "Cliente" cuando orden → "Ganado"
set_workspace_id()          -- Auto-set workspace_id en inserts
```

---

## RLS Pattern

Todas las tablas usan el mismo patron:

```sql
-- SELECT: Solo datos del workspace del usuario
CREATE POLICY "select" ON {table}
  FOR SELECT USING (is_workspace_member(workspace_id));

-- INSERT: Solo puede insertar en su workspace
CREATE POLICY "insert" ON {table}
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

-- UPDATE/DELETE: Similar con is_workspace_member o is_workspace_admin
```

Child tables (sin workspace_id directo) usan EXISTS subqueries:
```sql
CREATE POLICY "select" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
      AND is_workspace_member(c.workspace_id)
    )
  );
```

**IMPORTANTE:** El domain layer usa `createAdminClient()` que bypassa RLS. El workspace_id se filtra manualmente en cada query con `.eq('workspace_id', ctx.workspaceId)`.

---

## Migraciones (25 archivos)

```
20260127000000_uuid_compat.sql
20260128000001_workspaces_and_roles.sql
20260128000002_tool_executions.sql
20260128000003_api_keys.sql
20260129000001_contacts_and_tags.sql
20260129000002_custom_fields_notes_activity.sql
20260129000003_orders_foundation.sql
20260130000001_orders_shipping_address.sql
20260130000002_whatsapp_conversations.sql
20260131000001_storage_policies.sql
20260131000002_whatsapp_extended_foundation.sql
20260131000003_conversation_rls_update.sql
20260131000004_quick_replies_media.sql
20260203000001_crm_whatsapp_sync.sql
20260203000002_order_states.sql
20260203000003_fix_order_states_trigger.sql
20260203000004_tasks_foundation.sql
20260204000001_task_notes_history.sql
20260204000004_shopify_integration.sql
20260205000000_agent_sessions.sql
20260205000001_tool_logs_agent_session.sql
20260206000000_agent_templates.sql
20260209000000_agent_production.sql
20260213000000_automations.sql
20260214000000_builder_sessions.sql
20260216000000_sms_messages.sql
20260217000000_real_fields.sql
```

---

*Reescrito completamente el 19 Feb 2026 basado en migraciones reales. Reemplaza version pre-codigo del 23 Ene 2026.*
