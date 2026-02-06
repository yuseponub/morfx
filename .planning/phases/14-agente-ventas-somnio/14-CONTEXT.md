# Phase 14: Agente Ventas Somnio - Context

**Gathered:** 2026-02-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementar el agente de ventas de Somnio en TypeScript usando el AgentEngine de fase 13. El agente detecta intents, extrae datos del cliente, maneja el flujo conversacional con templates, y crea contactos/órdenes en MorfX. Replicar el comportamiento actual de n8n.

</domain>

<decisions>
## Implementation Decisions

### Lista de Intents (20 totales)

**Intents informativos (13):**
- `hola` — Saludo inicial
- `precio` — Consulta precio ($77,900, combos 2x/3x)
- `info_promociones` — Información de paquetes
- `contenido_envase` — 90 comprimidos melatonina+magnesio
- `como_se_toma` — 1 comprimido 30min antes de dormir
- `modopago` — Contraentrega en efectivo
- `metodos_de_pago` — 3 opciones (contraentrega, transferencia, tarjeta)
- `modopago2` — Confirmación específica contraentrega
- `envio` — Cobertura nacional gratis
- `invima` — Registro sanitario PHARMA SOLUTIONS SAS
- `ubicacion` — Bucaramanga, Santander
- `contraindicaciones` — Componentes seguros
- `sisirve` — Pregunta sobre efectividad

**Intents de flujo de compra (6):**
- `captura_datos_si_compra` — Cliente quiere comprar, iniciar captura
- `ofrecer_promos` — Mostrar packs (auto cuando datos completos)
- `resumen_1x` / `resumen_2x` / `resumen_3x` — Confirmación de pack seleccionado
- `compra_confirmada` — Cliente confirma compra
- `no_confirmado` — Cliente duda o rechaza
- `no_interesa` — Sin interés

**Intent de escape:**
- `fallback` — Derivar a humano

**Combinaciones con hola (11):**
- `hola+precio`, `hola+como_se_toma`, `hola+envio`, `hola+modopago`
- `hola+ubicacion`, `hola+contenido_envase`, `hola+invima`
- `hola+contraindicaciones`, `hola+sisirve`, `hola+info_promociones`
- `hola+captura_datos_si_compra`

**Reglas de transición:**
- `resumen_*` requiere haber visto `ofrecer_promos` antes
- `compra_confirmada` requiere haber visto un `resumen_*` antes
- `ofrecer_promos` se auto-activa cuando 8 campos completos (flujo normal)
- `ofrecer_promos` via Inngest timer si 5 críticos + 2min sin actividad
- Pack detectado ("quiero el 2x") → auto-convierte a `resumen_2x`

### Datos del Cliente (9 campos)

**Campos críticos para pedido (5):**
- `nombre` — Nombre completo
- `telefono` — Normalizar a 57XXXXXXXXXX
- `direccion` — Calle/Carrera + número
- `ciudad` — Normalizar (bogota → Bogotá)
- `departamento` — Inferir de ciudad si posible (Bogotá → Cundinamarca)

**Campos adicionales (4):**
- `apellido` — Capturar si lo da
- `barrio` — Capturar si lo da
- `correo` — Capturar si lo da, "N/A" si niega
- `indicaciones_extra` — Referencias, apto, edificio, instrucciones

**Comportamiento inteligente del Data Extractor:**
- Inferir departamento de ciudad conocida
- Normalizar direcciones (cll → Calle, cra → Carrera)
- Normalizar teléfono (quitar espacios, agregar 57)
- Detectar negaciones ("no tengo correo" → correo = "N/A")
- Capturar TODOS los datos que el cliente proporcione, no solo los críticos

**Triggers para ofrecer_promos:**
1. Flujo normal: 8 campos completos → inmediato
2. Timer Inngest: 5 críticos + 2min sin actividad → proactivo

### Flujo de Templates

**Storage:** Tabla `agent_templates` en Supabase (editable sin deploy)

**Estructura de combinaciones:**
- Cada intent mapea a lista de templates
- `primera_vez` — Respuesta completa (3-4 mensajes)
- `siguientes` — Respuesta simplificada (1-2 mensajes)
- Cada template tiene `delay_s` (0-5 segundos)

**Tipos de contenido:**
- `texto` — Mensaje directo vía 360dialog
- `template` — Imagen via URL directa (dentro de ventana 24h)

**Precios hardcodeados:**
- 1x: $77,900
- 2x: $109,900
- 3x: $139,900

### Comportamiento de Delays e Interrupciones

**Delays entre mensajes:**
- Cada template tiene `delay_s` configurado
- Rango: 0s a 5s típicamente
- Simula conversación natural

**Detección de interrupción:**
- Si cliente envía mensaje durante secuencia → ABORTAR envío
- Recordar mensajes pendientes que faltaban
- Nueva respuesta PRIMERO, luego pendientes complementarios

**Ejemplo:**
```
Secuencia: [hola ✓] [precio ✓] [tiempoefecto ⏳] [modopago ⏳]
Cliente: "¿envían a Medellín?"
Respuesta: [/envio] + [tiempoefecto] + [modopago]
```

### Claude's Discretion

- Estructura interna de tablas de templates
- Implementación específica del mecanismo de abort/pendientes
- Formato exacto del system prompt para intent detection
- Caching de templates en memoria

</decisions>

<specifics>
## Specific Ideas

**Referencia de implementación:**
- Repo: `yuseponub/AGENTES-IA-FUNCIONALES-v3`
- State Analyzer: `workflows/03-state-analyzer.json`
- Data Extractor: `workflows/04-data-extractor.json`
- Carolina: `docs/02-CAROLINA-V3.md`
- Templates: `plantillas/mensajes.json`, `plantillas/intents.json`

**Arquitectura n8n a replicar:**
```
Historial V3 (orquestador)
    → State Analyzer (intent + mode)
    → Data Extractor (si mode=collecting_data)
    → Carolina (selección templates + respuesta)
    → Order Manager (si compra_confirmada)
```

</specifics>

<deferred>
## Deferred Ideas

- **Canvas visual para configurar agentes** — v2.1+
- **UI para editar templates** — Post-MVP, por ahora editar en Supabase Studio
- **Precios configurables por workspace** — Por ahora hardcodeados
- **Sistema retroactivo (supervisor)** — Documentado en `02-sistema-retroactivo.md`, diferido

</deferred>

---

*Phase: 14-agente-ventas-somnio*
*Context gathered: 2026-02-06*
