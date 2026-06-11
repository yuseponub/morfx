# MorfX — Playbook de Integración de Clientes

> Doc base reutilizable para integrar nuevos clientes a MorfX (WhatsApp, FB/IG, SMS) y para migrar números/cuentas a **Meta Direct**.
> Última actualización: 2026-06-09 · Origen: cutover GoDentist FB/IG (shipped) + nota de planeación "Integración MorfX".

---

## 0. Modelo mental: "Meta Direct" vs BSP

MorfX puede operar cada canal de dos formas:

| Canal | BSP / legacy | **Meta Direct (objetivo)** | Provider field |
|-------|--------------|----------------------------|----------------|
| WhatsApp | 360dialog | Meta Cloud API (propio) | `workspaces.whatsapp_provider` = `360dialog` \| `meta_direct` |
| Messenger (FB) | ManyChat *(decommissioned 2026-06-09)* | Meta Messaging API (vía página FB) | `workspaces.messenger_provider` = `meta_direct` |
| Instagram | ManyChat *(decommissioned)* | Meta Messaging API (vía página FB) | `workspaces.instagram_provider` = `meta_direct` |
| SMS | — | Onurix | (ver §3) |

**Regla de oro de cutover (probada en GoDentist FB/IG):**
**Block A** (código gated, desplegar ANTES) → **checkpoint live verify** → **Block B** (borrado/migración, punto de no retorno). Nunca borrar/migrar algo productivo sin verificar en vivo primero. Regla 6 (no romper agentes en producción) manda.

---

## 1. WhatsApp — onboarding / migración a Meta Cloud API directo

### 1.1 Prerrequisitos del cliente (de la nota de planeación)
- **Acceso a la línea por SMS/llamada** → para recibir el **PIN de 6 dígitos** que registra el número en el WABA destino.
- **Correo corporativo + página web del cliente** → para la **verificación de negocio (Business Verification)** en Meta Business. Meta exige web + dominio de correo del negocio.
- **2FA del número** desactivable durante la migración (se reactiva después con un PIN propio).
- **Meta Business (BM) verificado** y WABA origen aprobado.

### 1.2 Capacidad de MorfX (código — ya existe)
- **Embedded Signup**: `src/lib/meta/embedded-signup.ts` → `exchangeCodeForBisuat`, `subscribeWaba`, `registerPhoneNumber(phoneNumberId, pin)`.
- **Sender directo**: `src/lib/channels/meta-whatsapp-sender.ts` → `sendText`, `sendMedia`, `sendTemplate`, `sendButtons` (Cloud API `/{phone_number_id}/messages`).
- **Switch de provider**: `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='<ws>'` (chokepoint `readWhatsappProvider` en `src/lib/domain/messages.ts`).
- **Templates** (HSM): `src/lib/domain/whatsapp-templates.ts` (crear/sincronizar contra Meta).

### 1.2-bis ¿Qué se puede hacer DESDE el popup (Embedded Signup)?
MorfX lanza el popup sin restricciones (`config_id` + `sessionInfoVersion:3`, sin `setup` pre-fijado en `connect-whatsapp.tsx`) → lo que el popup permite depende de la config del Embedded Signup en la app de Meta (por defecto permite crear todo). Por caso:

| Caso del cliente | ¿Todo desde el popup? | Notas |
|---|---|---|
| **Nuevo, número nuevo** (nunca en API) | ✅ **Sí, todo** | El popup crea/selecciona Business Portfolio + crea WABA + agrega número + verifica OTP. El cliente NO crea el WABA antes. |
| **Nuevo, número ya en app WhatsApp** (no API) | ✅ Sí | Primero hay que **sacar el número de la app de WhatsApp normal** (no puede estar en la app Y la API a la vez), luego el popup lo registra por OTP. |
| **Migra de otro BSP** (ej. 360dialog) | ✅ **Sí, desde el popup** (VERIFICADO Somnio 2026-06-11) | **NO existe "Migrate Number" en 360dialog para salir** — la migración se dispara desde el popup de MorfX (el destino). El popup **crea una WABA NUEVA limpia** y migra el número. Prereqs solo en 360dialog: pagar facturas + **desactivar 2FA**. Las **plantillas viajan solas** (Meta las copia). El `register` exige **método de pago en la WABA nueva** (agregar tarjeta → sí deja, está limpia). |

> Glosario — **HSM** (Highly Structured Message) = **plantilla de WhatsApp**. Es el mensaje pre-aprobado por Meta que se usa **fuera de la ventana de 24h** o para iniciar conversación. Las respuestas del bot DENTRO de 24h son **texto libre** (no HSM). Solo las HSM están atadas al WABA.

