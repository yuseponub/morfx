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
Slack (#bots) → n8n → Bigin CRM
                  ├→ robot-coordinadora (Playwright)
                  ├→ robot-inter-envia-bog (PDFKit/ExcelJS)
                  └→ ocr-guias-bot (Claude Vision)
                       ↓
                  Files: /opt/n8n/local-files/
                       ↓
                  Caddy (HTTPS)
```

### Robot: Coordinadora

**Tecnología:** Playwright (automatización web)
**Función:** Crear guías en portal de Coordinadora
**Base de datos:** 1,488 municipios colombianos validados
**Timeout:** 180 segundos

**Limitación:** Browser automation es frágil y lento.

### Robot: Inter-Envía-Bog

**Tecnología:** Node.js + PDFKit + ExcelJS
**Puerto:** 3002
**Funciones:**
- Generar PDFs 4x6 para Interrapidísimo
- Generar PDFs para Bogotá Courier
- Exportar Excel para Envía

**Fortaleza:** Generación directa sin browser.

### Robot: OCR Guías

**Tecnología:** Claude Vision API
**Función:** Extraer datos de fotos de guías de envío

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
| Workflows n8n | 7 (ventas) + 3 (logística) |
| Intents soportados | 17 |
| Campos de datos | 8 |
| Robots Node.js | 3 |
| Líneas de documentación | ~150KB |

---

*Auditoría completada: 2026-02-04*
