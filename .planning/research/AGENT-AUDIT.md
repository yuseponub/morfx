# Auditoría de Agentes Actuales

**Fuente:** https://github.com/yuseponub/AGENTES-IA-FUNCIONALES-v3
**Fecha:** 2026-02-04

---

## Resumen Ejecutivo

El sistema actual (v3DSL) es un bot conversacional autónomo para ventas vía WhatsApp, construido sobre n8n + PostgreSQL + Claude API. Gestiona el producto "Somnio" con alta eficiencia pero tiene limitaciones arquitectónicas que impiden escalar a multi-tenant y multi-canal.

**Fortalezas:**
- Arquitectura de microservicios bien definida
- Estado persistente en PostgreSQL (no stateless)
- Detección de intents sofisticada con Claude
- Sistema de interrupciones inteligente
- Automatizaciones proactivas funcionales

**Oportunidades de Mejora:**
- Single-tenant hardcodeado
- Templates en n8n (no externalizados)
- Sin canvas visual para configuración
- Dependencia de Playwright (lento)
- Sin métricas/analytics

---

## Sistema 1: Agentes de Ventas (v3DSL)

### Arquitectura General

```
WhatsApp → Callbell → Historial v3 (Orquestador)
                          ├→ State Analyzer (Claude: intents)
                          ├→ Data Extractor (Claude: 8 campos)
                          ├→ Order Manager (Bigin CRM)
                          ├→ Carolina v3 (respuestas)
                          ├→ Proactive Timer (automatizaciones)
                          └→ Snapshot (API estado)
                               ↓
                          PostgreSQL
```

### Workflow 1: Historial v3 (Orquestador Central)

**Función:** Único punto de entrada para mensajes de WhatsApp. Coordina todos los demás agentes.

**Flujo:**
1. Recibe webhook de Callbell
2. Valida mensaje (tags bloqueantes: WPP, P/W, RECO, bot_off)
3. Verifica antigüedad (<2 min)
4. Crea/actualiza sesión en PostgreSQL
5. Persiste mensaje con `callbell_message_id` único
6. Llama a State Analyzer → obtiene intent + modo
7. Si modo = `collecting_data` → llama Data Extractor
8. Si 8 campos completos → puede llamar Order Manager
9. Dispara Carolina v3 para respuesta

**Estado (JSONB):**
```json
{
  "nombre": "...", "apellido": "...", "telefono": "...",
  "direccion": "...", "barrio": "...", "ciudad": "...",
  "departamento": "...", "correo": "...",
  "pack": "1x|2x|3x", "precio": 77900,
  "_last_intent": "ofrecer_promos",
  "_intents_vistos": ["hola", "precio", "captura_datos_si_compra"],
  "order_created": true, "order_id": "..."
}
```

**Fortaleza:** Sistema de versionado para detectar interrupciones.
**Limitación:** Lógica hardcodeada para Somnio.

---

### Workflow 2: State Analyzer (Detector de Intents)

**Función:** Usa Claude Sonnet 4 para detectar intención del usuario.

**Intents Soportados:**

| Categoría | Intents |
|-----------|---------|
| Informacionales | `hola`, `precio`, `envio`, `modopago`, `ingredientes`, `funcionamiento`, `testimonios`, `garantia`, `otro` |
| Transaccionales | `captura_datos_si_compra`, `ofrecer_promos`, `resumen_1x`, `resumen_2x`, `resumen_3x`, `compra_confirmada` |
| Combinados | `hola+precio`, `hola+captura`, `precio+captura` |

**Validaciones de Transición:**
- `ofrecer_promos` SOLO si 8 campos completos
- `resumen_Xx` SOLO después de `ofrecer_promos` en historial
- `compra_confirmada` SOLO después de seleccionar pack

**Fortaleza:** Estado de conversación (machine state) bien diseñado.
**Limitación:** Intents hardcodeados, no configurables por tenant.

---

### Workflow 3: Data Extractor

**Función:** Extrae 8 campos personales de mensajes del usuario usando Claude.

**Campos:**
1. `nombre` - Nombre de pila
2. `apellido` - Apellido
3. `telefono` - Normalizado a 57XXXXXXXXXX
4. `direccion` - Dirección de entrega
5. `barrio` - Barrio/localidad
6. `ciudad` - Mapeado a nombre oficial colombiano
7. `departamento` - Mapeado a departamento oficial
8. `correo` - Email (opcional)