> ✅ **CONFIRMADO (Somnio 2026-06-11):** el `config_id` del Embedded Signup de MorfX SÍ crea una WABA nueva y migra un número existente de otro BSP. La WABA nueva sale limpia (sin línea de crédito del BSP) — por eso conviene dejar que el popup la cree, NO reusar el WABA viejo (si tenía línea de crédito del BSP, queda pegada e inamovible).

### 1.3 ⚠️ GATE de madurez (verificar ANTES de migrar un cliente productivo)
**Phase 39 (`39-whatsapp-outbound-templates`) está en `human_needed`**: código verificado 8/8, pero los **smokes en vivo nunca se completaron**. Antes de migrar cualquier número que venda, hay que cerrar este gate en el banco de pruebas:

- **Banco de pruebas:** "Pruebas Morfx", `phone_number_id = 1134593926408063` (ya está en `whatsapp_provider='meta_direct'`).
- **Smokes obligatorios (en vivo):**
  - WA-01: enviar texto libre dentro de ventana 24h → llega + wamid + ticks.
  - WA-02: enviar imagen/documento/audio/sticker → renderiza correcto.
  - WA-03: **enviar un TEMPLATE aprobado** (header image + variables) → llega. ← el más crítico (era el `131047`).
  - WA-06: recibir media inbound → URL durable en Supabase Storage (no CDN Meta que expira ~5min).
- **Si todos pasan** → MorfX WhatsApp directo está probado; se puede migrar clientes. **Si falla el template** → arreglar antes de tocar cualquier cliente.

### 1.4 ¿Qué se conserva al migrar 360dialog → directo? (REALIDAD verificada en vivo, caso Somnio 2026-06-11)
**Hallazgo clave:** cuando el WABA tiene una **línea de crédito de un BSP** (360dialog GmbH), esa línea **NO se puede desasociar self-serve** y **ni el soporte la quita** (regla de Meta: una línea de crédito pegada a un WABA no se cambia). Por eso **el WABA viejo se abandona** y el número migra a un **WABA NUEVO limpio** — que el popup de MorfX crea solo.

| Se conserva ✅ (verificado Somnio) | Ojo ⚠️ |
|---|---|
| Número + **display name** (APPROVED) | **Plantillas (HSM): SÍ viajaron solas** (22, APPROVED) — Meta las copió al WABA nuevo. Igual **respaldar** por si un BSP no las copia. |
| **Quality rating GREEN** (intacto) | `notifica_recoger` llegó `REJECTED` — revisar/recrear esa puntual. |
| Estado **Official Business Account** | **Historial de chats / catálogo** NO viajan (eso vive en MorfX igual). |
| **Messaging limits** | |

> ✅ **Realidad (Somnio):** las plantillas **SÍ se transfirieron** vía Embedded Signup (lo que dice la doc oficial de Meta). El miedo de "recrear 12" (precedente Callbell) **no se materializó**. Aun así, **respaldar siempre** (query abajo) — es barato y cubre el caso de un BSP que no las copie.
> ⛔ **NUNCA borrar el número** con el ícono de basura en WhatsApp Manager → eso lo *downgradea* y pierde display name + plantillas high-quality. Usar siempre el **Embedded Signup** (NO existe botón "Migrate" en 360dialog para salir).

**Lo que NO se toca (vive en MorfX, no en el WABA) — sobrevive intacto:**
- ✅ **Respuestas rápidas** (`quick_replies`) — tabla MorfX, no toca Meta.
- ✅ **Catálogo de respuestas del agente** (`agent_templates`, ej. Somnio v3/recompra) — interno MorfX, texto libre dentro de 24h, NO son HSM.
- ✅ Conversaciones, contactos, pedidos — todo en MorfX.

**Impacto real de perder las HSM temporalmente:** las HSM solo se usan para **mensajes proactivos / fuera de 24h** (notificaciones: despacho, reparto, carrito abandonado). Durante la re-aprobación, **el bot sigue respondiendo conversaciones inbound normal** (texto libre); solo se pausan las notificaciones proactivas → la ventana es **mucho menos dolorosa de lo que parece**.

> **Respaldo obligatorio antes de migrar:** exportar las HSM del workspace a JSON:
> ```sql
> SELECT json_agg(t ORDER BY t.name) FROM (
>   SELECT name, language, category, status, components, variable_mapping
>   FROM whatsapp_templates WHERE workspace_id='<ws>') t;
> ```

### 1.5 Runbook de migración de número (360dialog → Meta Direct) — FLUJO REAL VERIFICADO (Somnio 2026-06-11)

