# Patron Robot Service — Documentacion de Arquitectura

> **Audiencia:** Desarrollo futuro (agentes Claude y desarrolladores humanos construyendo nuevas integraciones de transportadoras).
> **Implementacion de referencia:** `robot-coordinadora/` (transportadora Coordinadora, activo desde v3.0)

---

## 1. Vision General

### Que es un "Robot"?

En MorfX, un **robot** es un servicio standalone que automatiza acciones en portales web de transportadoras usando Playwright (Chromium headless). Los robots llenan formularios, envian pedidos y extraen numeros de seguimiento — reemplazando el proceso manual de entrar al portal de la transportadora y crear envios uno por uno.

### Por que Standalone?

Playwright (Chromium headless) **no puede correr en Vercel serverless** — requiere un proceso persistente con 500MB+ de binarios de Chromium. Los robots se despliegan como contenedores Docker separados en Railway (o cualquier host Docker), comunicandose con MorfX via callbacks HTTP y eventos Inngest.

### Robots Actuales

| Robot | Transportadora | Estado | Portal |
|-------|---------------|--------|--------|
| `robot-coordinadora` | Coordinadora | Activo | ff.coordinadora.com |
| `robot-inter` | Inter Rapidisimo | Planeado | — |
| `robot-envia` | Envia | Planeado | — |
| `robot-servientrega` | Servientrega | Planeado | — |

---

## 2. Patron del Servicio Robot

Cada robot sigue la misma estructura establecida por `robot-coordinadora/`:

### Estructura

```
robot-{carrier}/
  src/
    index.ts                          # Entry point del servidor Express
    api/server.ts                     # Endpoints HTTP (health + batch)
    adapters/{carrier}-adapter.ts     # Automatizacion Playwright del portal
    middleware/locks.ts               # Locks en memoria: workspace + por orden
    types/index.ts                    # Tipos compartidos (mirror de contratos MorfX)
  Dockerfile                          # Basado en mcr.microsoft.com/playwright
  package.json                        # Deps: express + playwright
  tsconfig.json
```

### Propiedades Clave

- **Express + Playwright standalone** desplegado en Railway como contenedor Docker
- **Un adapter por transportadora** — el adapter encapsula todos los selectores, interacciones de formulario y deteccion de resultados especificos del portal
- **Procesamiento por lotes** — recibe N ordenes, las procesa secuencialmente en el portal, reporta resultados por orden via callback HTTP
- **Gestion de sesion** — guarda cookies del browser en disco por workspace, reutiliza sesiones para evitar re-login en cada lote
- **Acknowledgement fire-and-forget** — el endpoint de batch retorna `200 OK` inmediatamente despues de validar, luego procesa ordenes en background

### Interfaz del Adapter

Cada adapter de transportadora debe implementar este ciclo de vida:

```typescript
class CarrierAdapter {
  async init(): Promise<void>              // Lanzar Chromium, cargar cookies
  async login(): Promise<boolean>          // Autenticar en portal de transportadora
  async createGuia(pedido: PedidoInput): Promise<GuiaResult>  // Llenar form, enviar, extraer resultado
  async close(): Promise<void>             // Cerrar browser (SIEMPRE en try/finally)
}
```

### Contrato del Endpoint Batch

```
POST /api/crear-pedidos-batch
```

**Request body** (`BatchRequest`):
```typescript
interface BatchRequest {
  workspaceId: string
  credentials: { username: string; password: string }
  callbackUrl: string           // Callback de MorfX: /api/webhooks/robot-callback
  callbackSecret?: string       // Secreto compartido enviado en headers del callback
  jobId: string
  orders: Array<{
    itemId: string              // robot_job_items.id
    orderId: string             // orders.id
    pedidoInput: PedidoInput    // Datos del envio para llenar en el formulario del portal
  }>
}
```

**Respuesta inmediata** (`BatchResponse`):
```typescript
{ success: true, jobId: string, message: "Batch aceptado, procesando..." }
```

**Callback por orden** (`BatchItemResult`):
```typescript
interface BatchItemResult {
  itemId: string
  status: 'success' | 'error'
  trackingNumber?: string
  errorType?: 'validation' | 'portal' | 'timeout' | 'unknown'
  errorMessage?: string
}
```

---

## 3. Flujo de Comunicacion

### Diagrama

