# Auditoría de Servicios, APIs y Suscripciones — MorfX

**Fecha:** 2026-02-23
**Estado:** Borrador — pendiente costos reales del usuario

---

## SERVICIOS EN PRODUCCIÓN (en el código)

### 1. Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Categoría:** Database / Auth / Storage
- **Qué hace en morfx:** Base de datos principal (PostgreSQL), autenticación de usuarios, RLS multi-tenant, suscripciones real-time para chat, almacenamiento de archivos/imágenes
- **Paquete NPM:** `@supabase/supabase-js` ^2.93.1, `@supabase/ssr` ^0.8.0
- **Variables de entorno:**
  - `NEXT_PUBLIC_SUPABASE_URL` (público)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (público)
  - `SUPABASE_SERVICE_ROLE_KEY` (secreto)
- **Archivos clave:** `src/lib/supabase/` (client, server, admin, middleware), todo `src/lib/domain/`
- **¿Tiene costo?:** Sí — Free tier disponible, Pro $25/mes
- **Plan actual:** `___________`
- **Costo mensual real:** `$___________`
- **Dashboard:** https://supabase.com/dashboard
- **Crítico para producción:** SÍ — sin esto no funciona nada

---

### 2. Anthropic (Claude API)
- **Categoría:** AI / LLM
- **Qué hace en morfx:** Agente conversacional Somnio (orquestación + intent detection), AI Builder de automatizaciones, clasificación de mensajes, extracción de datos
- **Paquetes NPM:** `@anthropic-ai/sdk` ^0.73.0, `@ai-sdk/anthropic` ^3.0.43, `ai` ^6.0.86, `@ai-sdk/react` ^3.0.88
- **Modelos usados:**
  - `claude-sonnet-4` — Orquestación principal, builder
  - `claude-haiku-4-5` — Clasificación de mensajes (intent detection)
- **Variables de entorno:**
  - `ANTHROPIC_API_KEY` (secreto)
- **Archivos clave:** `src/lib/agents/claude-client.ts`, `src/lib/agents/somnio/`, `src/app/api/builder/chat/`
- **¿Tiene costo?:** Sí — pay-per-token
- **Plan actual:** `___________`
- **Costo mensual estimado:** `$___________`
- **Dashboard:** https://console.anthropic.com
- **Crítico para producción:** SÍ — agente conversacional y builder dependen de esto

---

### 3. 360dialog (WhatsApp Business API)
- **Categoría:** Messaging / WhatsApp
- **Qué hace en morfx:** Envío/recepción de mensajes WhatsApp, gestión de templates (MARKETING, UTILITY, AUTHENTICATION), media (imágenes, videos, docs, audio, stickers), webhooks de status de entrega
- **Paquete NPM:** Ninguno — API REST directa (`https://waba-v2.360dialog.io`)
- **Variables de entorno:**
  - `WHATSAPP_API_KEY` (secreto)
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (secreto)
  - `WHATSAPP_WEBHOOK_SECRET` (secreto — HMAC producción)
  - `WHATSAPP_PHONE_NUMBER_ID` (secreto)
  - `WHATSAPP_DEFAULT_WORKSPACE_ID` (secreto)
- **Archivos clave:** `src/lib/whatsapp/api.ts`, `src/lib/whatsapp/templates-api.ts`, `src/app/api/webhooks/whatsapp/route.ts`
- **Webhook:** `POST /api/webhooks/whatsapp` (con GET verification)
- **¿Tiene costo?:** Sí — fee 360dialog + costo de mensajes Meta
- **Plan actual:** `___________`
- **Costo mensual real:** `$___________` (fee 360dialog) + `$___________` (mensajes Meta)
- **Dashboard:** https://hub.360dialog.com
- **Crítico para producción:** SÍ — canal principal de comunicación

---

