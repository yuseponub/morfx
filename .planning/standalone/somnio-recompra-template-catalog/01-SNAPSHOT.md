# Snapshot Pre-Migracion — somnio-recompra-template-catalog

**Fecha captura:** 2026-04-22 (America/Bogota)
**Proposito:** Rollback D-09 Opcion A (sin feature flag) + evidencia auditoria D-11.
**Phase:** somnio-recompra-template-catalog (standalone)
**SQL ejecutado:** `.planning/standalone/somnio-recompra-template-catalog/01-audit.sql`

## Auditoria D-11 — Resultado (FALLA — scope re-planeado)

Query: ver `01-audit.sql` Paso 1 (CTE con 22 intents esperados).

| intent | rows_found | status |
|--------|-----------|--------|
| contraindicaciones | 0 | ❌ GAP — cliente pregunta por contraindicaciones -> respuesta vacia |
| tiempo_entrega_1_3_days | 0 | ❌ GAP — ciudades zona 1-3 dias -> respuesta vacia |
| tiempo_entrega_2_4_days | 0 | ❌ GAP — DEFAULT zone para cualquier ciudad desconocida -> respuesta vacia |
| dependencia | 1 | ✅ |
| no_interesa | 1 | ✅ |
| pago | 1 | ✅ |
| pendiente_confirmacion | 1 | ✅ |
| pendiente_promo | 1 | ✅ |
| rechazar | 1 | ✅ |
| retoma_inicial | 1 | ✅ |
| tiempo_entrega_next_day | 1 | ✅ |
| tiempo_entrega_same_day | 1 | ✅ |
| tiempo_entrega_sin_ciudad | 1 | ✅ |
| ubicacion | 1 | ✅ |
| confirmacion_orden_same_day | 2 | ✅ (CORE + COMP) |
| confirmacion_orden_transportadora | 2 | ✅ |
| envio | 2 | ✅ |
| promociones | 2 | ✅ |
| resumen_1x | 2 | ✅ |
| resumen_2x | 2 | ✅ |
| resumen_3x | 2 | ✅ |
| saludo | 2 | ✅ |

**Resultado agregado:**
- Total intents esperados: 22
- Intents con `rows_found = 0` (BLOCKER): **3** (contraindicaciones, tiempo_entrega_1_3_days, tiempo_entrega_2_4_days)
- Intents con `rows_found >= 1` (OK): 19

## Hallazgos adicionales (no estaban en el plan)

### Templates que YA existen en prod (D-03/D-06/D-12 parcialmente obsoletos)

- `saludo` orden=0 (texto CORE): `{{nombre_saludo}} 😊` — coincide con D-03 tal cual.
- `saludo` orden=1 (imagen COMPLEMENTARIA): URL ELIXIR correcta, caption `Deseas adquirir tu ELIXIR DEL SUENO?` (sin `ñ` — encoding en prod, pero WhatsApp lo renderiza igual).
- `preguntar_direccion_recompra` orden=0 (texto CORE): `{{nombre_saludo}} 😊\n\nClaro que si! Seria para la misma direccion?\n\n📍 {{direccion_completa}}` — ya existe con copy MEJOR que D-12 (incluye saludo + pin 📍). Respeta contrato `{{direccion_completa}}` que Plan 02 ajustara para incluir departamento.
- `registro_sanitario` orden=0 (texto CORE): `Nuestro producto es importado, cuenta con Registro Sanitario FDA. Desarrollado por el Laboratorio BDE NUTRITION LLC.` — YA existe. Lo que falta es el fix en `INFORMATIONAL_INTENTS` Set (Plan 02) para que Haiku pueda enrutar el intent.

### Templates huerfanos (no consumidos por codigo)

- `tiempo_entrega_remote` — codigo usa `1_3_days`, no `remote`. Sin uso.
- `tiempo_entrega_standard` — codigo usa `2_4_days`, no `standard`. Sin uso.
- `efectos` (2 rows) — no esta en RECOMPRA_INTENTS. Sin uso activo via intent-classifier.
- `fallback` (1 row) — no esta en RECOMPRA_INTENTS pero podria usarse como safety net.

**Decision:** NO tocar huerfanos en esta fase (fuera de scope).

## Snapshot JSON — Estado Pre-Migracion

Query: ver `01-audit.sql` Paso 2.

