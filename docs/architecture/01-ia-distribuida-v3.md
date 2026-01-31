# Arquitectura IA Distribuida v3

**Actualizado:** 2026-01-23

---

## Principios de Diseño (DSL)

| Principio | Descripción |
|-----------|-------------|
| **Separación de Responsabilidades** | Cada workflow = 1 tarea |
| **Single Source of Truth** | Solo Historial escribe a PostgreSQL |
| **Funciones Puras** | Workflows sin side effects (reciben input, retornan output) |
| **Orquestador Central** | Historial coordina todo el flujo |

---

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      HISTORIAL V3                               │
│              (Orquestador + ÚNICO que escribe PostgreSQL)       │
│                                                                 │
│  Mensaje llega → Guarda mensaje                                 │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ STATE ANALYZER  │──► Retorna: {intent, new_mode}            │
│  │ (siempre corre) │    NO escribe PostgreSQL                  │
│  └─────────────────┘                                           │
│       │                                                         │
│       │ Historial GUARDA mode en PostgreSQL                    │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ DATA EXTRACTOR  │──► Retorna: {captured_data}               │
│  │ (si mode=       │    NO escribe PostgreSQL                  │
│  │  collecting_data│                                           │
│  └─────────────────┘                                           │
│       │                                                         │
│       │ Historial GUARDA captured_data en PostgreSQL           │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ CAROLINA        │──► Retorna: {response, should_create}     │
│  │ (si bot_on)     │    NO escribe PostgreSQL                  │
│  └─────────────────┘                                           │
│       │                                                         │
│       │ Historial GUARDA respuesta en PostgreSQL               │
│       ▼                                                         │
│  ┌─────────────────┐                                           │
│  │ ORDER MANAGER   │──► Retorna: {order_id, success}           │
│  │ (si should_     │    Solo escribe a Bigin (externo)         │
│  │  create_order)  │                                           │
│  └─────────────────┘                                           │
│       │                                                         │
│       │ Historial GUARDA order_created en PostgreSQL           │
│       ▼                                                         │
│  FIN                                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PROACTIVE TIMER                              │
│              (Proceso independiente cada 1 min)                 │
│                                                                 │
│  Consulta sesiones inactivas > 6 min                           │
│       │                                                         │
│       ▼                                                         │
│  Envía recordatorio pidiendo datos faltantes                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Responsabilidades por Componente

| Workflow | Qué hace | Qué NO hace | ¿Cuándo corre? |
|----------|----------|-------------|----------------|
| **Historial** | Orquesta flujo, escribe PostgreSQL | Lógica de negocio | Siempre |
| **State Analyzer** | Detecta intents, decide mode | Escribir DB | Siempre |
| **Data Extractor** | Parsea y extrae datos del mensaje | Escribir DB, cambiar mode | Si mode=collecting_data |
| **Carolina** | Genera respuestas conversacionales | Escribir DB, guardar datos | Si bot_on |
| **Order Manager** | Crea órdenes en Bigin | Escribir PostgreSQL | Si should_create_order |
| **Proactive Timer** | Envía recordatorios automáticos | - | Cada 1 min (cron) |

---

## Flujo de Datos (Input/Output)

### STATE ANALYZER
```json
Input:  {
  "phone": "573137549286",
  "message": "Hola, cuánto cuesta?",
  "historial": [...],
  "current_mode": "conversational"
}

Output: {
  "intent": "precio",
  "new_mode": "conversational",
  "confidence": 0.95
}
```

### DATA EXTRACTOR
```json
Input:  {
  "phone": "573137549286",
  "message": "Soy Juan Pérez, vivo en Calle 123",
  "current_captured_data": {}
}

Output: {
  "captured_data": {
    "nombre": "Juan Pérez",
    "direccion": "Calle 123"
  },
  "is_complete": false
}
```

### CAROLINA
```json
Input:  {
  "phone": "573137549286",
  "message": "Quiero comprar",
  "intent": "compra",
  "captured_data": {...},
  "historial": [...]
}

Output: {
  "response_text": "Perfecto! Para procesar tu pedido...",
  "should_create_order": false,
  "should_respond": true
}
```

### ORDER MANAGER
```json
Input:  {
  "captured_data": {
    "nombre": "Juan Pérez",
    "telefono": "573137549286",
    "direccion": "Calle 123",
    "ciudad": "Bogotá",
    "producto": "Somnio x3"
  }
}

Output: {
  "order_id": "ORD-12345",
  "success": true,
  "error": null
}
```

---

## Cuándo Carolina Responde

| Situación | ¿Responde? | Acción |
|-----------|------------|--------|
| intent=capture_data, datos incompletos | ❌ NO | Proactive Timer pide después de 6min |
| intent=capture_data, datos completos (sin promo) | ✅ SÍ | Ofrece promos |
| intent=capture_data, datos completos + promo | ✅ SÍ | Confirma orden |
| intent=pregunta | ✅ SÍ | Responde pregunta |
| intent=saludo | ✅ SÍ | Saluda |
| bot_off | ❌ NO | Silencio (pero State Analyzer sí corre) |

---

## Beneficios de esta Arquitectura

| Beneficio | Descripción |
|-----------|-------------|
| **Mantenibilidad** | Cambiar un workflow no afecta otros |
| **Testeabilidad** | Cada workflow se prueba aislado |
| **Escalabilidad** | Agregar nuevos workflows es fácil |
| **Debugging** | Un solo lugar donde mirar logs (Historial) |
| **Consistencia** | Sin race conditions (un solo escritor) |
| **Flexibilidad** | State Analyzer corre aunque bot esté OFF |

---

## Extensiones Futuras

### Sistema Retroactivo
Ver: `02-sistema-retroactivo.md`

### Carolina Logística
Ver: `03-carolina-logistica.md`

---

*Documento parte del proyecto Modelo IA Distribuida*