### 4. Twilio (SMS)
- **Categoría:** Messaging / SMS
- **Qué hace en morfx:** Envío de SMS como acción de automatización, tracking de delivery status via webhook
- **Paquete NPM:** `twilio` ^5.12.1
- **Variables de entorno:** Ninguna global — credenciales por workspace en tabla `integrations` (account_sid, auth_token, phone_number)
- **Archivos clave:** `src/lib/twilio/client.ts`, `src/app/api/webhooks/twilio/status/route.ts`
- **Webhook:** `POST /api/webhooks/twilio/status`
- **DB:** Tabla `sms_messages` (tracking con twilio_sid, cost, segments)
- **¿Tiene costo?:** Sí — pay-per-message
- **Plan actual:** `___________`
- **Costo mensual real:** `$___________`
- **Dashboard:** https://console.twilio.com
- **Crítico para producción:** No — es opcional (acción de automatización)

---

### 5. Shopify (E-commerce Integration)
- **Categoría:** E-commerce / Pedidos
- **Qué hace en morfx:** Sync de pedidos (orders/create, orders/updated), draft orders, matching fuzzy de contactos, fulfillment tracking, deduplicación por shopify_order_id
- **Paquete NPM:** `@shopify/shopify-api` ^12.3.0
- **API:** `https://{shop_domain}/admin/api/2024-01`
- **Variables de entorno:**
  - `SHOPIFY_API_SECRET` (secreto — HMAC webhook verification)
- **Credenciales por workspace:** En tabla `integrations` (shop_domain, access_token, api_secret)
- **Archivos clave:** `src/lib/shopify/`, `src/app/api/webhooks/shopify/route.ts`
- **Webhooks:** orders/create, orders/updated, draft_orders/create
- **¿Tiene costo?:** No para morfx — el costo del plan Shopify lo paga el cliente
- **Dashboard:** https://admin.shopify.com (del cliente)
- **Crítico para producción:** No — es integración opcional por workspace

---

### 6. Inngest (Workflow Orchestration)
- **Categoría:** Async / Job Queue / Cron
- **Qué hace en morfx:** Orquestación de robot jobs (dispatch → wait → callback), agent timers (data collection timeout, promo offer timeout), 10 automation runners (uno por tipo de trigger), cron de tareas vencidas (cada 15 min)
- **Paquete NPM:** `inngest` ^3.51.0
- **App ID:** `morfx-agents`
- **Variables de entorno:**
  - `INNGEST_EVENT_KEY` (auto-provisioned)
  - `INNGEST_SIGNING_KEY` (auto-provisioned)
- **Archivos clave:** `src/inngest/client.ts`, `src/inngest/functions/`, `src/inngest/events.ts`, `src/app/api/inngest/route.ts`
- **Funciones activas:**
  - `robot-orchestrator` — dispatch + waitForEvent batch completion
  - `agent-timers` — data collection + promo offer timeouts
  - `automation-runner` × 10 — un runner por trigger type
  - `task-overdue-cron` — cada 15 minutos
- **¿Tiene costo?:** Freemium — free tier generoso, Pro $50/mes
- **Plan actual:** `___________`
- **Costo mensual real:** `$___________`
- **Dashboard:** https://app.inngest.com
- **Crítico para producción:** SÍ — sin esto no funcionan automatizaciones, robot, ni timers de agente

---

### 7. Vercel (Hosting)
- **Categoría:** Hosting / Serverless / CDN / Edge
- **Qué hace en morfx:** Hosting de la app Next.js 15 (App Router), serverless functions para APIs y webhooks, edge network global, deployments automáticos desde GitHub, preview deployments por branch
- **Config:** `next.config.ts` — turbopack, server actions con body size limit 20MB, remote images de Supabase
- **Variables de entorno:** Todas las secrets se configuran en Vercel Dashboard
- **¿Tiene costo?:** Sí — Hobby gratis, Pro $20/mes por miembro
- **Plan actual:** `___________`
- **Costo mensual real:** `$___________`
- **Dashboard:** https://vercel.com/dashboard
- **Crítico para producción:** SÍ — es el hosting principal

---

### 8. Robot Coordinadora (Servicio propio containerizado)
- **Categoría:** Logistics / Browser Automation
- **Qué hace en morfx:** Automatización del portal web de Coordinadora para creación de guías de envío y búsqueda de tracking. Usa Playwright (headless Chromium) para interactuar con el portal
- **Paquete NPM:** `playwright` ^1.52.0 (en subdirectorio `robot-coordinadora/`)
- **Variables de entorno:**
  - `ROBOT_COORDINADORA_URL` (secreto — URL del servicio)
  - `ROBOT_CALLBACK_SECRET` (secreto — HMAC callback verification)
  - `NEXT_PUBLIC_APP_URL` (público — URL de callback)
  - `PORT` (auto — default 3001)
