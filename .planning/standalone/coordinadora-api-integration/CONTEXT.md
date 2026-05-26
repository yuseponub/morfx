# Standalone: Coordinadora API Integration - Context

**Gathered:** 2026-05-26
**Status:** Ready for research-phase
**Mode:** --auto (Claude picked recommended defaults; user lockeó 5 decisiones de producto en discuss informal)

---

<domain>
## Phase Boundary

Integrar oficialmente con la API REST de Coordinadora Mercantil (4 servicios + webhook):

1. **OAuth2 token exchange** (`/oauth/token`) — Basic Auth → JWT Bearer 1h cache
2. **Cotizador nacional** (`POST /cotizador/nacional`) — flete pre-creación
3. **Creación de guías Estándar + RCE** (`POST` a ruta exacta TBD — pendiente confirmación de Coordinadora)
4. **Impresión de etiquetas** (`POST /etiquetas/imprimir`) — base64 multi-guía
5. **Webhook push de tracking** (`POST /api/webhooks/coordinadora/[env]`) — Google Pub/Sub envelope, sin auth, HTTPS

**Scope:** workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) en V1. Multi-tenant ready via `nit_cliente` + `div_cliente` del payload (extensible cuando se sumen más clientes).

**No-scope V1:**
- Reemplazo del robot scraping Railway (`morfx-production.up.railway.app`) — coexisten (D-02).
- Anulación / reimpresión de guías (endpoints no documentados, V2).
- Cotizaciones México (`codigoPais=484`) — V2.
- Catálogo exhaustivo de novedades / `tipo_etiqueta` / `tipoDocumento` — descubrir on-the-go.
- Reemplazo del approach SOAP polling investigado en `coordinadora-status-polling/` — ese standalone queda OBSOLETO (D-32).

</domain>

<decisions>
## Implementation Decisions

### Producto (lockeadas por usuario en discuss informal)
- **D-01:** Workspace target inicial = **Somnio** (`a3843b3f-c337-4836-92b5-89c58bb98490`). Otros workspaces se suman después con feature flag per-workspace.
- **D-02:** **Coexiste con robot Railway**. Robot scraping sigue siendo el default activo; API es opt-in por workspace via feature flag. No reemplaza nada hasta V2.
- **D-03:** **Todos los servicios desde día 1** (Cotizador + Estándar + RCE + Etiquetas + Webhook). Razón: las credenciales son globales, una sola integración cubre los 4.
- **D-04:** **Paths webhook = `/api/webhooks/coordinadora/test` y `/api/webhooks/coordinadora/prod`**. Dos paths porque Coordinadora pide ambientes separados. Internamente comparten lógica + dispatcher multi-tenant por `nit_cliente`.
- **D-05:** **Success criteria provisional:** sandbox PASS = 1 cotización + 1 guía Estándar + 1 guía RCE + 1 etiqueta impresa + 5 webhooks recibidos y procesados (estados 2/5/6 que Coordinadora confirmó simulables). Success criteria definitivo se lockea con sandbox real en plan-phase.

### Receptor del webhook
- **D-06:** Endpoint Next.js App Router: `app/api/webhooks/coordinadora/[env]/route.ts` con `env: 'test' | 'prod'` como path param dinámico. Validar contra union literal — rechazar cualquier otro valor.
- **D-07:** **Idempotencia** via composite key `(workspace_id, tracking_number, fecha, hora, codigo, codigo_estado)`. La granularidad `hora` del PDF (`13:51:43.456818`) es microsegundo → suficientemente única. Tabla candidata: `order_carrier_events` (reusable) o nueva si schema no acomoda.
- **D-08:** **Pipeline:** decode base64 envelope (`{message:{data:"<b64>"}}`) → JSON → validar campos requeridos → persistir → responder 200 inmediato → dispatch Inngest async para downstream (notificar agente, actualizar order, etc.). Webhook NO bloquea en lógica de negocio.
- **D-09:** **Multi-tenant dispatcher:** payload trae `nit_cliente` + `div_cliente`. Lookup interno `nit_cliente → workspace_id` (V1 hardcoded para Somnio NIT 902052328; V2 tabla de mapping). Si no matchea ningún workspace, log + 200 + drop (no reintentar, no escalar).
- **D-10:** **Sin autenticación en el endpoint** (Pub/Sub no soporta). Mitigación: validar shape del envelope estricto + idempotencia + rate limit por IP via middleware Vercel. NO firma HMAC (Coordinadora no la ofrece — leído del PDF).
- **D-11:** **Política de reintentos:** asumimos Pub/Sub estándar at-least-once con exponential backoff. Diseñar idempotente para tolerar duplicados naturales. Si nuestro endpoint responde 5xx, asumimos retry automático del lado Coordinadora (a confirmar en producción real).

