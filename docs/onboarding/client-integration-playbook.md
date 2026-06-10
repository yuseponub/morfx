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

### 1.3 ⚠️ GATE de madurez (verificar ANTES de migrar un cliente productivo)
**Phase 39 (`39-whatsapp-outbound-templates`) está en `human_needed`**: código verificado 8/8, pero los **smokes en vivo nunca se completaron**. Antes de migrar cualquier número que venda, hay que cerrar este gate en el banco de pruebas:

- **Banco de pruebas:** "Pruebas Morfx", `phone_number_id = 1134593926408063` (ya está en `whatsapp_provider='meta_direct'`).
- **Smokes obligatorios (en vivo):**
  - WA-01: enviar texto libre dentro de ventana 24h → llega + wamid + ticks.
  - WA-02: enviar imagen/documento/audio/sticker → renderiza correcto.
  - WA-03: **enviar un TEMPLATE aprobado** (header image + variables) → llega. ← el más crítico (era el `131047`).
  - WA-06: recibir media inbound → URL durable en Supabase Storage (no CDN Meta que expira ~5min).
- **Si todos pasan** → MorfX WhatsApp directo está probado; se puede migrar clientes. **Si falla el template** → arreglar antes de tocar cualquier cliente.

### 1.4 ¿Qué se conserva al migrar 360dialog → directo?
Fuente: docs 360dialog / Meta (migración de número entre WABAs).

| Se conserva ✅ | NO migra ❌ |
|---|---|
| Número + **display name** | **Historial de chats/mensajes** |
| **Quality rating** + messaging limits | **Catálogo** de productos |
| Estado **Official Business Account** | Templates **rejected / pending / low-quality** |
| **Templates aprobados high-quality** (se copian, sin re-revisión) | |

> **Condición crítica:** la migración limpia **con templates** requiere que el **Business Manager (BM) de origen y destino sea el MISMO**. Verificar SIEMPRE en Meta Business Settings → WhatsApp Accounts quién es dueño del WABA:
> - WABA bajo **BM propio del cliente** (360dialog solo como BSP) → migración limpia, templates se conservan. 🟢
> - WABA bajo **BM de 360dialog** → cross-business, probablemente **recrear + re-aprobar templates**. 🟡

### 1.5 Runbook de migración de número (360dialog → Meta Direct)
1. **Verificar BM ownership** del WABA (decide si templates sobreviven).
2. **Pre-flight:** BM verificado, web + correo corporativo OK, número puede recibir PIN, 2FA listo para desactivar.
3. **Ventana de mantenimiento** (hay caída breve entre deregister y register — coordinar; el número no recibe mensajes ese rato).
4. **Deregister / iniciar migración** en el dashboard de 360dialog (libera el número).
5. **Embedded Signup en MorfX** → conectar el número al WABA propio → `registerPhoneNumber(phone_number_id, PIN)`.
6. **Flip provider** (Regla 5 — operador en prod):
   `UPDATE workspaces SET whatsapp_provider='meta_direct' WHERE id='<ws>';` (NO tocar messenger/instagram).
7. **Verificar live:** inbound real llega al inbox + outbound texto + **template** salen por directo (no `131047`).
8. **Templates:** confirmar que los aprobados aparecen en el WABA destino; recrear los que falten.
9. **Rollback** (antes de verificar): re-migrar a 360dialog + re-flip `whatsapp_provider='360dialog'`.

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