**Estrategia de Merge:**
- Nuevos valores sobrescriben existentes
- `null` = no encontrado (preserva anterior)
- `"N/A"` = usuario rechazó dar dato

**Fortaleza:** Normalización inteligente de ciudades colombianas.
**Limitación:** Campos fijos, no extensible.

---

### Workflow 4: Carolina v3 (Generador de Respuestas)

**Función:** Selecciona templates y envía mensajes con delays inteligentes.

**Flujo:**
1. Carga plantillas JSON por intent
2. Filtra duplicados (primeros 50 chars)
3. Sustituye variables `{{nombre}}`, `{{precio}}`
4. **Pre-check de interrupción** antes de cada mensaje
5. Si versión cambió → aborta secuencia
6. Envía vía Callbell API (texto o imagen)
7. Persiste mensaje saliente

**Sistema de Delays:**
- Min: 2 segundos entre mensajes
- Max: 6 segundos
- Configurable por template (`delay_s`)

**Fortaleza:** Detección de interrupciones evita spam.
**Limitación:** Templates en JSON dentro de n8n.

---

### Workflow 5: Order Manager

**Función:** Crea órdenes en Bigin CRM cuando se confirma compra.

**Validaciones:**
1. No existe orden activa últimos 3 días
2. 6 campos obligatorios presentes
3. No valores "N/A" ni vacíos

**Precios:**
- 1x = $77,900 COP
- 2x = $109,900 COP
- 3x = $139,900 COP

**Flujo:**
1. Prepara payload para Bigin
2. POST a Robot API (180s timeout)
3. Actualiza Callbell con tags
4. Actualiza PostgreSQL con `order_created`

**Limitación:** Depende de Robot API con Playwright (lento).

---

### Workflow 6: Proactive Timer

**Función:** Automatizaciones temporales para aumentar conversión.

**Triggers:**
| Tiempo | Condición | Acción |
|--------|-----------|--------|
| 10 min | Sin datos | Recordatorio inicial |
| 6 min | Datos parciales | Pedir campos faltantes |
| Inmediato | 8 campos OK | Disparar `ofrecer_promos` |
| 10 min | Post-promos sin respuesta | Auto-crear orden |

**Configuración:**
- Loop: cada 2 minutos
- Max: 20 iteraciones (40 min total)
- Idempotencia: flags `_action_*_sent`

**Fortaleza:** Aumenta conversión automáticamente.

---

### Workflow 7: Snapshot API

**Función:** API read-only para consultar estado de conversación.

**Retorna:**
- Sesión actual
- Últimos N mensajes
- Mensajes pendientes
- Versión actual

**Uso:** Carolina lo consulta para detectar interrupciones.

---

## Sistema 2: Robots de Logística

### Arquitectura

```
Slack (#bots) → n8n (Robots Logistica.json)
                  ├→ Bigin CRM (OAuth)
                  ├→ Claude API (data extraction)
                  ├→ robot-coordinadora:3001 (Playwright)
                  ├→ robot-inter-envia-bog:3002 (PDFKit/ExcelJS)
                  └→ ocr-guias-bot (Claude Vision)
                       ↓
                  Files: /opt/n8n/local-files/
                       ↓
                  Caddy (HTTPS) → Download links
```

### Workflow n8n: "Slack Sin Ordenes Inter Import"

**Trigger:** Comandos de Slack en #bots
**Función:** Orquesta los 4 carriers de logística

| Comando | Stage Bigin | Robot | Output |
|---------|-------------|-------|--------|
| `subir ordenes coord` | ROBOT COORD | robot-coordinadora | Guías web |
| `generar guias inter` | ROBOT INTER | robot-inter-envia | PDFs 4x6 |
| `generar guias bogota` | ROBOT BOGOTA | robot-inter-envia | PDFs |
| `generar excel envia` | ROBOT ENVIA | robot-inter-envia | Excel |