```json
[
    {"id": "48b7ca14-8a8d-467a-82e4-61b46b73bf03", "orden": 0, "intent": "confirmacion_orden_same_day", "content": "Perfecto! Despacharemos tu pedido lo antes posible✅ Tu pedido llegara {{tiempo_estimado}}", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "886243ef-b0aa-458c-81c7-c5dc8851e413", "orden": 1, "intent": "confirmacion_orden_same_day", "content": "Recuerda tener el efectivo listo para que puedas recibir tu compra✅💴", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "d5112d01-1eaa-4f64-9ae5-8ad91c03c187", "orden": 0, "intent": "confirmacion_orden_transportadora", "content": "Perfecto! Despacharemos tu pedido lo antes posible✅ Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "9217de44-72f4-4d93-8895-534147d762ec", "orden": 1, "intent": "confirmacion_orden_transportadora", "content": "Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba✅💴", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "a8dff8d0-3ffd-4278-a504-e45f6a83f42e", "orden": 0, "intent": "dependencia", "content": "No genera dependencia. La melatonina es una hormona que tu cuerpo produce de forma natural. El suplemento solo ayuda a regularla.", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "39cc661d-e505-43b2-8430-ff112a44a51a", "orden": 0, "intent": "efectos", "content": "La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados.", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "75aec44d-d1ea-423c-8d5b-060daf7d7c30", "orden": 1, "intent": "efectos", "content": "Si tomas anticoagulantes, consulta con tu medico antes de usarlo.", "delay_s": 4, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "0bc99fec-5899-4839-bcd3-f33934c16993", "orden": 0, "intent": "envio", "content": "Hacemos envios a toda Colombia 🚚 (gratis).", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "d07ffa44-1f1b-4ccf-99ef-f2350db06a09", "orden": 1, "intent": "envio", "content": "Usamos Coordinadora, Envia, Interrapidisimo o domiciliarios propios segun tu ciudad.", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "bedf13c2-5e33-406c-961c-dc604dca4274", "orden": 0, "intent": "fallback", "content": "Regalame 1 minuto por favor", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "15d5240b-8f98-465e-80b5-625f57ac5913", "orden": 0, "intent": "no_interesa", "content": "Claro que si 🤍 Esperamos tu mensaje para brindarte la mejor solucion a tus noches de insomnio😴", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "2042c533-770e-417b-954a-90c4718bb388", "orden": 0, "intent": "pago", "content": "Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas en efectivo💴🏡", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "3e749dbd-563a-4eb2-b60e-ef8792e1e7a1", "orden": 0, "intent": "pendiente_confirmacion", "content": "Quedamos pendientes a la confirmacion de tu compra para poder despachar tu orden🤗", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "79b1ef39-66ac-45a0-9f07-cf3b0373f955", "orden": 0, "intent": "pendiente_promo", "content": "Quedamos pendientes a la promocion que desees para poder despachar tu orden🤗", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "7136f473-6892-4f03-9d40-e01560a9b01a", "orden": 0, "intent": "preguntar_direccion_recompra", "content": "{{nombre_saludo}} 😊\n\nClaro que si! Seria para la misma direccion?\n\n📍 {{direccion_completa}}", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "72e6bf68-ef36-419f-8c4b-e769e3d4ffa7", "orden": 0, "intent": "promociones", "content": "Estas son las promociones que manejamos, ¿Cuál deseas adquirir? 😊", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "c4f61cce-5cfc-4924-8012-5a25f4620fc8", "orden": 1, "intent": "promociones", "content": "https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Texto_del_parrafo_32.jpg?v=1775949828", "delay_s": 1, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "minifrase": "imagen promos precios bundles", "visit_type": "primera_vez", "content_type": "imagen", "workspace_id": null},
    {"id": "5c36ba67-505b-4da3-a307-445078cb0a99", "orden": 0, "intent": "rechazar", "content": "Entiendo. Deseas que te comparta nuevamente las **promociones** o prefieres que **te contacte un asesor humano** para resolver tus dudas? 🙌", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "6f22bb93-e21d-4265-a3de-600fb7b77a0d", "orden": 0, "intent": "registro_sanitario", "content": "Nuestro producto es importado, cuenta con Registro Sanitario FDA. Desarrollado por el Laboratorio BDE NUTRITION LLC.", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "cfd39426-08aa-4d43-aafe-5257ebbc6f93", "orden": 0, "intent": "resumen_1x", "content": "Pedido recibido✅ 1X ELIXIR DEL SUEÑO por un valor de $79,900 envío gratis.", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "beda61b1-69f5-43bf-8289-5ad311221245", "orden": 1, "intent": "resumen_1x", "content": "Deseas confirmar tu compra?", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "a9027317-2171-457b-bd57-a3ed74707a77", "orden": 0, "intent": "resumen_2x", "content": "Pedido recibido✅ 2X ELIXIR DEL SUEÑO por un valor de $129,900 envío gratis.", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "b1ccff4b-c377-465f-806f-9aebbb8e7f0c", "orden": 1, "intent": "resumen_2x", "content": "Deseas confirmar tu compra?", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "a8006000-5680-4800-80f9-042090c4f035", "orden": 0, "intent": "resumen_3x", "content": "Pedido recibido✅ 3X ELIXIR DEL SUEÑO por un valor de $169,900 envío gratis.", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "52273ea9-ad8a-47f1-8172-cf7c2ab42436", "orden": 1, "intent": "resumen_3x", "content": "Deseas confirmar tu compra?", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "3fc4f5f1-53ee-4fc3-9e13-47b1ff5385e5", "orden": 0, "intent": "retoma_inicial", "content": "Deseas adquirir el tuyo?", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "5ea83dc7-fbcf-42ac-ae57-43e77cdd4f33", "orden": 0, "intent": "saludo", "content": "{{nombre_saludo}} 😊", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "8c766258-b3af-4bd0-8191-d323eb15eb90", "orden": 1, "intent": "saludo", "content": "https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/quick-replies/a3843b3f-c337-4836-92b5-89c58bb98490/1769960336980_Dise_o_sin_t_tulo__17_.jpg|Deseas adquirir tu ELIXIR DEL SUENO?", "delay_s": 3, "agent_id": "somnio-recompra-v1", "priority": "COMPLEMENTARIA", "visit_type": "primera_vez", "content_type": "imagen", "workspace_id": null},
    {"id": "04b27e8b-b07f-489a-96ae-0f25368a3bc0", "orden": 0, "intent": "tiempo_entrega_next_day", "content": "Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "f9c95e27-d466-4bb4-8218-731700d2a18f", "orden": 0, "intent": "tiempo_entrega_remote", "content": "Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "20bdb95a-e6bc-43bd-b51f-04275e861e24", "orden": 0, "intent": "tiempo_entrega_same_day", "content": "Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "976a3ba5-4302-4cd5-bbac-966ecd6d4010", "orden": 0, "intent": "tiempo_entrega_sin_ciudad", "content": "En que municipio te encuentras? Asi te puedo dar un estimado del tiempo de entrega 📦", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "5629629f-8f77-4580-9667-4f76acf77172", "orden": 0, "intent": "tiempo_entrega_standard", "content": "Para {{ciudad}} el tiempo de entrega es {{tiempo_estimado}} 🚚", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null},
    {"id": "37534e10-acc4-4d08-a859-0478f9961c95", "orden": 0, "intent": "ubicacion", "content": "Tenemos centros de distribucion en las principales ciudades del pais, sin embargo nuestro punto principal esta ubicado en la ciudad de Bucaramanga, Santander. (Manejamos envios contraentrega a nivel nacional)", "delay_s": 0, "agent_id": "somnio-recompra-v1", "priority": "CORE", "visit_type": "primera_vez", "content_type": "texto", "workspace_id": null}
]
```

