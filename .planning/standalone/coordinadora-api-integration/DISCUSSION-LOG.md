# Standalone: Coordinadora API Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning/research/execution agents.
> Decisiones canónicas viven en `CONTEXT.md` — este log preserva el por qué.

**Date:** 2026-05-26
**Standalone:** coordinadora-api-integration
**Mode:** `--auto` (modo mixto: 5 decisiones de producto lockeadas por usuario en discuss informal; el resto técnico decidido por Claude con defaults razonables)
**Areas discussed:** Producto · Webhook Receptor · Cliente HTTP · Mapping de Estados · Persistencia · Feature Flag · Observability · Tests · Scope Obsoleto

---

## Contexto previo a la discusión

Antes del discuss formal, durante la conversación informal con el usuario hubo:

1. **Recheck completo de 5 PDFs** (Creación de Guías, Cotizador, Etiquetas, Webhook Push, Comunicado Mayo) — entregados por Coordinadora.
2. **Análisis de respuestas previas** de Jenny (Coordinadora) — 6 preguntas iniciales, 6 respuestas, 5 quedan pendientes para cuando se cierre el acuerdo.
3. **Correo final consolidado** enviado por WhatsApp a Jenny el 2026-05-26 con 5 pedidos numerados (2.1 credenciales, 2.2 idProceso, 2.3 divisionCliente, 2.4 tipoCuenta/tipoProducto, 2.5 URL POST guías).

## Decisiones de producto (lockeadas por usuario)

Tres preguntas claves se hicieron al usuario antes del discuss formal:

| Pregunta | Respuesta del usuario | Lockeada como |
|---|---|---|
| ¿Workspace target inicial? | "Somnio" | D-01 |
| ¿Convivencia con robot Railway actual? | "Coexisten" | D-02 |
| ¿Política RCE día 1? (Estándar solo vs todos los servicios) | "Todos" | D-03 |
| Paths del webhook | "Decide tú" → Claude eligió `/api/webhooks/coordinadora/[test\|prod]` | D-04 |
| Success criteria definitivo | "Eso es después de docs no?" → diferido a plan-phase con sandbox | D-05 |

**Notas del usuario:**
- "ok dale" / "avanza" = confirmación de arranque GSD
- "lo mejor/más completo pero conciso para que nos respondan bien" = guía editorial del correo final (depurado de 21 a 5 items)

---

## Producto

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Workspace inicial | Somnio · GoDentist · Todos | **Somnio** | D-01 |
| Convivencia robot Railway | Reemplazo total · Coexistencia · Migrar gradualmente | **Coexistencia con feature flag** | D-02 |
| Servicios día 1 | Solo creación guías · Solo Estándar · Todos los 4 servicios | **Todos** | D-03 |
| Paths webhook | Path único con header · Path por workspace · Path por env (test/prod) | **Path por env** | D-04 |
| Success criteria | Definitivo ahora · Provisional + lockeo en plan-phase | **Provisional + lockeo post-sandbox** | D-05 |

**Notas:** Las 5 son decisiones del usuario. No hay ambigüedad — quedan firmes.

---

## Webhook Receptor

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Path estructura | `/api/webhooks/coordinadora?env=X` query · `/api/webhooks/coordinadora/[env]` path · `/test` y `/prod` separados | **Path param dinámico `[env]`** | D-06 |
| Idempotencia key | Solo `tracking_number` · Composite con timestamp · UUID interno · Composite con hora microsegundo | **Composite `(workspace, tracking, fecha, hora, codigo, codigo_estado)`** | D-07 |
| Processing flow | Sincrónico bloqueante · 200 inmediato + Inngest async · Cola SQS | **200 inmediato + Inngest** | D-08 |
| Multi-tenant | Hardcoded Somnio · Tabla mapping · Lookup por `nit_cliente` del payload | **Lookup por `nit_cliente` (V1 hardcoded Morfx NIT, V2 tabla)** | D-09 |
| Auth del endpoint | Sin auth (per spec) · IP allowlist · HMAC (no soportado) | **Sin auth + idempotencia defensiva** | D-10 |
| Retries policy | Asumir Pub/Sub estándar · Implementar nuestra cola interna | **Asumir Pub/Sub at-least-once con backoff** | D-11 |

**Notas del PDF:** Coordinadora confirma sin auth. El envelope `{message:{data:"<b64>"}}` confirma uso interno de GCP Pub/Sub. Implementar idempotente es OBLIGATORIO no opcional.

---

## Cliente HTTP outbound

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Ubicación carpeta | Mezclar con robot Railway · Nueva carpeta `src/lib/carriers/coordinadora/` · `src/lib/integrations/coordinadora/` | **Nueva carpeta separada** | D-12 |
| Token cache | Redis · KV Vercel · Memoria por proceso TTL 55min | **Memoria + 55min TTL** | D-13 |
| API surface | 1 cliente con métodos · 3 funciones separadas (createGuia, cotizar, imprimirEtiqueta) | **3 funciones públicas** | D-14 |
| Env vars naming | `COORD_*` · `COORDINADORA_*` · `CARRIER_COORD_*` | **`COORDINADORA_*`** consistente con otros providers | D-15 |
| Base URL config | Hardcoded · Env var | **Hardcoded + discriminador `COORDINADORA_ENV`** | D-16 |
| Endpoint paths | Confirmar Jenny para guías; el resto del PDF | **`/oauth/token`, `/cotizador/nacional`, `/etiquetas/imprimir` + TBD guías** | D-17 |