```
 MorfX (Vercel)                    Inngest                     Robot (Railway)
 ─────────────                    ────────                     ───────────────
      │                               │                              │
  [1] Usuario: "subir ordenes coord"  │                              │
      │                               │                              │
  [2] Server Action:                  │                              │
      validar creds + etapa           │                              │
      obtener ordenes de la etapa     │                              │
      validar ciudades                │                              │
      crear robot_job + items         │                              │
      │                               │                              │
  [3] inngest.send(                   │                              │
        robot/job.submitted)  ───────>│                              │
      │                               │                              │
      │                           [4] robot-orchestrator             │
      │                               marcar job "processing"        │
      │                               │                              │
      │                           [5] HTTP POST ────────────────────>│
      │                               /api/crear-pedidos-batch       │
      │                               │                              │
      │                               │                         [6] Validar, 200 OK
      │                               │<────────────────────────────│
      │                               │                              │
      │                           [7] step.waitForEvent              │
      │                               (timeout dinamico)             │
      │                               │                         [8] Por cada orden:
      │                               │                              login/reusar sesion
      │                               │                              llenar form + enviar
      │                               │                              detectar resultado
      │                               │                              │
      │    [9] POST /api/webhooks/robot-callback <──────────────────│
      │        (por orden, con X-Callback-Secret)                   │
      │                               │                              │
  [10] Ruta callback:                 │                              │
       domain: updateJobItemResult    │                              │
       domain: updateOrder (tracking) │                              │
       emitir: robot.coord.completed  │                              │
       (trigger de automatizacion)    │                              │
       │                              │                              │
  [11] Si todos los items terminaron: │                              │
       inngest.send(                  │                              │
         robot/job.batch_completed)──>│                              │
       │                              │                              │
       │                          [12] orchestrator retorna          │
       │                              { status: 'completed' }       │
```

### Desglose Paso a Paso

| Paso | Componente | Accion |
|------|-----------|--------|
| 1 | Chat de Comandos UI | Usuario escribe "subir ordenes coord" en `/comandos` |
| 2 | Server Action (`comandos.ts`) | Valida credenciales, obtiene ordenes de la etapa de despacho, valida ciudades, crea `robot_job` + `robot_job_items` |
| 3 | Server Action | Emite evento Inngest `robot/job.submitted` con datos del job, credenciales y payloads de ordenes |
| 4 | Inngest Orchestrator | Marca el job como `processing` via domain layer |
| 5 | Inngest Orchestrator | HTTP POST al servicio robot en `ROBOT_COORDINADORA_URL/api/crear-pedidos-batch` |
| 6 | Servicio Robot | Valida request, verifica idempotencia + lock de workspace, retorna `200 OK` inmediatamente |
| 7 | Inngest Orchestrator | Espera evento `robot/job.batch_completed` con timeout dinamico: `(N ordenes x 30s) + 5 min` |
| 8 | Servicio Robot | Procesa ordenes secuencialmente: init browser, login, llenar form, enviar, detectar resultado SweetAlert2 |
| 9 | Servicio Robot | POST de cada resultado de orden al callback URL de MorfX con header `X-Callback-Secret` |
| 10 | Ruta Callback | Actualiza job item via domain, actualiza `tracking_number`/`carrier` de la orden, dispara trigger de automatizacion `robot.coord.completed` |
| 11 | Ruta Callback | Cuando `success_count + error_count >= total_items`, domain auto-completa job, callback emite `robot/job.batch_completed` |
| 12 | Inngest Orchestrator | Recibe evento batch_completed, retorna estado final |

---

## 4. Referencia de Archivos Clave

### Servicio Robot (`robot-coordinadora/`)

| Archivo | Proposito |
|---------|-----------|
| `robot-coordinadora/src/index.ts` | Entry point — inicia Express en PORT configurable con graceful shutdown |
| `robot-coordinadora/src/api/server.ts` | Endpoints HTTP: health check (`GET /api/health`) + procesamiento batch (`POST /api/crear-pedidos-batch`) |
| `robot-coordinadora/src/adapters/coordinadora-adapter.ts` | Automatizacion Playwright para ff.coordinadora.com — login, llenado de formulario, deteccion de resultado SweetAlert2, persistencia de cookies |
| `robot-coordinadora/src/middleware/locks.ts` | Mutex de workspace en memoria (un batch por workspace) + locks por orden (skip si ya procesando) |
| `robot-coordinadora/src/types/index.ts` | Interfaces TypeScript del contrato HTTP (BatchRequest, BatchItemResult, PedidoInput) |
| `robot-coordinadora/Dockerfile` | Imagen de produccion basada en `mcr.microsoft.com/playwright:v1.52.0-noble` |