### Cliente HTTP outbound (API Coordinadora)
- **D-12:** **Ubicación:** `src/lib/carriers/coordinadora/` (carpeta nueva, separada de `robot-coordinadora/` que sigue siendo el código Railway).
- **D-13:** **Token cache** en memoria por proceso (Vercel serverless instance scope), TTL 55min (5min de safety vs los 60min del token). No usar Redis ni KV — el costo de re-token a cada cold start es aceptable.
- **D-14:** **3 wrappers públicos:** `coordinadora.cotizar(body)`, `coordinadora.createGuia(body)`, `coordinadora.imprimirEtiqueta(guias[])`. Cada uno llama `getToken()` internamente.
- **D-15:** **Env vars (Vercel):**
  - `COORDINADORA_ENV` = `test` | `prod` (discriminador)
  - `COORDINADORA_CLIENT_ID` / `COORDINADORA_CLIENT_SECRET` (Basic Auth)
  - `COORDINADORA_ID_PROCESO` (numérico, asignado por Coordinadora)
  - `COORDINADORA_DIVISION_CLIENTE` (string, ej. "01", asignado por Coordinadora)
  - `COORDINADORA_NIT_CLIENTE` = `902052328` (NIT Morfx)
  - `COORDINADORA_TIPO_CUENTA` / `COORDINADORA_TIPO_PRODUCTO` (pendientes confirmación de Coordinadora — D-37 — pero env vars listas para inyectar)
- **D-16:** **Base URLs hardcoded:**
  - test: `https://api-test.coordinadora.tech`
  - prod: `https://api.coordinadora.tech`
  - typo confirmado en PDF Etiquetas (`api-devcoordinadora.tech`) — IGNORAR, usar el correcto. Validar con primer call.
- **D-17:** **Endpoints internos a construir** (suben de las base URLs):
  - `${BASE}/oauth/token?grant_type=client_credentials`
  - `${BASE}/cotizador/nacional`
  - `${BASE}/etiquetas/imprimir`
  - `${BASE}/guias/...` — ruta exacta TBD (pendiente Jenny — D-37)

### Mapping de estados y novedades
- **D-18:** **Enum `CoordinadoraStatusCode`:**
  ```ts
  0 = 'GUIA_NO_EXISTE'
  1 = 'A_RECIBIR_POR_COORDINADORA'
  2 = 'EN_TERMINAL_ORIGEN'         // simulable en sandbox
  3 = 'EN_TRANSPORTE'
  4 = 'EN_TERMINAL_DESTINO'
  5 = 'EN_REPARTO'                 // simulable en sandbox
  6 = 'ENTREGADA'                  // simulable en sandbox
  8 = 'CERRADO_INCIDENCIA'
  9 = 'EN_PUNTO_DROP'
  ```
- **D-19:** **Semántica `codigo` vs `codigo_estado`** (inferida del PDF, validar en producción):
  - Evento sin novedad: solo viene `codigo` = estado actual.
  - Evento con novedad: viene `codigo` = código de la novedad (ej. 801 = Pedido Cancelado) + `codigo_estado` = estado actual de la guía + `desc_estado` = label legible.
  - Persistir AMBOS cuando vengan ambos.
- **D-20:** **Catálogo de novedades** descubrir on-the-go. Solo conocemos `801 = Pedido Cancelado`. Cualquier código no mapeado se guarda raw + log warning para luego mapear manualmente. NO bloquear.

