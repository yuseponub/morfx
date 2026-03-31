# Requirements: MorfX v5.0 Meta Direct Integration

**Estado:** APROBADO
**Fecha:** 2026-03-31
**Total:** 27 requirements en 7 categorias

## Milestone v5.0 Requirements

### Setup & Foundation

- [ ] **SETUP-01**: Meta App creada con productos WhatsApp, Messenger e Instagram habilitados y permisos aprobados por Meta
- [ ] **SETUP-02**: Tabla `workspace_meta_accounts` con tokens encriptados (AES-256-GCM), WABA ID, phone_number_id, page_id, ig_account_id por workspace
- [ ] **SETUP-03**: Cliente Graph API v22.0 con version pinned en constante global
- [ ] **SETUP-04**: Guia paso a paso para el usuario de que hacer en Meta (crear app, configurar productos, business verification, env vars) — entregada ANTES de empezar a codear

### Embedded Signup (Onboarding)

- [ ] **SIGNUP-01**: Boton "Conectar WhatsApp" en settings que abre popup de Meta Embedded Signup v4 — cliente autoriza y MorfX recibe tokens automaticamente
- [ ] **SIGNUP-02**: Token exchange (code -> BISUAT) y almacenamiento encriptado por workspace
- [ ] **SIGNUP-03**: Auto-suscripcion a webhooks despues de signup exitoso
- [ ] **SIGNUP-04**: Boton "Conectar Facebook Page" y "Conectar Instagram" via mismo Embedded Signup v4

### WhatsApp Cloud API

- [ ] **WA-01**: Enviar mensajes de texto via Cloud API directo (reemplaza 360dialog)
- [ ] **WA-02**: Enviar media (imagen, video, audio, documento, sticker) via Cloud API
- [ ] **WA-03**: Enviar templates via Cloud API
- [ ] **WA-04**: Enviar mensajes interactivos (botones, listas) via Cloud API
- [ ] **WA-05**: Recibir webhooks de WhatsApp (mensajes + status updates) via endpoint unificado
- [ ] **WA-06**: Download/upload de media via Meta CDN
- [ ] **WA-07**: Read receipts via Cloud API
- [ ] **WA-08**: CRUD de templates via Graph API (crear, listar, eliminar, sync status)
- [ ] **WA-09**: Template status webhooks (push en vez de polling)

### Webhook Infrastructure

- [ ] **HOOK-01**: Endpoint unificado `/api/webhooks/meta` que recibe eventos de WA, FB e IG y rutea al workspace correcto
- [ ] **HOOK-02**: Verificacion de firma HMAC-SHA256 con App Secret
- [ ] **HOOK-03**: Respuesta 200 en <5 segundos (inngest.send sin await + mensaje ya en DB como safety net)
- [ ] **HOOK-04**: Deduplicacion de mensajes por message_id (Meta retries hasta 7 veces)

### Facebook Messenger

- [ ] **FB-01**: Recibir mensajes de Messenger via webhook unificado
- [ ] **FB-02**: Enviar texto e imagenes via Graph API (reemplaza ManyChat)
- [ ] **FB-03**: Resolucion PSID -> contacto en MorfX
- [ ] **FB-04**: Inbox en MorfX para conversaciones de Messenger (humano + agente IA)

### Instagram DMs

- [ ] **IG-01**: Recibir DMs de Instagram via webhook unificado
- [ ] **IG-02**: Enviar texto e imagenes via Graph API (reemplaza ManyChat workaround)
- [ ] **IG-03**: Resolucion IG-scoped user ID -> contacto en MorfX
- [ ] **IG-04**: Inbox en MorfX para conversaciones de Instagram (humano + agente IA)
- [ ] **IG-05**: UX clara de "ventana expirada" (IG tiene hard 24h, sin templates)

### Migration & Coexistence