**Flujo:**
1. Slack trigger → Filtro de mensaje
2. Router (¿Qué Robot?)
3. Refresh OAuth token de Bigin
4. Query órdenes por stage
5. Claude API extrae/normaliza datos
6. Valida ciudades (robot-coordinadora)
7. Genera documentos (robot-inter-envia)
8. Actualiza Bigin con tracking
9. Notifica Slack con links de descarga

---

### Robot 1: robot-coordinadora (Puerto 3001)

**Tecnología:** Node.js + Express + Playwright
**Función:** Automatización web del portal ff.coordinadora.com

**Endpoints:**
| Método | Endpoint | Función |
|--------|----------|---------|
| GET | `/api/health` | Estado del servicio |
| GET | `/api/ultimo-pedido` | Último número de pedido |
| POST | `/api/validar-ciudad` | Valida municipio + COD |
| POST | `/api/crear-pedido` | Crea orden individual |
| POST | `/api/crear-pedidos-batch` | Batch de órdenes |

**Datos de Ciudad:**
- 1,488 municipios colombianos validados
- 1,181 soportan COD (contra-entrega)
- Archivos de texto estáticos

**Flujo de Creación:**
1. Request llega a Express
2. Lanza Chromium headless
3. Carga cookies o hace login
4. Navega al formulario
5. Llena campos con Playwright selectors
6. Detecta resultado via SweetAlert2
7. Cierra browser

**Limitaciones Críticas:**
- Browser por request (no persistente)
- Depende de selectores CSS del portal
- 2s delay entre órdenes batch
- Requiere mismo servidor que n8n (Docker 172.17.0.1)
- Login manual si cookies expiran

---

### Robot 2: robot-inter-envia-bog (Puerto 3002)

**Tecnología:** Node.js + Express + PDFKit + ExcelJS
**Función:** Generación directa de documentos (SIN browser)

**Endpoints:**
| Método | Endpoint | Función |
|--------|----------|---------|
| GET | `/api/health` | Estado del servicio |
| POST | `/api/generar-guias` | PDFs múltiples en 1 documento |
| POST | `/api/generar-excel-envia` | Excel para carga masiva |
| GET | `/api/download/:filename` | Descarga de archivo |

**Carriers Soportados:**
| Carrier | Formato | Tamaño |
|---------|---------|--------|
| Interrapidísimo | PDF | 4x6 pulgadas |
| Bogotá Courier | PDF | 4x6 pulgadas |
| Envía | Excel | Columnas estándar |

**Fortaleza:** Generación directa es ~100x más rápida que Playwright.

---

### Robot 3: ocr-guias-bot (Claude Vision)

**Tecnología:** Node.js + Claude Vision API
**Función:** OCR de fotos de guías de envío

**Formatos Soportados:** JPG, PNG, WebP, GIF

**Datos Extraídos:**
- Número de guía/tracking
- Nombre del destinatario
- Dirección de entrega
- Ciudad/municipio
- Teléfono de contacto
- Nombre del carrier

**Carriers Reconocidos:**
- Envía
- Coordinadora
- Interrapidísimo
- Servientrega

**Features:**
- Confidence scoring por campo
- Matching inteligente con órdenes en Bigin
- Validación de datos de envío
- Input: upload directo, base64, o URL remota

---

## Base de Datos Actual

### Tabla: sessions_v3

| Columna | Tipo | Descripción |
|---------|------|-------------|
| session_id | PK | `session_${phone}_${timestamp}` |
| phone | varchar | Normalizado 57... |
| contact_id | varchar | ID de Callbell |
| state | JSONB | Estado completo de conversación |
| version | int | Para detección de interrupciones |
| mode | varchar | `idle`, `collecting_data` |
| tags | text[] | Tags de Callbell |
| status | varchar | `active`, `closed` |

### Tabla: messages_v3

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | PK | Serial |
| session_id | FK | Referencia a sesión |
| role | varchar | `user`, `assistant` |
| content | text | Contenido del mensaje |
| direction | varchar | `inbound`, `outbound` |
| callbell_message_id | UNIQUE | Deduplicación |
| intent | varchar | Intent detectado |

---

## Limitaciones Identificadas para MVP v2

### Críticas (Bloquean multi-tenant)

1. **Single-tenant hardcodeado**
   - Producto Somnio fijo en prompts
   - Precios hardcodeados
   - Templates específicos