### Persistencia
- **D-21:** **Reusar tabla `order_carrier_events`** (ya existe, usado por robot Railway + Envia polling). Verificar schema en research-phase — si faltan columnas (codigo_novedad, nit_cliente, div_cliente, vinculo_guia), proponer migración aditiva en plan-phase.
- **D-22:** **Asociación order ↔ tracking_number:** `orders.tracking_number` (ya existe). Si webhook llega con tracking que no matchea ninguna order → log + persistir con `order_id: null` para auditoría posterior. NO crear orders desde webhook.
- **D-23:** **Domain layer (Regla 3):** toda inserción a `order_carrier_events` pasa por `src/lib/domain/carrier-events.ts` con `source: 'webhook:coordinadora'`. Cero `createAdminClient` directo en el route handler del webhook.

### Feature flag y aislamiento (Regla 6)
- **D-24:** **Feature flag** `coordinadora_api_v2_enabled` en `platform_config` per-workspace (default `false`). Flip manual via SQL — NO UI en V1.
- **D-25:** **Robot Railway** sigue 100% funcional sin tocar. Cuando flag está OFF en un workspace, la API ni se invoca para creación de guías — el robot scraping mantiene el rol. Webhook receiver SÍ corre siempre (Coordinadora sólo envía cuando hay guías creadas vía API, no scraping; por defecto vacío hasta que activemos creación).
- **D-26:** **Cutover producción target:** ≥ **8-jun-2026** (post-migración ERP Coordinadora 27-may → 5-jun según `Comunicado Clientes cierre Mayo 2026.pdf`). Sandbox sí puede correr en esa ventana (no afecta plata real).

### Observability
- **D-27:** **Eventos `pipeline_decision:coordinadora_*`** a `agent_observability_events`:
  - `webhook_received` (payload metadata, no body completo por PII)
  - `webhook_processed` / `webhook_drop_no_match` / `webhook_drop_invalid_envelope`
  - `api_token_refreshed` / `api_token_cache_hit`
  - `api_call_succeeded` / `api_call_failed` (por servicio: cotizar/createGuia/imprimirEtiqueta)
- **D-28:** **PII redaction:** loggear teléfono solo últimos 4 dígitos, NIT últimos 4 dígitos del destinatario, dirección truncada a 50 chars. NUNCA log de tokens/credenciales.

### Tests
- **D-29:** **Vitest unit tests** (mínimo en V1):
  - Token cache (TTL + refresh + race conditions)
  - Decode base64 envelope + validación de shape
  - Mapeo de status codes
  - Idempotencia: doble webhook con misma `(tracking_number, fecha, hora, codigo)` no duplica.
- **D-30:** **Integration test** del webhook receptor con payload fixtures basados en los ejemplos de los PDFs (1 evento normal "ENTREGADA" + 1 evento con novedad "Pedido Cancelado").
- **D-31:** **Smoke tests reales en sandbox** (post-credenciales): cada uno commiteado:
  - Smoke 1: webhook stub recibe ping vacío de Coordinadora — 200 OK.
  - Smoke 2: OAuth token request → respuesta `{ access_token, expires_in, token_type }`.
  - Smoke 3: Cotizador con DANE Bogotá → Medellín.
  - Smoke 4: Crear 1 guía Estándar (`nivelServicio: 1`).
  - Smoke 5: Crear 1 guía RCE (`nivelServicio: 22`, `valorRecaudar: ...`).
  - Smoke 6: Imprimir etiqueta de las 2 guías → base64 PDF (o lo que sea).
  - Smoke 7: 5+ webhooks reales recibidos (Coordinadora dispara estados 2/5/6 en pruebas).

### Cierres de scope obsoleto
- **D-32:** **Standalone `coordinadora-status-polling` queda OBSOLETO**. El approach SOAP polling investigado en abril 2026 (`RESEARCH-API.md`) ya no aplica — Coordinadora ofrece webhook push REST. Mover `coordinadora-status-polling/RESEARCH-API.md` a `_archived/` o agregar nota `STATUS: superseded by coordinadora-api-integration (2026-05-26)`.

### Claude's Discretion
- **D-33:** Estructura interna de carpetas de `src/lib/carriers/coordinadora/` — Claude decide.
- **D-34:** Naming exacto de eventos observability (más allá del prefijo `coordinadora_`).
- **D-35:** Schema migration (si se requiere) — Claude propone en plan-phase si descubre columnas faltantes.
- **D-36:** Implementación del rate limiting del endpoint webhook (asumir IP allowlist de GCP Pub/Sub si Vercel lo permite, o sino dejar abierto en V1 — bajo riesgo porque idempotencia protege).