> ⚠️ **VERDAD DEL DOWNTIME (corrige la versión anterior "sin downtime"):** apenas metes el número al **Embedded Signup**, Meta empieza a reclamarlo y **360dialog deja de poder enviar** — aunque el `register` final tarde. En Somnio hubo **~3h de ventana** (número "entre proveedores") en la que entraban mensajes pero el bot no respondía, hasta hacer el flip. **La ventana de bajo tráfico debe empezar AL ABRIR EL POPUP, no en el register.** No existe una estrategia mágica "sin downtime" — minimízalo con preparación + ventana + ejecución rápida.

**FASE 0 — Preparación (CERO riesgo, el cliente sigue 100% en 360dialog):**
1. **GATE §1.3** — confirmar outbound directo (texto + imagen + template) en banco de pruebas. (Somnio ya validó texto `delivered` + plantillas `read` en vivo, 2026-06-11.)
2. **Respaldar las HSM** del workspace a JSON (query en §1.4) — por si un BSP no las copia.
3. **Pagar facturas pendientes** en el Hub del BSP (sin esto Meta bloquea la migración).
4. **Tener a la mano** la tarjeta/método de pago del cliente (se necesita en el paso 7).
5. **Elegir ventana de bajo tráfico** y avisar al cliente que habrá un lapso de minutos sin respuestas automáticas.

**FASE 1 — Cutover (DENTRO de la ventana — el reloj del downtime arranca aquí):**
6. **Desactivar 2FA** del número: WhatsApp Manager → el número → *Verificación en dos pasos → Desactivar* (se confirma por **email**, no por SMS → no hay rate-limit). WABA propio = el dueño lo hace, sin ticket al BSP.
7. **Embedded Signup en MorfX** (workspace del cliente, como Owner) → `/configuracion/integraciones → Conectar WhatsApp` → meter el número. El popup **crea una WABA NUEVA limpia** y migra el número (NO seleccionar el WABA viejo si tiene línea de crédito del BSP). Las **plantillas viajan solas**.
8. El `register` falla con **falta de método de pago** → MorfX muestra "falta método de pago" (fix `error_data.details` aplicado 2026-06-11). **Agregar tarjeta a la WABA NUEVA** (Business Settings → esa WABA → Configuración de pagos → sí deja, está limpia) → reintentar Conectar → `CONNECTED`.
9. **Verificar el número** en `workspace_meta_accounts` (`registration_status='connected'`) y en WhatsApp Manager (`status: CONNECTED`, `platform_type: CLOUD_API`, `quality_rating` conservado).
10. **Flip provider** (Regla 5 — operador): `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='<ws>';` (NO tocar messenger/instagram). **Esto cierra la ventana de downtime** — el outbound vuelve por Meta.
11. **Verificar live:** mandar un WhatsApp al número → el agente responde por Meta (en DB: outbound `delivered`, `processed_by_agent=true`).

**FASE 2 — Cierre (sin prisa, ya operativo):**
12. **Atender el backlog** — los inbounds que llegaron durante la ventana quedan `processed_by_agent=false`; se atienden cuando el cliente reescriba, o revisión manual en el inbox.
13. **Cancelar la suscripción del BSP** + pedir **reembolso** de fondos no usados.
14. **Limpiar** WABAs duplicadas creadas en intentos previos (quitarles el número) + revisar plantillas que llegaron `REJECTED`.

> **Rollback:** una vez el número está `CONNECTED` en Meta, **ya salió del BSP** — no hay rollback rápido (re-migrar al BSP es lento). Por eso FASE 1 va en ventana y con la tarjeta lista, para no quedar en limbo. El único "rollback" real antes del paso 7 es: no abrir el popup.
> **Causa-raíz del downtime (para el record):** no es el `register` el que corta 360dialog — es el **inicio del Embedded Signup** (Meta marca el número como en-migración). Por eso FASE 1 debe ser rápida y seguida.

### 1.6 Migración de conversaciones ("desde WPP por QR" — de la nota)
MorfX tiene un toolkit para respaldar e importar el historial de WhatsApp antes/después de migrar:
- **`whatsapp-history-reader`** (standalone): robot LOCAL Playwright que lee el **WhatsApp Web real por login QR** y exporta el historial a JSON (read-only, no Baileys).
- **`whatsapp-history-importer`** (standalone): importa ese backup al inbox de MorfX (archival, sin enviar, sin triggers — Regla 6). `wamid` prefijo `import:` = marcador + idempotencia.
- Doc: `docs/whatsapp-history-toolkit.md`.

---

## 2. Facebook Messenger + Instagram — onboarding a Meta Direct

