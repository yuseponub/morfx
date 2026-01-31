# Carolina Logística - Chatbot Interno

**Estado:** 📋 Diseñado
**Prioridad:** Alta
**Fecha:** 2026-01-23

---

## Problema que Resuelve

Los **Agentes Logísticos** ya tienen workflows funcionales en n8n que hacen gran parte del trabajo:
- Procesamiento de guías
- Gestión de inventario
- Tracking de envíos
- Actualización de estados

Pero actualmente estos flujos se ejecutan manualmente o por triggers automáticos.

**La solución:** Un chatbot interno llamado **Carolina Logística** que:
- Recibe instrucciones de los trabajadores internos (hosts)
- Interpreta el request en lenguaje natural
- Ejecuta los workflows correspondientes
- Recibe y procesa archivos (Excel, CSV, PDFs)
- Reporta resultados

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    CAROLINA LOGÍSTICA                           │
│              (Chatbot Interno para Operaciones)                 │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    INTERFAZ                              │   │
│  │  • WhatsApp interno (grupo de operaciones)               │   │
│  │  • Slack/Discord (opcional)                              │   │
│  │  • Panel web MorfX (futuro)                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ORQUESTADOR CAROLINA                        │   │
│  │                                                          │   │
│  │  1. Recibe mensaje + archivos del host                   │   │
│  │  2. Analiza intent (qué quiere hacer)                    │   │
│  │  3. Identifica workflow(s) a ejecutar                    │   │
│  │  4. Prepara parámetros                                   │   │
│  │  5. Ejecuta workflow(s)                                  │   │
│  │  6. Reporta resultado al host                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WORKFLOWS DISPONIBLES                       │   │
│  │                                                          │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐ │   │
│  │  │ Procesar      │  │ Actualizar    │  │ Generar      │ │   │
│  │  │ Guías         │  │ Inventario    │  │ Reportes     │ │   │
│  │  └───────────────┘  └───────────────┘  └──────────────┘ │   │
│  │                                                          │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐ │   │
│  │  │ Tracking      │  │ Notificar     │  │ Sincronizar  │ │   │
│  │  │ Envíos        │  │ Clientes      │  │ CRM          │ │   │
│  │  └───────────────┘  └───────────────┘  └──────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Casos de Uso

### 1. Procesar Archivo de Guías

**Host:** *"Carolina, procesa este archivo de guías de hoy"* + [archivo.xlsx]

**Carolina:**
1. Detecta intent: `procesar_guias`
2. Recibe archivo Excel
3. Ejecuta workflow `Procesar Guías`
4. Responde: *"Listo! Procesé 45 guías. 42 exitosas, 3 con errores (ver detalle)"*

### 2. Consultar Estado de Envío

**Host:** *"¿Cómo va el pedido de Juan Pérez?"*

**Carolina:**
1. Detecta intent: `consultar_envio`
2. Extrae: cliente = "Juan Pérez"
3. Ejecuta workflow `Tracking Envíos`
4. Responde: *"El pedido de Juan Pérez (ORD-12345) está en tránsito. Guía: 999888777. Última actualización: hoy 10:30am - En camino al destino."*

### 3. Generar Reporte

**Host:** *"Dame el reporte de envíos de esta semana"*

**Carolina:**
1. Detecta intent: `generar_reporte`
2. Parámetros: tipo = "envíos", periodo = "esta semana"
3. Ejecuta workflow `Generar Reportes`
4. Responde: *"Aquí está el reporte de envíos de esta semana"* + [reporte.pdf]

### 4. Actualizar Inventario

**Host:** *"Ingresa 100 unidades de Somnio x3 al inventario"*

**Carolina:**
1. Detecta intent: `actualizar_inventario`
2. Extrae: producto = "Somnio x3", cantidad = 100, acción = "ingreso"
3. Ejecuta workflow `Actualizar Inventario`
4. Responde: *"Listo! Ingresé 100 unidades de Somnio x3. Stock actual: 250 unidades."*

### 5. Notificar Clientes en Lote