### Datos pendientes de Coordinadora (no bloquean research+plan)
- **D-37:** **5 datos bloqueantes para smoke tests reales** (correo enviado 2026-05-26 a Jenny):
  - 1. `client_id` + `client_secret` (test)
  - 2. `idProceso`
  - 3. `divisionCliente`
  - 4. `tipoCuenta` + `tipoProducto` correctos
  - 5. URL exacta del POST de creación de guías Estándar + RCE
  Mientras no lleguen, podemos terminar TODO el código (webhook receiver + cliente API + mapping + tests) con env vars placeholder. Smokes 2-7 se desbloquean al llegar las credenciales.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (research-phase, plan-phase, execute-phase) MUST read these antes de actuar.**

### Documentación oficial de Coordinadora (PDFs archivados)
- `.planning/standalone/coordinadora-api-integration/reference/Documentacion Creacion de Guía Estándar y RCE.pdf` — Body completo Estándar (`nivelServicio:1`) y RCE (`nivelServicio:22`); campos requeridos; ejemplos de JSON. **Falta:** URL exacta del POST.
- `.planning/standalone/coordinadora-api-integration/reference/API Cotizador Nacional.pdf` — Endpoints test/prod confirmados; auth OAuth2; body CO (DANE) + MX (CP); respuesta con `flete_total`, `dias_entrega`, `tipo_trayecto`.
- `.planning/standalone/coordinadora-api-integration/reference/Servicio etiquetas.pdf` — `POST /etiquetas/imprimir`; body `{tipo_etiqueta, guias[]}`; respuesta base64; guías 11 dígitos.
- `.planning/standalone/coordinadora-api-integration/reference/Notificacion-push-Tracking-v3.pdf` — Webhook Pub/Sub envelope; payload normal vs con novedad; 9 status codes; **sin autenticación, HTTPS obligatorio**.
- `.planning/standalone/coordinadora-api-integration/reference/Comunicado Clientes cierre Mayo 2026.pdf` — Ventana sin devoluciones 27-may → 5-jun 2026 (impacta cutover productivo — D-26).

### Reglas del proyecto MorfX
- `CLAUDE.md` §Regla 3 — Domain layer obligatorio para mutaciones (D-23).
- `CLAUDE.md` §Regla 5 — Migraciones DB aplicadas en prod ANTES del push (si plan-phase propone migración).
- `CLAUDE.md` §Regla 6 — Aislamiento de cambios via feature flag para no afectar agente productivo (D-24, D-25).

### Standalones relacionados
- `.planning/standalone/coordinadora-status-polling/RESEARCH-API.md` — **OBSOLETO** (D-32). SOAP polling fue investigado pero superseded por webhook push.
- `.planning/standalone/envia-status-polling/` — Patrón de referencia para tracking (Envia hace polling REST; nosotros recibimos webhook). Schema de `order_carrier_events` usado allí es reusable (D-21).
- `.planning/phases/22-robot-coordinadora-service/` — Robot scraping creación de guías (sigue operativo, D-02/D-25).
- `.planning/phases/26-robot-lector-guias-coordinadora/` — Robot lector de guías (sigue operativo).

### Historial del correo enviado a Coordinadora
- Correo a Jenny enviado 2026-05-26 via WhatsApp con 5 pedidos numerados (2.1-2.5). Decisiones D-37 dependen de su respuesta.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`order_carrier_events` table** (Supabase): ya almacena eventos del robot Railway. Schema candidato a reusar (D-21).
- **`src/lib/domain/` patterns**: el proyecto tiene domain layer estricto (`src/lib/domain/carrier-events.ts` candidato a crear si no existe). Patrón establecido en `crm-mutation-tools` y `client-activation-auto-revoke`.
- **Inngest async pattern**: webhook → 200 inmediato → `inngest.send({ name: 'coordinadora/webhook.received' })` → función Inngest procesa downstream. Patrón usado en `webhook-processor.ts` (Meta WhatsApp inbound), `pw-confirmation-preload-and-invoke.ts`.
- **`platform_config` table**: feature flags per-workspace (`somnio_recompra_crm_reader_enabled`, `bold_robot_failure_count`, etc.). `coordinadora_api_v2_enabled` sigue el mismo patrón (D-24).
- **`agent_observability_events`**: tabla de eventos pipeline_decision con PII redaction estándar. Eventos `coordinadora_*` van aquí (D-27).
- **Robot Railway**: `robot-coordinadora/` (raíz del repo) sigue siendo el código Railway. NO tocarlo. La integración API va a `src/lib/carriers/coordinadora/`.