### MorfX Core (`src/`)

| Archivo | Proposito |
|---------|-----------|
| `src/inngest/functions/robot-orchestrator.ts` | Funcion durable Inngest: despacho al robot, espera completacion del batch con timeout dinamico, fail-fast (retries: 0) |
| `src/app/api/webhooks/robot-callback/route.ts` | Recibe callbacks por orden del robot, enruta por domain layer, dispara triggers de automatizacion, senala completacion del batch |
| `src/lib/domain/robot-jobs.ts` | Domain layer para robot jobs: crear job, actualizar resultados de items, auto-completar job, reintentar items fallidos |
| `src/lib/domain/carrier-configs.ts` | CRUD para credenciales de transportadora y configuracion de etapa de despacho |
| `src/lib/domain/carrier-coverage.ts` | Validacion de ciudades contra tablas de cobertura de transportadora (individual y batch) |
| `src/lib/logistics/constants.ts` | Mapeo de abreviaciones de departamentos, normalizacion de texto, definicion del tipo PedidoInput |
| `src/app/actions/comandos.ts` | Server actions para Chat de Comandos: flujo completo de despacho, estado del job, historial |
| `src/app/(dashboard)/comandos/page.tsx` | Pagina Chat de Comandos — entry point de la UI del panel de comandos logisticos |

---

## 5. Modelo de Datos

### Tablas

```
carrier_configs
  ├── workspace_id, carrier (par unico)
  ├── portal_username, portal_password (credenciales del portal)
  ├── dispatch_pipeline_id, dispatch_stage_id (que etapa CRM = "listo para despachar")
  └── is_enabled

carrier_coverage (tabla de referencia global, sin workspace_id)
  ├── carrier, city_name, department_abbrev
  ├── city_coordinadora (formato exacto del carrier: "MEDELLIN (ANT)")
  ├── dane_code_id (FK a dane_municipalities)
  └── supports_cod, is_active

robot_jobs
  ├── workspace_id, carrier, status (pending/processing/completed/failed)
  ├── total_items, success_count, error_count
  ├── idempotency_key (previene jobs duplicados para el mismo batch)
  └── started_at, completed_at

robot_job_items (hijo de robot_jobs, RLS por parent-join)
  ├── job_id, order_id
  ├── status (pending/processing/success/error)
  ├── tracking_number, validated_city, value_sent (snapshot JSONB)
  ├── error_type (validation/portal/timeout/unknown), error_message
  └── retry_count, last_retry_at
```

### Realtime

Supabase Realtime con suscripciones en `robot_jobs` (cambios de estado del job) y `robot_job_items` (progreso por orden) alimentan la UI del Chat de Comandos en vivo. La UI usa listeners duales en un solo canal: items para progreso por orden, job para transiciones de estado general.

---

## 6. Proteccion Anti-Duplicados

Cinco capas previenen envios duplicados en el portal de la transportadora:

| Capa | Donde | Como |
|------|-------|------|
| **1. Llave de idempotencia** | Tabla `robot_jobs` | Columna `idempotency_key` verificada contra jobs activos (`pending`/`processing`) antes de crear un job nuevo. Rechaza si ya existe un job activo con la misma llave. |
| **2. Guard de job activo** | Server Action (`comandos.ts`) | Verificacion `getActiveJob()` — rehusa crear un job nuevo si ya hay uno `pending` o `processing` para el workspace. |
| **3. Lock de workspace** | Servicio robot (`locks.ts`) | Map en memoria — solo un batch por workspace puede correr simultaneamente. Retorna `409 Conflict` si el workspace ya esta bloqueado. |
| **4. Lock por orden** | Servicio robot (`locks.ts`) | Set en memoria — ordenes individuales en proceso se saltan (no se bloquean) si ya estan en el Set de procesamiento. |
| **5. Cache de idempotencia** | Servicio robot (`server.ts`) | Map en memoria con key `jobId` — retorna respuesta `200 OK` cacheada para re-envios secuenciales (ej. reintentos de Inngest despues de que la respuesta ya fue enviada). Se setea ANTES de `res.json()` para prevenir race con reintento inmediato. |

### Seguridad Adicional

