# Sistema Retroactivo para State Analyzer

**Estado:** 📋 Diseñado
**Prioridad:** Alta
**Fecha:** 2026-01-23

---

## Problema que Resuelve

State Analyzer detecta intents mensaje por mensaje, pero:
- No tiene visión global de la conversación
- No puede comparar con conversaciones exitosas
- No aprende de patrones que llevan a ventas

---

## Solución: Sistema Retroactivo

Un **agente supervisor** que trabaja junto a State Analyzer para:

1. **Ver la conversación desde un punto general** (no solo el último mensaje)
2. **Comparar con el protocolo de ventas** definido
3. **Validar con historial de conversaciones exitosas** (que sí convirtieron en venta)
4. **Retroalimentar** a State Analyzer si detecta desviaciones

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                      HISTORIAL V3                               │
│                                                                 │
│  Mensaje llega                                                  │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────┐    ┌─────────────────────────────────┐    │
│  │ STATE ANALYZER  │◄───│ SISTEMA RETROACTIVO             │    │
│  │                 │    │                                 │    │
│  │ Analiza:        │    │ Analiza:                        │    │
│  │ - Último mensaje│    │ - Conversación completa         │    │
│  │ - Intent actual │    │ - Comparación con protocolo     │    │
│  │                 │    │ - Historial de ventas exitosas  │    │
│  │                 │    │                                 │    │
│  │ Retorna:        │    │ Retorna:                        │    │
│  │ - intent        │    │ - validation: true/false        │    │
│  │ - new_mode      │    │ - correction: {...}             │    │
│  │ - confidence    │    │ - protocol_stage: "X"           │    │
│  └─────────────────┘    │ - similarity_score: 0.87        │    │
│       │                 └─────────────────────────────────┘    │
│       ▼                                                         │
│  Si hay corrección → Usa la corrección del Sistema Retroactivo │
│  Si no → Usa el output de State Analyzer                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componentes del Sistema Retroactivo

### 1. Analizador de Conversación Global

```json
Input: {
  "phone": "573137549286",
  "historial_completo": [
    {"role": "user", "content": "Hola"},
    {"role": "assistant", "content": "Hola! Bienvenido a Somnio..."},
    {"role": "user", "content": "Cuánto cuesta?"},
    {"role": "assistant", "content": "El precio es..."},
    {"role": "user", "content": "Ok, quiero comprar"}
  ],
  "ultimo_mensaje": "Ok, quiero comprar",
  "state_analyzer_output": {
    "intent": "compra",
    "new_mode": "collecting_data",
    "confidence": 0.92
  }
}
```

### 2. Comparador con Protocolo de Ventas

El protocolo de ventas tiene fases definidas:

| Fase | Descripción | Señales de entrada |
|------|-------------|-------------------|
| 1. Saludo | Cliente inicia contacto | "hola", "buenas", etc. |
| 2. Interés | Cliente pregunta por producto | "cuánto cuesta", "qué es", etc. |
| 3. Objeción | Cliente tiene dudas | "es muy caro", "no sé si funciona" |
| 4. Decisión | Cliente quiere comprar | "ok", "quiero", "me interesa" |
| 5. Datos | Captura de información | nombre, dirección, etc. |
| 6. Confirmación | Verificar pedido | "sí, todo bien" |
| 7. Cierre | Orden creada | - |

El sistema retroactivo detecta en qué fase está la conversación.

### 3. Comparador con Conversaciones Exitosas

```sql
-- Tabla de conversaciones de referencia
CREATE TABLE successful_conversations (
  id UUID PRIMARY KEY,
  phone VARCHAR,
  messages JSONB,  -- Array completo de mensajes
  converted BOOLEAN,  -- true = terminó en venta
  protocol_followed BOOLEAN,  -- true = siguió el protocolo correctamente
  metadata JSONB,
  created_at TIMESTAMP
);

-- Índice para búsqueda de similitud
CREATE INDEX idx_successful_conversations_converted
ON successful_conversations(converted)
WHERE converted = true;
```

---

## Flujo de Datos

### Input del Sistema Retroactivo

```json
{
  "phone": "573137549286",
  "historial_completo": [...],
  "ultimo_mensaje": "...",
  "state_analyzer_output": {
    "intent": "...",
    "new_mode": "...",
    "confidence": 0.XX
  },
  "current_session": {
    "mode": "...",
    "captured_data": {...},
    "bot_on": true
  }
}
```

### Output del Sistema Retroactivo