**Host:** *"Notifica a todos los clientes con envío despachado hoy que su pedido va en camino"*

**Carolina:**
1. Detecta intent: `notificar_clientes`
2. Filtro: estado = "despachado", fecha = "hoy"
3. Ejecuta workflow `Notificar Clientes`
4. Responde: *"Listo! Envié 23 notificaciones a clientes con pedidos despachados hoy."*

---

## Intents Soportados

| Intent | Descripción | Workflow(s) | Requiere archivo |
|--------|-------------|-------------|------------------|
| `procesar_guias` | Cargar y procesar archivo de guías | Procesar Guías | ✅ Sí |
| `consultar_envio` | Ver estado de un envío específico | Tracking Envíos | ❌ No |
| `actualizar_inventario` | Agregar/restar stock | Actualizar Inventario | ❌ No (opcional) |
| `generar_reporte` | Crear reporte de operaciones | Generar Reportes | ❌ No |
| `notificar_clientes` | Enviar notificaciones masivas | Notificar Clientes | ❌ No |
| `sincronizar_crm` | Sincronizar datos con CRM | Sincronizar CRM | ❌ No |
| `buscar_orden` | Buscar orden por criterio | - | ❌ No |
| `ayuda` | Mostrar comandos disponibles | - | ❌ No |

---

## Flujo de Datos

### Input de Carolina Logística

```json
{
  "host": {
    "phone": "573001234567",
    "name": "Maria Operaciones",
    "role": "logistics_agent"
  },
  "message": "Procesa este archivo de guías",
  "attachments": [
    {
      "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "filename": "guias_2026-01-23.xlsx",
      "url": "https://cdn.callbell.com/attachments/xxx"
    }
  ],
  "channel": "whatsapp_internal",
  "timestamp": "2026-01-23T14:30:00Z"
}
```

### Output del Intent Analyzer

```json
{
  "intent": "procesar_guias",
  "confidence": 0.95,
  "parameters": {
    "file_type": "excel",
    "file_url": "https://cdn.callbell.com/attachments/xxx"
  },
  "workflow_to_execute": "Procesar Guías",
  "requires_confirmation": false
}
```

### Output del Workflow

```json
{
  "success": true,
  "summary": {
    "total_processed": 45,
    "successful": 42,
    "errors": 3
  },
  "errors": [
    {"row": 12, "error": "Guía duplicada"},
    {"row": 28, "error": "Ciudad no válida"},
    {"row": 41, "error": "Teléfono inválido"}
  ],
  "message_to_host": "Listo! Procesé 45 guías. 42 exitosas, 3 con errores."
}
```

---

## Prompt del Intent Analyzer

```
Eres Carolina, asistente de operaciones logísticas de Somnio.

Tu trabajo es interpretar los mensajes de los trabajadores internos y determinar qué acción ejecutar.

Acciones disponibles:
1. procesar_guias - Procesar archivo de guías de transporte
2. consultar_envio - Consultar estado de un envío
3. actualizar_inventario - Agregar o restar stock
4. generar_reporte - Crear reportes de operaciones
5. notificar_clientes - Enviar notificaciones masivas
6. sincronizar_crm - Sincronizar con CRM
7. buscar_orden - Buscar orden por criterio
8. ayuda - Mostrar comandos disponibles

Mensaje del host: {MESSAGE}
Archivos adjuntos: {ATTACHMENTS}

Responde en JSON:
{
  "intent": string,
  "confidence": number (0-1),
  "parameters": object,
  "workflow_to_execute": string | null,
  "requires_confirmation": boolean,
  "clarification_needed": string | null
}

Si no entiendes el mensaje, pide clarificación.
```

---

## Arquitectura n8n

### Workflow Principal: Carolina Logística