2. **Sin configuración visual**
   - Intents definidos en código n8n
   - Templates en JSON dentro de workflows
   - No hay UI para modificar comportamiento

3. **Dependencia de n8n**
   - Lógica distribuida en múltiples workflows
   - Difícil de testear unitariamente
   - No hay control de versiones real del comportamiento

### Moderadas (Afectan escalabilidad)

4. **Sin caching**
   - Cada snapshot query = hit a DB
   - Prompts de Claude rebuildeados cada vez

5. **Playwright para Bigin**
   - 180s timeouts
   - Frágil ante cambios de UI
   - No hay API directa

6. **Sin métricas**
   - No hay dashboard de conversiones
   - No hay tracking de costos Claude
   - No hay A/B testing

### Menores (Nice to have)

7. Templates no versionados
8. Sin multi-canal
9. Sin webhooks salientes

---

## Recomendaciones para MVP v2

### Qué Preservar

1. **Arquitectura de Estado** - El modelo de sesión con JSONB es sólido
2. **Sistema de Interrupciones** - Versionado + pre-check funciona bien
3. **Flujo de Intents** - La máquina de estados está bien diseñada
4. **Proactive Timer** - El concepto de automatizaciones temporales es valioso

### Qué Transformar

1. **Configuración → Base de datos**
   - Intents configurables por tenant
   - Templates en DB, no en código
   - Precios/productos dinámicos

2. **n8n → Código propio**
   - Lógica en TypeScript controlado
   - Testing unitario posible
   - Versionado con Git

3. **Bigin Robot → Action DSL**
   - Usar MorfX CRM directamente
   - Sin Playwright
   - Operaciones atómicas logueadas

4. **Visibilidad → Canvas + Dashboard**
   - Ver flujo de agente visualmente
   - Métricas en tiempo real
   - Costos de Claude por conversación

### Estructura Propuesta para Agentes en MorfX

```
Agent Definition (DB)
├── system_prompt (configurable)
├── intents[] (configurables)
├── tools[] (del Action DSL)
├── transitions[] (máquina de estados)
└── templates[] (por intent)

Agent Runtime (Code)
├── Session Manager (estado en Supabase)
├── Intent Detector (Claude API)
├── Tool Executor (Action DSL existente)
├── Response Generator (templates + Claude)
└── Timer Manager (automatizaciones)
```

---

## Métricas del Sistema Actual

| Métrica | Valor |
|---------|-------|
| Workflows n8n Ventas | 7 |
| Workflows n8n Logística | 1 (orquesta 4 carriers) |
| Robots Node.js | 3 (coordinadora, inter-envia, ocr) |
| Intents soportados | 17 |
| Campos de datos cliente | 8 |
| Municipios validados | 1,488 |
| Municipios con COD | 1,181 |
| Carriers soportados | 4 (Coordinadora, Inter, Bogotá, Envía) |
| Puertos usados | 3001, 3002 |
| Documentación | ~200KB |

## Resumen: Qué Migrar a MorfX

### Sistema de Ventas (Prioridad ALTA)

| Componente | Acción | Destino en MorfX |
|------------|--------|------------------|
| Historial v3 | Reimplementar | Agent Session Manager |
| State Analyzer | Reimplementar | Intent Detector (Claude API) |
| Data Extractor | Reimplementar | Field Extractor Tool |
| Carolina v3 | Reimplementar | Response Generator |
| Order Manager | Eliminar | Ya existe en MorfX CRM |
| Proactive Timer | Reimplementar | Timer/Automation Manager |
| Snapshot | Reimplementar | Session Query API |

### Robots de Logística (Prioridad MEDIA)

| Robot | Acción | Notas |
|-------|--------|-------|
| robot-coordinadora | Mantener separado | Playwright es específico, difícil de integrar |
| robot-inter-envia | Integrar como Tool | PDFKit/ExcelJS portable |
| ocr-guias-bot | Integrar como Tool | Claude Vision fácil de mover |

### Lo que NO Migrar

- Bigin integración (MorfX lo reemplaza)
- Callbell-specific code (360dialog lo reemplaza)
- n8n workflow JSONs (código propio lo reemplaza)

---

*Auditoría completada: 2026-02-04*