- **Inngest retries: 0** en `robot-orchestrator` — fail-fast previene re-envio del batch completo
- **Guard de estado terminal de item** — `updateJobItemResult` en el domain layer salta actualizaciones a items que ya estan en estado `success` o `error`
- **Completacion de batch via estado del domain** — el callback lee `job.status === 'completed'` (seteado atomicamente por domain) en vez de hacer aritmetica de contadores, previniendo eventos `batch_completed` duplicados espurios de callbacks finales concurrentes

---

## 7. Agregar una Nueva Transportadora (Paso a Paso)

Esta guia recorre como agregar una nueva transportadora (ej. Inter Rapidisimo) al sistema de robots.

### Paso 1: Crear el Servicio Robot

Crear un nuevo directorio en la raiz del repo siguiendo la estructura de referencia:

```
robot-inter/
  src/
    index.ts                    # Copiar de robot-coordinadora, cambiar puerto/nombre
    api/server.ts               # Reusar mismo contrato de endpoints (POST /api/crear-pedidos-batch)
    adapters/inter-adapter.ts   # NUEVO: Automatizacion Playwright del portal de Inter
    middleware/locks.ts          # Copiar tal cual (mismo patron de locking)
    types/index.ts              # Ajustar PedidoInput si Inter requiere campos diferentes
  Dockerfile                    # Misma imagen base (mcr.microsoft.com/playwright)
  package.json                  # Mismas deps: express + playwright
  tsconfig.json
```

El **unico archivo que cambia significativamente** es el adapter. El server, locks, types y Dockerfile son reutilizables en gran medida.

### Paso 2: Implementar el Adapter de la Transportadora

Crear `InterAdapter` siguiendo la misma interfaz que `CoordinadoraAdapter`:

```typescript
class InterAdapter {
  async init(): Promise<void>           // Lanzar Chromium, cargar cookies
  async login(): Promise<boolean>       // Navegar al portal de Inter, llenar form de login
  async createGuia(pedido: PedidoInput): Promise<GuiaResult>  // Llenar form de envio, enviar, extraer tracking
  async close(): Promise<void>          // Cerrar browser
}
```

Consideraciones clave:
- Estudiar la estructura del formulario del portal de Inter (nombres de campos, tipo de selector de ciudad, comportamiento al enviar)
- Implementar deteccion de resultado para el feedback de exito/error de Inter (puede no ser SweetAlert2)
- Manejar cookies de sesion por workspace (mismo patron que Coordinadora)
- Agregar captura de screenshots para debuggear envios fallidos

### Paso 3: Agregar Datos de Cobertura

Insertar filas en `carrier_coverage` para la nueva transportadora:

```sql
INSERT INTO carrier_coverage (carrier, city_name, department_abbrev, city_coordinadora, supports_cod, is_active)
VALUES ('inter', 'MEDELLIN', 'ANT', 'MEDELLIN (ANT)', false, true);
-- Repetir para todas las ciudades cubiertas
```

Nota: La columna `city_coordinadora` es legacy — almacena el formato de ciudad especifico de cada transportadora sin importar cual sea. Si Inter usa un formato diferente, almacenar ese formato.

### Paso 4: Agregar Soporte de Carrier Config

Actualizar `src/lib/domain/carrier-configs.ts` — no se necesitan cambios de codigo. Las funciones existentes aceptan un parametro `carrier` (default `'coordinadora'`). Solo pasar `'inter'` al llamarlas.

La UI de Settings en `/settings/logistica` ya renderiza cards placeholder para transportadoras futuras. Habilitar la card de Inter actualizando la lista de carriers en el componente de settings.

### Paso 5: Agregar Mapeo de PedidoInput

Si Inter requiere campos diferentes que Coordinadora:
- Extender `PedidoInput` en `src/lib/logistics/constants.ts` con campos opcionales, O
- Crear un tipo especifico por transportadora que mapee desde el comun `OrderForDispatch`

Actualizar `buildPedidoInputFromOrder()` en `src/app/actions/comandos.ts` o crear un builder especifico por transportadora.

### Paso 6: Agregar Comando en Server Action

Agregar `executeSubirOrdenesInter()` en `src/app/actions/comandos.ts` siguiendo el mismo patron que `executeSubirOrdenesCoord()`:
1. Validar credenciales (`getCarrierCredentials(ctx, 'inter')`)
2. Obtener etapa de despacho (`getDispatchStage(ctx, 'inter')`)
3. Verificar jobs activos
4. Obtener ordenes, validar ciudades
5. Crear robot job (`createRobotJob(ctx, { carrier: 'inter', orderIds })`)
6. Construir pedido inputs
7. Emitir evento Inngest