**Notas:** Token cache en memoria asume que el cold start de Vercel es aceptable (~50ms para re-obtener token). El typo `api-devcoordinadora.tech` en el PDF se ignora.

---

## Mapping de Estados y Novedades

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Status code enum | String literal · Numeric enum · Symbol map | **String literal map de los 9 estados conocidos** | D-18 |
| Semántica `codigo` vs `codigo_estado` | Asumir ambos = estado · `codigo` siempre el principal · Diferir hasta producción | **Inferir del PDF: sin novedad `codigo`=estado, con novedad `codigo`=novedad + `codigo_estado`=estado actual** | D-19 |
| Catálogo novedades | Pedir lista completa a Jenny · Descubrir on-the-go · Hardcodear 801 | **Descubrir on-the-go + log warning para mapeo manual posterior** | D-20 |

**Notas:** El usuario explícitamente pidió "las cosas que podamos sacar on-the-go una vez ya tengamos acceso no preguntemos". Esto guía D-20.

---

## Persistencia

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Tabla destino | Nueva `coordinadora_events` · Reusar `order_carrier_events` (genérica) | **Reusar `order_carrier_events`** | D-21 |
| Asociación order ↔ tracking | Por `tracking_number` (existing) · Crear order si no existe | **Reusar `tracking_number`; sin order → log + persistir con `order_id: null`** | D-22 |
| Domain layer (Regla 3) | `createAdminClient` directo · Domain wrapper en `src/lib/domain/` | **Domain wrapper obligatorio (Regla 3 no negociable)** | D-23 |

---

## Feature Flag y Aislamiento (Regla 6)

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Flag scope | Global env var · Per-workspace en `platform_config` · Per-user | **Per-workspace en `platform_config`** | D-24 |
| Robot Railway | Apagarlo desde día 1 · Mantenerlo · Convivencia controlada por flag | **Convivencia: robot default, API opt-in por flag** | D-25 |
| Cutover prod fecha | ASAP · Después de sandbox · Después de ventana ERP Coordinadora | **≥ 8-jun-2026 (post-migración ERP Coordinadora)** | D-26 |

**Notas:** El usuario explícitamente quiere coexistencia (D-02). El comunicado de Mayo 2026 condiciona el cutover productivo (D-26).

---

## Observability

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Sistema de eventos | Nuevo · Reusar `agent_observability_events` con prefijo `coordinadora_` | **Reusar con prefijo `pipeline_decision:coordinadora_*`** | D-27 |
| PII redaction | Sin redact · Last-4 phone · Hash completo | **Last-4 phone + NIT + dirección truncada 50 chars; tokens NUNCA** | D-28 |

---

## Tests

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| Tests unitarios | Skip · Mínimos · Full coverage | **Mínimos: token cache, envelope decode, mapping, idempotencia** | D-29 |
| Integration tests | Skip · Webhook fixtures de PDFs · Full E2E | **Fixtures de los PDFs (1 entregada + 1 cancelada)** | D-30 |
| Smoke tests reales | Skip · Subset · Suite completa 7 smokes | **Suite completa 7 smokes commiteados** | D-31 |

---

## Scope Obsoleto

| Área | Opciones consideradas | Selección | Decisión |
|---|---|---|---|
| `coordinadora-status-polling` standalone | Mantener · Archivar · Renombrar a `_archived/` · Nota `SUPERSEDED` | **Marcar `STATUS: superseded by coordinadora-api-integration (2026-05-26)`** | D-32 |

---

## Claude's Discretion (no preguntado al usuario)

- D-33: Estructura interna `src/lib/carriers/coordinadora/`
- D-34: Naming exacto de eventos observability
- D-35: Schema migration aditiva (si plan-phase descubre necesidad)
- D-36: Rate limiting del endpoint webhook (V1 sin rate limit explícito; idempotencia protege)

---

## Datos pendientes de Coordinadora (no bloquean research+plan)

- D-37: 5 datos en correo a Jenny (2026-05-26):
  1. `client_id` + `client_secret` test
  2. `idProceso`
  3. `divisionCliente`
  4. `tipoCuenta` + `tipoProducto` correctos
  5. URL exacta POST creación de guías

---

## Deferred Ideas

### V2 (futuro standalone)
- Reemplazo del robot Railway por API directa
- Anulación de guías vía API
- Reimpresión de etiquetas sin re-call
- Cotizaciones México
- UI per-workspace para flag

### V3 (futuro)
- Catálogos completos on-the-go acumulados
- Multi-tenant real con tabla `coordinadora_tenant_mapping`
- Dashboard de salud Coordinadora

### Operacional
- Cerrar acuerdo comercial con Coordinadora (destrabar D-37)
- Política de devolución RCE durante ventana ERP 27-may → 5-jun

---

*Audit trail para revisión humana solamente. Para decisiones canónicas usar `CONTEXT.md`.*