- **Archivos clave:** `robot-coordinadora/` (Express + Playwright + Docker), `src/inngest/functions/robot-orchestrator.ts`
- **Endpoints:** `/api/crear-pedidos-batch`, `/api/buscar-guias`, `/api/health`
- **Docker:** Basado en `mcr.microsoft.com/playwright:v1.52.0-noble` con Chromium
- **Hosting:** Containerizado — ¿Railway? ¿Fly.io? ¿Render?
- **Hosting actual:** `___________`
- **¿Tiene costo?:** Sí — hosting del container
- **Costo mensual real:** `$___________`
- **Crítico para producción:** SÍ — sin esto no se generan guías de envío

---

### 9. Coordinadora (Portal de envíos)
- **Categoría:** Logistics / Carrier
- **Qué hace en morfx:** Proveedor de envíos nacional (Colombia). El robot automatiza su portal web para crear guías y buscar tracking
- **Credenciales:** En tabla `carrier_configs` por workspace (portal_username, portal_password — **en plaintext v3.0**, encriptación diferida a v4.0)
- **DB:** Tabla `carrier_coverage` — 1,489+ ciudades con soporte COD (contra-entrega)
- **¿Tiene costo?:** Sí — costo de envíos (no de API, se usa el portal web)
- **Costo mensual real:** `$___________` (variable por volumen de envíos)
- **Crítico para producción:** SÍ — para clientes que usan envíos

---

### 10. Meta / Facebook (WhatsApp Templates)
- **Categoría:** Messaging / Compliance
- **Qué hace en morfx:** Aprobación de templates de WhatsApp (MARKETING, UTILITY, AUTHENTICATION). Meta revisa y aprueba/rechaza cada template antes de poder usarlo
- **DB:** Tabla `whatsapp_templates` — status (PENDING/APPROVED/REJECTED/PAUSED/DISABLED), quality_rating, rejected_reason
- **Acceso:** Indirecto via 360dialog → Meta Graph API
- **¿Tiene costo?:** Incluido en costo de mensajes WhatsApp (Meta cobra por conversación)
- **Crítico para producción:** SÍ (indirecto) — sin templates aprobados no se pueden enviar mensajes proactivos

---

## SERVICIOS DE DESARROLLO (no en el código, pero se usan)

### 11. GitHub
- **Categoría:** DevTools / Version Control
- **Qué hace:** Repositorio de código, versionamiento, deployments automáticos a Vercel
- **Plan actual:** `___________`
- **Costo mensual:** `$___________`
- **Dashboard:** https://github.com

### 12. Claude Code (Anthropic CLI)
- **Categoría:** DevTools / AI Assistant
- **Qué hace:** Asistente de desarrollo para MorfX — el que está escribiendo este documento
- **Plan actual:** `___________`
- **Costo mensual:** `$___________`
- **Dashboard:** https://console.anthropic.com

### 13. Dominio
- **Categoría:** Infrastructure / DNS
- **Dominio:** `___________`
- **Registrador:** `___________`
- **Costo anual:** `$___________`

### 14. Cursor (IDE)
- **Categoría:** DevTools / IDE
- **Qué hace:** Editor de código con AI integrado
- **Plan actual:** `___________`
- **Costo mensual:** `$___________`

---

## CREDENCIALES ALMACENADAS EN BASE DE DATOS (por workspace)

| Tabla | Servicio | Campos almacenados | Encriptación |
|---|---|---|---|
| `integrations` (type='shopify') | Shopify | shop_domain, access_token, api_secret, field_mappings | JSONB app-level |
| `integrations` (type='twilio') | Twilio | account_sid, auth_token, phone_number | JSONB app-level |
| `carrier_configs` | Coordinadora | portal_username, portal_password | **Plaintext** (v3.0) |
| `api_keys` | MorfX API | key_hash, key_prefix, permissions | **bcrypt hash** |

**Nota de seguridad:** Las credenciales de Coordinadora en `carrier_configs` están en plaintext. Documentado como decisión consciente de v3.0, con encriptación diferida a v4.0+.