```
1. Webhook: Recibe mensaje + archivos
   ↓
2. Anthropic Claude: Analiza intent
   ↓
3. Switch: Según intent
   │
   ├─► procesar_guias ──► Execute Workflow: Procesar Guías
   ├─► consultar_envio ──► Execute Workflow: Tracking Envíos
   ├─► actualizar_inventario ──► Execute Workflow: Actualizar Inventario
   ├─► generar_reporte ──► Execute Workflow: Generar Reportes
   ├─► notificar_clientes ──► Execute Workflow: Notificar Clientes
   └─► ayuda ──► Responder con lista de comandos
   │
   ▼
4. Merge: Combinar resultados
   ↓
5. Callbell/WhatsApp: Enviar respuesta al host
```

---

## Permisos y Roles

| Rol | Puede hacer |
|-----|-------------|
| `logistics_agent` | Consultar, procesar guías, generar reportes |
| `logistics_manager` | Todo + actualizar inventario, notificar clientes |
| `admin` | Todo + sincronizar CRM, configurar workflows |

```json
// Verificación de permisos
{
  "host_role": "logistics_agent",
  "intent": "actualizar_inventario",
  "allowed": false,
  "message": "No tienes permisos para actualizar inventario. Contacta a tu supervisor."
}
```

---

## Manejo de Archivos

### Tipos soportados

| Tipo | Extensiones | Uso |
|------|-------------|-----|
| Excel | .xlsx, .xls | Guías, inventario, reportes |
| CSV | .csv | Importación/exportación masiva |
| PDF | .pdf | Documentos, facturas |
| Imagen | .jpg, .png | Comprobantes, fotos |

### Procesamiento

```javascript
// Ejemplo de procesamiento de Excel
const workbook = XLSX.read(fileBuffer);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

// Validar estructura
const requiredColumns = ['guia', 'cliente', 'direccion', 'ciudad'];
const missingColumns = requiredColumns.filter(col => !data[0].hasOwnProperty(col));

if (missingColumns.length > 0) {
  return {
    success: false,
    error: `Faltan columnas: ${missingColumns.join(', ')}`
  };
}
```

---

## Respuestas de Carolina

### Estilo de comunicación

- Profesional pero amigable
- Concisa (no más de 2-3 oraciones por respuesta)
- Siempre reporta resultado numérico cuando aplica
- Ofrece más detalles si hay errores

### Ejemplos

**Éxito simple:**
> Listo! Procesé 45 guías exitosamente.

**Éxito con métricas:**
> Reporte generado! Esta semana: 234 envíos, 98% entregados, 2% en tránsito.

**Error parcial:**
> Procesé 42 de 45 guías. 3 errores:
> - Fila 12: Guía duplicada
> - Fila 28: Ciudad no válida
> - Fila 41: Teléfono inválido

**Necesita clarificación:**
> ¿De qué periodo quieres el reporte? Opciones: hoy, esta semana, este mes.

**Sin permisos:**
> No tienes permisos para esta acción. Contacta a tu supervisor.

---

## Integración con Panel MorfX (Futuro)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PANEL MORFX                                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  💬 Carolina Logística                              [_][x] │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │                                                          │  │
│  │  Maria: Procesa las guías de hoy [📎 guias.xlsx]        │  │
│  │                                                          │  │
│  │  Carolina: Listo! Procesé 45 guías. 42 exitosas.        │  │
│  │           [Ver detalle de errores]                       │  │
│  │                                                          │  │
│  │  Maria: Dame el reporte de envíos de la semana          │  │
│  │                                                          │  │
│  │  Carolina: Aquí está! [📄 reporte.pdf]                  │  │
│  │           234 envíos, 98% entregados.                   │  │
│  │                                                          │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  [📎] Escribe un mensaje...                    [Enviar]  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Próximos Pasos

1. [ ] Definir lista completa de workflows disponibles en Agentes Logísticos
2. [ ] Crear workflow orquestador en n8n
3. [ ] Configurar canal de WhatsApp interno (o Slack)
4. [ ] Implementar manejo de archivos Excel/CSV
5. [ ] Probar con equipo de operaciones
6. [ ] Documentar comandos disponibles

---

*Documento parte del proyecto Modelo IA Distribuida*
