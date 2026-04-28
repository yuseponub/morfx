# Snapshot Audit Production — somnio-sales-v3-pw-confirmation

**Fecha captura:** 2026-04-27 America/Bogota
**Workspace:** Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`)
**Source:** outputs verbatim de las 5 queries en `01-AUDIT.sql` (Supabase SQL Editor production).
**Proposito:** desbloquear Wave 1 con UUIDs reales hardcoded (Open Q7 resuelto via audit).

---

## Query (a) — Stage UUIDs (D-04, D-10, D-14, D-18)

| stage_uuid | stage_name | position | pipeline_name | pipeline_uuid |
|------------|-----------|----------|---------------|---------------|
| `42da9d61-6c00-4317-9fd9-2cec9113bd38` | NUEVO PAG WEB | 1 | Ventas Somnio Standard | `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` |
| `05c1f783-8d5a-492d-86c2-c660e8e23332` | FALTA INFO | 3 | Ventas Somnio Standard | `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` |
| `e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd` | FALTA CONFIRMAR | 4 | Ventas Somnio Standard | `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` |
| `4770a36e-5feb-4eec-a71c-75d54cb2797c` | CONFIRMADO | 5 | Ventas Somnio Standard | `a0ebcb1e-d79a-4588-a569-d2bcef23e6b8` |

**Decision:** [x] **GO** (4/4 stages encontrados)

**Stage UUIDs LOCKED para Plan 04 constants.ts:**

```typescript
export const PW_CONFIRMATION_STAGES = {
  PIPELINE_ID: 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8',
  NUEVO_PAG_WEB: '42da9d61-6c00-4317-9fd9-2cec9113bd38',
  FALTA_INFO: '05c1f783-8d5a-492d-86c2-c660e8e23332',
  FALTA_CONFIRMAR: 'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd',
  CONFIRMADO: '4770a36e-5feb-4eec-a71c-75d54cb2797c',
} as const
```

---

## Query (b) — Templates pre-activacion (D-09, D-26)

| id | name | language | category | status | components_preview | variable_mapping |
|----|------|----------|----------|--------|--------------------|------------------|
| `48a40af8-d75f-48ea-8558-fd9d32345506` | confirmar_compra | es | UTILITY | APPROVED | HEADER IMAGE (cdn shopify) + BODY "Deseas confirmar tu compra?" | `{}` (sin variables) |
| `b0150368-da78-437b-b615-f3fb8052993a` | direccion_entrega | es | UTILITY | APPROVED | BODY "Tu pedido se entregara en esta direccion: {{1}}, {{2}}, {{3}}. Por favor confirma que los datos son correctos." | `{1: order.shipping_address, 2: order.shipping_city, 3: order.department}` |
| `ca08e0d3-a0f6-4b07-b64f-295f1437fec8` | pedido_recibido_v2 | es | UTILITY | APPROVED | BODY "Hola {{1}} 🤗 Bienvenido a Somnio... Tu pedido de:\n\n{{2}}\n\nPor un valor total de: ${{3}} - Envío gratis 🚚\n\nFue recibido exitosamente ✅" | `{1: nombre, 2: items, 3: total}` |

**Decision:** [x] **GO** (3/3 templates existen + status=APPROVED + lenguage=`es`)

**Bodies completos (verbatim para D-26 contract documentation):**

- `pedido_recibido_v2` BODY:
  ```
  Hola {{1}} 🤗 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴 Tu pedido de:

  {{2}}

  Por un valor total de: ${{3}} - Envío gratis 🚚

  Fue recibido exitosamente ✅
  ```
  variables: `{{1}}=nombre`, `{{2}}=items formato`, `{{3}}=total formato`

- `direccion_entrega` BODY:
  ```
  Tu pedido se entregara en esta direccion: {{1}}, {{2}}, {{3}}. Por favor confirma que los datos son correctos.
  ```
  variables (mapping productivo): `{{1}}=order.shipping_address`, `{{2}}=order.shipping_city`, `{{3}}=order.department`

- `confirmar_compra` BODY:
  ```
  Deseas confirmar tu compra?
  ```
  HEADER IMAGE: `https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Diseno_sin_titulo_25.jpg?v=1774566355`
  variables: ninguna

---

## Query (c) — messages.template_name viability (D-26 sanity check, NO bloqueante)

| template_name | occurrences | last_seen |
|---------------|-------------|-----------|
| confirmar_compra | 740 | 2026-04-27 21:38:29.572+00 |
| direccion_entrega | 746 | 2026-04-27 21:38:16.424+00 |
| pedido_recibido_v2 | 244 | 2026-04-27 21:38:01.841+00 |

**Interpretacion:**
- Los 3 templates **SI** se populan en `messages.template_name` con high cardinality (740 / 746 / 244).
- `pedido_recibido_v2` tiene menos occurrences (244) probablemente porque es el template mas reciente (created 2026-04-04) — antes habia un v1 que ya no se envia.
- El `last_seen` de los 3 esta DENTRO del mismo minuto (21:38) — confirma que se envian en secuencia rapida en cada activacion (consistente con la automation `template final ultima` que tiene delays de 12s + 10s).
- Helper `getLastTemplateName(conversationId)` PUEDE usarse como sanity check secundario.
- Por D-26 el guard primario sigue siendo el estado de la maquina, NO `template_name`.

**Decision:** [x] Documentado (no bloquea — D-26 ya desacopla)

---

## Query (d) — Automations Somnio (D-10, RESEARCH §E.2)

**Query (d) original** (filtrada por nombres `CONFIRMADO`/`FALTA CONFIRMAR`): **0 rows**

**Query (d) ampliada** (filtrada por UUIDs reales de los 4 stages): **1 row**

### Automation `template final ultima` — dispara los 3 templates pre-activacion

```json
{
  "id": "71c4f524-2c8b-4350-a96d-bbc8a258b6ff",
  "name": "template final ultima",
  "is_enabled": true,
  "trigger_config": {
    "stageId": "42da9d61-6c00-4317-9fd9-2cec9113bd38",
    "pipelineId": "a0ebcb1e-d79a-4588-a569-d2bcef23e6b8"
  },
  "actions": [
    {
      "type": "send_whatsapp_template",
      "delay": null,
      "params": {
        "language": "es",
        "variables": {
          "1": "{{contacto.nombre}}",
          "2": "{{orden.productos_formato}}",
          "3": "{{orden.total_formato}}"
        },
        "templateName": "pedido_recibido_v2"
      }
    },
    {
      "type": "send_whatsapp_template",
      "delay": { "unit": "seconds", "amount": 12 },
      "params": {
        "language": "es",
        "variables": {
          "1": "{{orden.direccion_envio}}",
          "2": "{{orden.ciudad_envio}}",
          "3": "{{orden.departamento_envio}}"
        },
        "templateName": "direccion_entrega"
      }
    },
    {
      "type": "send_whatsapp_template",
      "delay": { "unit": "seconds", "amount": 10 },
      "params": { "language": "es", "templateName": "confirmar_compra" }
    },
    {
      "type": "send_sms",
      "delay": { "unit": "seconds", "amount": 10 },
      "params": {
        "to": "{{contacto.telefono}}",
        "body": "SOMNIO: Confirma tu orden via Whatsapp para que tu pedido sea despachado"
      }
    }
  ]
}
```

**Trigger shape (descubierto via query d.2):**
- Las 12 automations Somnio NO usan el campo `trigger_config.trigger` / `trigger_type` / `type` / `event` — todos null.
- Shape real: `trigger_config = { stageId, pipelineId }` directo. **Trigger es implicito = "order entra a este stage"**.

### Automations que reaccionan a CONFIRMADO: **0 rows** (verificado via UUID `4770a36e...` en query d.3 — ni en trigger_config ni en actions).

**Decision (post-aclaracion del usuario):** [x] **GO — NO blocker**

> User confirmed: "eso no es problema tuyo, te dije que ahi terminaba, de ahi en adelante yo me encargo. ahi revisamos cada orden y con un tag se crea una orden en pipeline de logistica."

**Implicancia para el agente PW V1:**
- El agente PW mueve el pedido a `CONFIRMADO` y **termina su responsabilidad ahi**.
- Post-CONFIRMADO es **proceso humano**: humano revisa el pedido en stage `CONFIRMADO` + aplica tag → otra automation/flow (fuera de scope de PW V1) crea la orden en pipeline de logistica.
- El agente NO debe asumir efectos colaterales automaticos al mover a CONFIRMADO mas alla del cambio de stage.
- Documentar esto como **D-28 (post-snapshot)** en CONTEXT.md o aqui — es importante para el LEARNINGS.md final.

### Implicancia D-26 (validacion empirica):
La automation `template final ultima` confirma que cuando un pedido entra a `NUEVO PAG WEB`:
- t=0: envia `pedido_recibido_v2`
- t=12s: envia `direccion_entrega`
- t=22s: envia `confirmar_compra` + SMS

→ **D-26 contract validado en codigo de produccion.** El agente PW recibe sesion en estado `awaiting_confirmation` con seguridad: los 3 templates ya se enviaron por `automations` antes de que el routing active el agente.

---

## Query (e) — agent_templates baseline

**Output:** "Success. No rows returned" → **0 rows**.

**Decision:** [x] **GO** (catalogo del nuevo agente esta vacio — Plan 02 puede insertar greenfield sin DELETE previo)

---

## Decision agregada

- [x] **Wave 0 PASA — desbloquear Wave 1.**

Resumen:
- 4/4 stages encontrados con UUIDs locked.
- 3/3 templates pre-activacion existen + APPROVED + bodies capturados.
- `messages.template_name` se popula (740/746/244 occurrences recientes).
- 1 automation valida D-26 empiricamente (`template final ultima` envia los 3 templates en secuencia).
- 0 automations a CONFIRMADO → confirmado como **NO blocker** por usuario (post-CONFIRMADO es proceso humano).
- 0 rows en `agent_templates` para `agent_id='somnio-sales-v3-pw-confirmation'` → catalogo greenfield para Plan 02.

---

## D-28 (post-snapshot, derivado del audit)

**Scope final del agente PW V1 sobre stage transitions:**
- El agente PUEDE mover pedidos entre `NUEVO PAG WEB` ↔ `FALTA INFO` ↔ `FALTA CONFIRMAR` ↔ `CONFIRMADO`.
- **Mover a `CONFIRMADO` es el estado terminal del agente.** Post-CONFIRMADO el agente NO interviene mas.
- Post-CONFIRMADO es proceso humano: humano revisa pedido + aplica tag → automation/flow externo crea orden de logistica (fuera de scope V1).
- El agente NO debe asumir que mover a CONFIRMADO dispara logistica/factura automatica — la responsabilidad de logistica esta delegada al humano + tag.

---

## Stage UUIDs locked para Wave 1+

Estos 5 UUIDs se usaran como constantes en `src/lib/agents/somnio-pw-confirmation/constants.ts` (Plan 04 Task 1):

```typescript
export const PW_CONFIRMATION_STAGES = {
  PIPELINE_ID: 'a0ebcb1e-d79a-4588-a569-d2bcef23e6b8',
  NUEVO_PAG_WEB: '42da9d61-6c00-4317-9fd9-2cec9113bd38',
  FALTA_INFO: '05c1f783-8d5a-492d-86c2-c660e8e23332',
  FALTA_CONFIRMAR: 'e0cf8ecf-1e8c-46bc-bc57-f5580bfb12bd',
  CONFIRMADO: '4770a36e-5feb-4eec-a71c-75d54cb2797c',
} as const
```