- [ ] **MIG-01**: Feature flag per-workspace `whatsapp_provider: 'meta_direct' | '360dialog'` para migracion gradual
- [ ] **MIG-02**: Feature flag per-workspace para FB/IG: `messenger_provider: 'meta_direct' | 'manychat'`
- [ ] **MIG-03**: Channel sender registry provider-aware (viejo y nuevo coexisten)

## Contexto Adicional

- **Prioridad de canales:** WhatsApp primero, luego Facebook Messenger, luego Instagram DMs (FB e IG casi al mismo nivel)
- **Migracion gradual:** 360dialog y ManyChat siguen activos hasta corte final. Per-workspace provider selection.
- **Cada cliente tiene su Meta Business Account** — no necesitan crear una nueva
- **MorfX sera intermediario de billing** (clientes recargan, MorfX paga a Meta) — wallet system en milestone posterior
- **Graph API v22.0** es la version actual (enforced desde Sep 2025)
- **Embedded Signup v4** (Dec 2025) soporta WA + FB + IG en un solo flujo
- **BISUAT tokens** no expiran pero pueden invalidarse — necesitan health check
- **Payloads de WA Cloud API son identicos a 360dialog** — la migracion es cambiar URL + auth header
- **Meta webhook debe responder 200 en <5s** — inngest.send sin await, mensaje en DB como fallback

## Future Requirements (deferred)

- Wallet/billing system completo (alta complejidad, subsistema independiente)
- Number migration tooling (solo despues de integracion directa estable)
- WhatsApp Flows / Catalog / Commerce API (baja adopcion LATAM)
- Voice/video calls (diferente dominio de producto)
- Meta Business AI integration (Somnio es la capa IA)
- Persistent menu Messenger / Ice breakers IG (nice-to-have post-launch)
- Private replies a comentarios IG (no core inbox)
- Eliminar codigo 360dialog/ManyChat (solo cuando TODOS los workspaces migren)
- Encryption de credenciales legacy (360dialog keys actualmente plaintext)

## Out of Scope

| Feature | Razon |
|---------|-------|
| Wallet/billing completo | Alta complejidad, subsistema independiente — v6.0 |
| Number migration automatizado | Solo despues de que integracion directa sea estable en produccion |
| WhatsApp Flows / Catalog / Commerce | Baja adopcion en LATAM, no relevante para e-commerce COD |
| Voice/video calls via WA API | Diferente dominio de producto |
| Meta Business AI | Somnio ES la capa de IA, no integrar la de Meta |
| Eliminar codigo 360dialog/ManyChat | Solo cuando TODOS los workspaces migren — no en este milestone |
| WhatsApp Groups API | No CRM value para atencion 1-to-1 |
| Multi-numero por workspace | Un numero = un workspace. Multiples numeros = multiples workspaces |

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SETUP-01 | — | Pending |
| SETUP-02 | — | Pending |
| SETUP-03 | — | Pending |
| SETUP-04 | — | Pending |
| SIGNUP-01 | — | Pending |
| SIGNUP-02 | — | Pending |
| SIGNUP-03 | — | Pending |
| SIGNUP-04 | — | Pending |
| WA-01 | — | Pending |
| WA-02 | — | Pending |
| WA-03 | — | Pending |
| WA-04 | — | Pending |
| WA-05 | — | Pending |
| WA-06 | — | Pending |
| WA-07 | — | Pending |
| WA-08 | — | Pending |
| WA-09 | — | Pending |
| HOOK-01 | — | Pending |
| HOOK-02 | — | Pending |
| HOOK-03 | — | Pending |
| HOOK-04 | — | Pending |
| FB-01 | — | Pending |
| FB-02 | — | Pending |
| FB-03 | — | Pending |
| FB-04 | — | Pending |
| IG-01 | — | Pending |
| IG-02 | — | Pending |
| IG-03 | — | Pending |
| IG-04 | — | Pending |
| IG-05 | — | Pending |
| MIG-01 | — | Pending |
| MIG-02 | — | Pending |
| MIG-03 | — | Pending |

**Coverage:**
- v5.0 requirements: 33 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 33

---
*Requirements defined: 2026-03-31*