```json
{
  "validation": true,  // State Analyzer está correcto
  "correction": null,  // O: {"intent": "X", "new_mode": "Y"}
  "protocol_stage": "decision",  // Fase actual del protocolo
  "protocol_next_action": "solicitar_datos",  // Qué debería hacer Carolina
  "similarity_score": 0.87,  // Similitud con conversaciones exitosas
  "similar_conversations": ["conv_123", "conv_456"],
  "warnings": [],  // ["Cliente parece frustrado", "Posible objeción no atendida"]
  "recommendations": ["Ofrecer promoción", "Resolver objeción de precio"]
}
```

---

## Prompt del Sistema Retroactivo

```
Eres un supervisor de ventas que analiza conversaciones de WhatsApp.

Tu trabajo es:
1. Ver la conversación COMPLETA (no solo el último mensaje)
2. Determinar en qué fase del protocolo de ventas está
3. Validar si el análisis de State Analyzer es correcto
4. Comparar con conversaciones que SÍ terminaron en venta

Protocolo de ventas Somnio:
1. Saludo → Responder amablemente, presentar marca
2. Interés → Resolver dudas, dar precios
3. Objeción → Manejar con empatía, dar alternativas
4. Decisión → Confirmar intención de compra
5. Datos → Solicitar nombre, teléfono, dirección, ciudad
6. Confirmación → Verificar datos antes de crear orden
7. Cierre → Crear orden, agradecer

Conversaciones exitosas de referencia:
{EJEMPLOS_DE_CONVERSACIONES_QUE_CONVIRTIERON}

Conversación actual:
{HISTORIAL_COMPLETO}

Análisis de State Analyzer:
- Intent: {INTENT}
- Mode: {MODE}
- Confidence: {CONFIDENCE}

Responde en JSON:
{
  "validation": boolean,
  "correction": null | {intent, new_mode},
  "protocol_stage": string,
  "protocol_next_action": string,
  "similarity_score": number,
  "warnings": string[],
  "recommendations": string[]
}
```

---

## Integración con State Analyzer

### Opción A: En serie (recomendada para MVP)

```
1. State Analyzer analiza mensaje
2. Sistema Retroactivo valida/corrige
3. Historial usa el output final
```

### Opción B: En paralelo (recomendada para producción)

```
1. State Analyzer + Sistema Retroactivo corren en paralelo
2. Historial combina resultados:
   - Si ambos coinciden → usa State Analyzer
   - Si difieren → usa Sistema Retroactivo (tiene más contexto)
   - Loguear discrepancias para análisis posterior
```

---

## Tabla de Conversaciones de Referencia

```sql
-- Poblar con conversaciones exitosas
INSERT INTO successful_conversations (phone, messages, converted, protocol_followed, metadata)
SELECT
  phone,
  messages,
  true as converted,
  true as protocol_followed,
  jsonb_build_object(
    'order_id', order_id,
    'total_messages', jsonb_array_length(messages),
    'duration_minutes', EXTRACT(EPOCH FROM (last_message_at - created_at)) / 60
  ) as metadata
FROM sessions_v3 s
JOIN orders o ON s.phone = o.phone
WHERE o.created_at > s.created_at
  AND o.created_at < s.created_at + INTERVAL '24 hours';
```

---

## Métricas a Trackear

| Métrica | Descripción |
|---------|-------------|
| `validation_rate` | % de veces que Sistema Retroactivo valida a State Analyzer |
| `correction_rate` | % de veces que corrige |
| `protocol_adherence` | % de conversaciones que siguen protocolo |
| `similarity_to_success` | Promedio de similarity_score |
| `conversion_rate_pre_post` | Conversión antes/después de implementar |

---

## Implementación en n8n

### Workflow: Sistema Retroactivo

```
1. HTTP Webhook (input)
   ↓
2. PostgreSQL: Traer conversaciones exitosas similares
   ↓
3. Code: Preparar prompt con contexto
   ↓
4. Anthropic Claude: Analizar
   ↓
5. Code: Parsear respuesta
   ↓
6. Respond to Webhook (output)
```

### Modificación a Historial v3

```
Después de llamar a State Analyzer:
  ↓
Llamar a Sistema Retroactivo
  ↓
IF correction != null:
  Usar correction como output final
ELSE:
  Usar state_analyzer_output
```

---

## Próximos Pasos

1. [ ] Identificar 50-100 conversaciones exitosas para referencia
2. [ ] Crear tabla `successful_conversations`
3. [ ] Desarrollar workflow Sistema Retroactivo
4. [ ] Integrar con Historial v3
5. [ ] Probar con conversaciones de prueba
6. [ ] Medir métricas antes/después

---

*Documento parte del proyecto Modelo IA Distribuida*