*(Patrón probado en GoDentist FB/IG, shipped 2026-06-09. ManyChat fue decommissioned.)*

### 2.1 Pasos
1. **Connect Facebook** (Configuración → Integraciones, logueado en el ws del cliente, como admin de la página FB) → crea fila `workspace_meta_accounts channel='facebook'` + suscribe webhook.
2. **Connect Instagram** (mismo panel) → fila `channel='instagram'` (comparte `page_id`; FB+IG en la misma página).
3. **Flip providers:** `UPDATE workspaces SET messenger_provider='meta_direct', instagram_provider='meta_direct' WHERE id='<ws>';`
4. **Routing rule por canal** (si quieres agente): regla `channel in [facebook,instagram] → agent_id='<agente>'` + `lifecycle_routing_enabled=true`. Sin agente → el inbound queda human-only (inbox).
5. **Verificar live:** DM de prueba FB + IG → llega al inbox (y responde el agente si aplica).

### 2.2 Caveats Meta FB/IG (importante decirle al cliente)
- **Sin templates HSM en FB/IG** → solo **ventana de 24h** + tag `HUMAN_AGENT`. No hay mensajes proactivos fuera de 24h como en WhatsApp.
- **⚠️ Instagram: el inbox NATIVO de la app de IG deja de cargar (spinner).** Es esperado con el modelo Page-linked: los DMs se "entregan" a la integración → se gestionan **desde MorfX** (o desde la app **Meta Business Suite**), no desde la app de Instagram. NO apagar el toggle *"Permitir acceso a los mensajes"* (Connected Tools) o MorfX deja de recibir DMs.
- **Verify token Meta** (prod): `META_WEBHOOK_VERIFY_TOKEN`. **Webhook URL:** `https://www.morfx.app/api/webhooks/meta` (www, no apex).
- **Doble-respuesta en solape:** si el cliente venía de otro tool (ej. ManyChat), desconectarlo INMEDIATO tras verificar Meta para evitar doble-proceso del mismo DM.

### 2.3 Anti-asunción (lección del cutover)
Diagnóstico de doble-respuesta vía `wamid`: prefijo `m_…` = Meta Direct, `mc-…` = ManyChat. Consulta:
```sql
SELECT m.direction, m.wamid, m.timestamp, c.channel, m.content->>'body' AS body
FROM messages m JOIN conversations c ON c.id=m.conversation_id
WHERE m.workspace_id='<ws>' AND m.timestamp > now() - interval '10 minutes'
ORDER BY m.timestamp ASC;
```

---

## 3. SMS (Onurix)
- Provider Onurix (migrado desde Twilio 2026-04-16).
- **Regulación Colombia:** transaccional 24/7; marketing solo en ventana horaria. Guard bypasea transaccionales vía `isTransactionalSource(params.source)`.

---

## 4. Base de datos / Workspace (de la nota: "BASE DE DATOS")
Checklist mínimo al crear un workspace cliente:
- [ ] Workspace creado + `whatsapp_provider`/`messenger_provider`/`instagram_provider` correctos.
- [ ] Agentes registrados (catálogo de templates propio bajo su `agent_id` — NO compartir catálogo entre agentes, Regla 6).
- [ ] Routing rules (por canal / lifecycle) + `lifecycle_routing_enabled`.
- [ ] Tags / pipelines / stages base creados (los agentes NO crean recursos base — agent-scope).
- [ ] Templates WhatsApp creados/sincronizados (si aplica HSM).

---

## 5. Checklist maestro de onboarding (por cliente)
- [ ] **Meta Business** del cliente verificado (web + correo corporativo).
- [ ] **WhatsApp:** decidir 360dialog vs directo → si directo, cerrar GATE §1.3 + runbook §1.5.
- [ ] Confirmar **BM ownership** del WABA (templates sí/no).
- [ ] **FB/IG:** connect + providers + routing (§2). Avisar caveat inbox IG nativo.
- [ ] **SMS** si aplica (§3).
- [ ] **Workspace/DB** (§4).
- [ ] **Historial** respaldado/importado si migra de otra herramienta (§1.6).
- [ ] **Verificación live** de cada canal antes de declarar onboarding completo.

---

### Referencias internas
- Cutover FB/IG: `.planning/standalone/godentist-fbig-meta-direct-cutover/` (RESEARCH + VERIFICATION).
- WhatsApp outbound directo: `.planning/phases/39-whatsapp-outbound-templates/` (⚠️ human_needed — cerrar smokes).
- Embedded Signup: `.planning/phases/38-*` + `src/lib/meta/embedded-signup.ts`.
- History toolkit: `docs/whatsapp-history-toolkit.md`.