### Paso 7: Crear Orchestrator Inngest

Agregar nueva funcion orchestrator en `src/inngest/functions/` o extender la existente para aceptar un parametro `carrier` y enrutar al URL del robot correcto segun la transportadora:

```typescript
const robotUrl = carrier === 'inter'
  ? process.env.ROBOT_INTER_URL
  : process.env.ROBOT_COORDINADORA_URL
```

### Paso 8: Agregar Trigger de Automatizacion

Crear tipo de trigger `robot.inter.completed`:
1. Agregar al union `TriggerType` en `src/lib/automations/types.ts`
2. Agregar funcion emisora en `src/lib/automations/trigger-emitter.ts`
3. Agregar tipo de evento Inngest en `src/inngest/events.ts`
4. Agregar caso en automation-runner en `src/inngest/functions/automation-runner.ts`

### Paso 9: Desplegar en Railway

1. Crear un nuevo servicio Railway apuntando al directorio `robot-inter/`
2. Configurar variables de entorno: `PORT` (Railway asigna), no se necesitan env vars de MorfX (el robot es stateless)
3. Configurar env var `ROBOT_INTER_URL` en MorfX (Vercel) apuntando al URL del servicio Railway

### Paso 10: Agregar Comando en Chat

Registrar el nuevo comando en la UI del Chat de Comandos:
1. Agregar "subir ordenes inter" a la lista de comandos en los componentes de `/comandos`
2. Conectarlo al server action `executeSubirOrdenesInter()`
3. Reusar el mismo display de progreso Realtime (funciona sobre `robot_job_items` sin importar la transportadora)

---

## 8. Configuracion de Pipeline

### Vinculacion de Etapa de Despacho

Cada transportadora se vincula a una etapa especifica del pipeline que representa "listo para despachar." Esto se configura en la UI de Settings en `/settings/logistica`:

1. **Seleccion de pipeline** — el owner del workspace selecciona que pipeline CRM contiene las ordenes de despacho
2. **Seleccion de etapa** — selecciona la etapa especifica dentro de ese pipeline (ej. "Por Despachar")
3. **Credenciales** — usuario/contrasena del portal de la transportadora
4. **Toggle de activacion** — la transportadora solo esta activa cuando se habilita explicitamente

Esta configuracion se almacena en `carrier_configs`:
```typescript
{
  carrier: 'coordinadora',
  dispatch_pipeline_id: 'uuid-del-pipeline',
  dispatch_stage_id: 'uuid-de-la-etapa',
  portal_username: 'usuario@empresa.com',
  portal_password: '...',
  is_enabled: true
}
```

### Como los Comandos Usan la Config del Pipeline

Cuando un usuario ejecuta "subir ordenes coord":

1. `getDispatchStage(ctx, 'coordinadora')` lee el pipeline + etapa configurados
2. `getOrdersByStage(ctx, stageId)` obtiene todas las ordenes en esa etapa CRM
3. `getCarrierCredentials(ctx, 'coordinadora')` valida que las credenciales esten completas y la transportadora habilitada
4. Solo ordenes con ciudades de envio validas (segun `carrier_coverage`) se incluyen en el batch

### Ruta de la UI de Settings

`/settings/logistica` — accesible solo para owners del workspace. Muestra una card por transportadora con dropdowns de pipeline/etapa, campos de credenciales y toggle de activacion. Transportadoras futuras aparecen como cards placeholder deshabilitadas.

---

## Apendice: Variables de Entorno

| Variable | Donde | Proposito |
|----------|-------|-----------|
| `ROBOT_COORDINADORA_URL` | MorfX (Vercel) | URL base del servicio robot-coordinadora en Railway |
| `ROBOT_CALLBACK_SECRET` | MorfX (Vercel) + Robot (Railway) | Secreto HMAC compartido para autenticar requests de callback |
| `PORT` | Robot (Railway) | Puerto del servidor Express (Railway asigna, default 3001) |
| `INNGEST_EVENT_KEY` | MorfX (Vercel) | Event key de Inngest para enviar eventos |
| `NEXT_PUBLIC_APP_URL` | MorfX (Vercel) | Se usa para construir el callback URL para el robot |