### Established Patterns
- **Multi-tenant via header `x-workspace-id`** — NO aplica al webhook (sin auth ni header). Multi-tenant via `nit_cliente` del payload (D-09).
- **Feature flag pre-deploy**: NO desconectar el agente actual, flip flag manual via SQL (Regla 6).
- **Idempotencia via composite key** — patrón ya en `crm_mutation_idempotency_keys`. Para webhook es composite del payload (D-07).
- **OAuth2 client_credentials grant + JWT Bearer** — patrón nuevo en codebase (no había hasta ahora). Closest analog: SMS Onurix auth.

### Integration Points
- **Webhook entry:** `app/api/webhooks/coordinadora/[env]/route.ts` (nuevo)
- **API client:** `src/lib/carriers/coordinadora/` (nuevo)
- **Domain mutations:** `src/lib/domain/carrier-events.ts` (probablemente nuevo o extiende existente)
- **Inngest functions:** `src/inngest/functions/coordinadora-webhook-process.ts` (nuevo)
- **Env vars:** Vercel project settings (no `.env.local` para credenciales productivas).
- **Feature flag SQL:** `INSERT INTO platform_config (workspace_id, key, value) VALUES ('<somnio-id>', 'coordinadora_api_v2_enabled', 'false')` por defecto.

</code_context>

<specifics>
## Specific Ideas

- **User-driven decisions (los 5 lockeados):**
  1. Somnio primero (D-01).
  2. Coexistencia con robot Railway (D-02).
  3. Todos los servicios desde día 1 (D-03).
  4. Decidir paths webhook autónomo (D-04).
  5. Success criteria provisional + definitivo lockeado en plan-phase (D-05).

- **Patrón inferido del PDF webhook:** envelope Google Cloud Pub/Sub push format. Esto sugiere que Coordinadora internamente usa GCP Pub/Sub para sus notificaciones. Por defecto Pub/Sub push:
  - Es HTTPS-only ✓
  - At-least-once delivery (no exactly-once, no orden garantizado) → idempotencia obligatoria (D-07)
  - Reintenta con exponential backoff si recibe non-2xx
  - Timeout de la suscriptor side configurable (default 10s) → responder 200 rápido (D-08)

- **Comunicado Mayo 2026:** ventana sin devoluciones 27-may → 5-jun. Sandbox NO se ve afectado (no mueve plata). Cutover prod ≥ 8-jun (D-26).

</specifics>

<deferred>
## Deferred Ideas

### V2 (next standalone)
- **Reemplazo del robot Railway** por API directa cuando V1 esté estable + workspace lo decida.
- **Anulación de guías** vía API (endpoint no documentado, pedir doc específica).
- **Reimpresión de etiquetas** sin volver a `/etiquetas/imprimir` (endpoint no documentado).
- **Cotizaciones México** (`codigoPais: 484`, `codigo_postal_*` en lugar de DANE).
- **UI per-workspace** para flippear `coordinadora_api_v2_enabled` desde `/configuracion/carriers` (en lugar de SQL manual).

### V3 (futuro)
- **Catálogos completos** descubiertos on-the-go: nivelServicio (más allá de 1+22), tipoDocumento, tipo_etiqueta, novedades.
- **Multi-tenant real**: tabla `coordinadora_tenant_mapping (nit_cliente → workspace_id)` para soportar varios clientes en el mismo endpoint.
- **Dashboard de salud Coordinadora** (similar al de BOLD robot): % éxito creación, latencia tokens, eventos webhook por hora.

### Operacional (no técnico)
- **Cerrar acuerdo comercial** con Coordinadora para destrabar D-37.
- **Decidir política de devolución RCE** durante ventana 27-may → 5-jun (no crear órdenes RCE en esa ventana).

</deferred>

---

*Standalone: coordinadora-api-integration*
*Context gathered: 2026-05-26*
*Discuss mode: --auto (5 decisiones de producto lockeadas por usuario; resto técnico por Claude)*