---

## TABLA RESUMEN DE COSTOS

| # | Servicio | Categoría | Plan | Costo Mensual | Crítico |
|---|---|---|---|---|---|
| 1 | Supabase | DB + Auth + Storage | `_______` | `$_______` | **SÍ** |
| 2 | Anthropic Claude API | AI / LLM | `_______` | `$_______` | **SÍ** |
| 3 | 360dialog | WhatsApp API | `_______` | `$_______` | **SÍ** |
| 4 | Twilio | SMS | `_______` | `$_______` | No |
| 5 | Shopify | E-commerce | N/A (cliente) | $0 | No |
| 6 | Inngest | Workflows | `_______` | `$_______` | **SÍ** |
| 7 | Vercel | Hosting | `_______` | `$_______` | **SÍ** |
| 8 | Robot Hosting | Container | `_______` | `$_______` | **SÍ** |
| 9 | Coordinadora | Envíos | N/A (operativo) | Variable | **SÍ** |
| 10 | Meta/Facebook | Templates WA | Incluido en #3 | $0 | **SÍ** |
| 11 | GitHub | Repositorio | `_______` | `$_______` | No |
| 12 | Claude Code | Dev AI | `_______` | `$_______` | No |
| 13 | Dominio | DNS | `_______` | `$_______` | **SÍ** |
| 14 | Cursor | IDE | `_______` | `$_______` | No |
| | | | **TOTAL** | **$_______** | |

---

## VARIABLES DE ENTORNO — REFERENCIA COMPLETA

### Definidas en .env.local (producción en Vercel)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App URL (para callbacks)
NEXT_PUBLIC_APP_URL=

# WhatsApp (360dialog)
WHATSAPP_API_KEY=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_SECRET=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_DEFAULT_WORKSPACE_ID=

# AI
ANTHROPIC_API_KEY=

# Robot Coordinadora
ROBOT_COORDINADORA_URL=
ROBOT_CALLBACK_SECRET=

# Shopify (webhook HMAC)
SHOPIFY_API_SECRET=

# Super Admin
MORFX_OWNER_USER_ID=

# Auto-managed por Inngest (no configurar manualmente)
# INNGEST_EVENT_KEY
# INNGEST_SIGNING_KEY
```

### Solo en scripts de migración (no en producción)
```env
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_API_DOMAIN=
ZOHO_ACCOUNTS_URL=
```

---

## WEBHOOKS — ENDPOINTS QUE RECIBEN DATOS EXTERNOS

| Endpoint | Método | Servicio externo | Qué recibe |
|---|---|---|---|
| `/api/webhooks/whatsapp` | GET | 360dialog | Verification challenge |
| `/api/webhooks/whatsapp` | POST | 360dialog | Mensajes entrantes + status updates |
| `/api/webhooks/shopify` | GET | Shopify | Health check |
| `/api/webhooks/shopify` | POST | Shopify | Orders create/update, draft orders |
| `/api/webhooks/twilio/status` | POST | Twilio | SMS delivery status |
| `/api/webhooks/robot-callback` | POST | Robot Coordinadora | Resultados de guías/pedidos |
| `/api/inngest` | POST | Inngest Cloud | Function execution dispatch |

---

## NOTAS ADICIONALES

### Servicios NO encontrados en el código
- ❌ Sentry / LogRocket / Datadog (no hay error tracking externo)
- ❌ SendGrid / Resend / Mailgun (no hay email transaccional)
- ❌ Redis / Upstash (no hay cache externo)
- ❌ Cloudinary / Imgix (no hay CDN de imágenes externo — usa Supabase Storage)
- ❌ Stripe / MercadoPago (no hay procesador de pagos integrado)
- ❌ GitHub Actions (no hay CI/CD — Vercel hace deploy automático)
- ❌ Analytics (no hay Google Analytics, Mixpanel, PostHog, etc.)

### Patrón de fallback WhatsApp
WhatsApp usa un patrón de fallback: credenciales por workspace en `workspace.settings` → si no existen → variables de entorno globales. Esto permite multi-tenant con override global.

### Logging
Solo `pino` + `pino-http` para logging estructurado en servidor. Sin servicio externo.
