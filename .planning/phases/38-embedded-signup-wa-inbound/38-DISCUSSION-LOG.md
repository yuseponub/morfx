# Phase 38: Embedded Signup + WhatsApp Inbound - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 38-embedded-signup-wa-inbound
**Areas discussed:** Estrategia de arranque/alcance, Aislamiento de 360dialog, Reuso del pipeline de agentes, Plan de prueba + modo Live

---

## Estrategia de arranque / alcance

| Option | Description | Selected |
|--------|-------------|----------|
| Mínimo primero, luego Embedded Signup | Webhook + conexión manual 1 número → validar; después Embedded Signup multi-tenant. Ambos en Fase 38. | ✓ |
| Solo el mínimo ahora | Solo webhook inbound; Embedded Signup a sub-fase 38.1 (replanear roadmap). | |
| Todo Embedded Signup de una | Construir flujo completo de autoservicio ya. | |

**User's choice:** Mínimo primero, luego Embedded Signup.
**Notes:** Usuario validó que el manual test suma valor (webhook compartido por ambos caminos = no desechable; solo el insert del token es desechable y trivial). De-risk de la firma HMAC con número controlado antes de exponer autoservicio.

| Option (credencial prueba) | Description | Selected |
|--------|-------------|----------|
| System User token permanente | No expira; para números del portafolio propio; cifrado en workspace_meta_accounts. | ✓ |
| Token temporal 24h primero | Smoke rápido con token del panel, luego migrar. | |

**User's choice:** Inicialmente confusión ("recuerda que es multitenant"). Tras aclaración (la tabla es multi-tenant 1-fila-por-workspace; System User token es solo el atajo para EL número de prueba; BISUAT vía Embedded Signup es el token multi-tenant de producción), usuario aceptó: System User token para la prueba.
**Notes:** Clarificación clave: el modelo multi-tenant NO se abandona. Diferencia entre deliverable 1 y 2 = solo CÓMO entra el token a la fila (insert manual vs popup).

---

## Aislamiento de 360dialog

| Option | Description | Selected |
|--------|-------------|----------|
| Flag `whatsapp_provider` per-workspace | default '360dialog', opt-in 'meta_direct' por SQL. Migración gradual. | ✓ (Claude decidió a pedido del usuario) |
| Por presencia de fila en workspace_meta_accounts | Routing implícito por fila activa. | |

**User's choice (texto libre):** "la idea es que cuando ya hagamos las pruebas meta api quede default (y cuando hagamos la migracion de los otros numeros que ya estan trabajando) ademas de que debemos hacer la conexion mas directa y rapido al api. decide tu"
**Notes:** Claude decidió flag per-workspace: default '360dialog' hoy → flip workspace por workspace en migración → default final 'meta_direct'. Descartado "por presencia de fila" porque flipearía routing al conectar (sin control para probar). Meta directo = más rápido (sin relay 360dialog).

| Option (workspace prueba) | Description | Selected |
|--------|-------------|----------|
| Workspace de prueba nuevo/aparte | Dedicado a pruebas, separado de Somnio. | ✓ |
| Tu propio workspace personal | Workspace no-productivo existente. | |

**User's choice:** Workspace de prueba nuevo/aparte.

---

## Reuso del pipeline de agentes

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar `processWebhook` (idéntico a 360dialog) | Verifica App Secret + resolveByPhoneNumberId + mismo processWebhook. Dedup por wamid gratis. | ✓ |
| Handler nuevo dedicado | Pipeline inbound separado para Meta. | |

**User's choice:** Reusar `processWebhook`.
**Notes:** Hallazgo: 360dialog ya reenvía el formato Cloud API de Meta, y `messages.wamid UNIQUE` ya hace dedup. Reuso = inbox/agentes/dedup idénticos, cero duplicación de lógica.

---

## Plan de prueba + modo Live

| Option (número) | Description | Selected |
|--------|-------------|----------|
| Tu otro WhatsApp disponible | Número real, conversación ida/vuelta realista. Requiere registrar al WABA + no estar en 360dialog. | ✓ |
| Número de prueba auto de Meta | Test number gratis, riesgo cero, limitado (5 destinatarios, hello_world). | |
| Primero el de Meta, luego el tuyo | Smoke con test number, luego número real. | |

**User's choice:** Tu otro WhatsApp disponible.

| Option (modo Live) | Description | Selected |
|--------|-------------|----------|
| Antes de la prueba inbound | Live es a nivel de app, no afecta 360dialog/ManyChat. Webhooks confiables. | ✓ |
| Probar en Development primero | Más conservador pero algunos webhooks no llegan en Dev mode. | |

**User's choice:** Antes de la prueba inbound.

---

## Claude's Discretion

- Mecanismo de almacenamiento del flag `whatsapp_provider`.
- Forma del insert manual del token de prueba (trivial).
- Manejo de errores del webhook (token revocado/expirado, payload malformado) + observabilidad del flujo Meta.

## Deferred Ideas

- Outbound/envío WhatsApp Meta directo (Fase 39) — con posible envío mínimo de validación evaluable en planning.
- FB Messenger (Fase 40), Instagram (Fase 41), templates CRUD/media CDN/read receipts (Fase 39).
- Bloques B/C/D Business Verification (manuales, Fase 37.5).