## Decision

- [x] ⚠ Auditoria D-11 FALLA (3 gaps) **PERO** el scope se redefine en lugar de pausar — los 3 templates originalmente planeados (saludo/preguntar_direccion_recompra/registro_sanitario) ya existen en prod con copy equivalente o mejor; los 3 gaps reales son los que la fase agregara.
- [ ] ❌ Pausar fase — NO elegido.

**Nuevo scope Plan 01 Task 2** (pendiente aprobacion usuario):

Migracion SQL incluira SOLO 3 INSERTS via DO $$ IF NOT EXISTS (idempotente):
1. `contraindicaciones` orden=0 texto CORE — gap real en INFORMATIONAL_INTENTS
2. `tiempo_entrega_1_3_days` orden=0 texto CORE — gap real zona 1-3 dias
3. `tiempo_entrega_2_4_days` orden=0 texto CORE — gap real zona DEFAULT

DROP del plan original:
- NO DELETE+INSERT saludo (ya existe con copy identico)
- NO INSERT preguntar_direccion_recompra (ya existe con copy mejor, honra contrato `{{direccion_completa}}` que Plan 02 ajusta)
- NO INSERT registro_sanitario como template (ya existe); el fix D-06 es solo codigo (Plan 02 lo agrega al Set `INFORMATIONAL_INTENTS`)
