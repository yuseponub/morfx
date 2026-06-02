# Standalone: v3-tiempo-entrega - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `tiempo_entrega` as informational intent to Somnio v3 agent. When a customer asks about delivery time, the agent looks up the delivery zone for the city and responds with the estimated time. Order confirmation template is personalized by zone. Requires a `delivery_zones` table with municipality-to-zone mapping.

</domain>

<decisions>
## Implementation Decisions

### Intent: tiempo_entrega
- Informational intent (like precio, envio) — does NOT affect sales state machine
- Added to V3_INTENTS + INFORMATIONAL_INTENTS in constants.ts
- Comprehension uses bot context to disambiguate city (same pattern as "si" disambiguation)
- Ciudad always goes to state — zero new schema fields
- 1 guard in sales-track: skip auto-trigger (datosCompletosJustCompleted) when intent is informational

### Delivery Zones
- **same_day:** Bucaramanga, Giron, Piedecuesta, Floridablanca (antes 2:30PM) + Bogota (antes 9AM) — domiciliario propio
- **next_day:** Medellin+area metropolitana, Barranquilla+area metropolitana, Cali+area metropolitana, Bogota area metropolitana (antes 3PM) — transportadora
- **1_3_days:** Ciudades principales del pais + municipios de area metropolitana + pueblos principales (no remotos) — transportadora
- **2_4_days:** Resto del pais — transportadora
- "Aledanos" = municipios que pertenezcan al area metropolitana de cada ciudad
- Clasificacion 1-3 vs 2-4: investigar a fondo criterios reales (ciudades principales, pueblos principales, conectividad) — research-phase debe definir la lista completa

### Hora de corte same_day
- Se evalua con la hora actual al momento de responder (America/Bogota)
- Si pasa la hora de corte → "tu pedido llega MANANA [DIA]"
- Si manana es domingo → "tu pedido llega el LUNES"

### Response: tiempo_entrega sin ciudad
- Template fijo: "En que municipio te encuentras? El tiempo de entrega depende de tu ubicacion."
- Cliente responde con ciudad → comprehension clasifica como tiempo_entrega (bot context) → guarda ciudad → lookup → responde

### Response: tiempo_entrega con ciudad
- Formato: "Tu pedido estaria llegando a [ciudad] en [tiempo]"
- same_day antes de corte: "Tu pedido estaria llegando a [ciudad] HOY mismo"
- same_day despues de corte: "Tu pedido estaria llegando a [ciudad] MANANA MISMO" (o "el LUNES" si manana es domingo)
- next_day: "Tu pedido estaria llegando a [ciudad] al dia siguiente"
- 1_3_days: "Tu pedido estaria llegando a [ciudad] en 1-3 dias habiles"
- 2_4_days: "Tu pedido estaria llegando a [ciudad] en 2-4 dias habiles"

### Template confirmacion_orden personalizado por zona
- Siempre 2 templates (CORE + COMPLEMENTARIA con 3s delay)
- **CORE same_day (domiciliario propio):**
  - "Perfecto! Tu pedido llega HOY mismo. Nuestro domiciliario se comunicara contigo para la entrega" (o MANANA [DIA] / LUNES si aplica)
  - Sin mencion de guia ni transportadora
- **CORE transportadora (next_day, 1-3, 2-4):**
  - Template actual + tiempo estimado segun zona
  - "Perfecto! Tu pedido estaria llegando en [tiempo]. Una vez entreguemos el pedido en transportadora te enviaremos la guia de tu producto"
- **COMPLEMENTARIA (siempre igual):**
  - "Recuerda tener el efectivo listo el dia que te llegue el pedido para que puedas recibir tu compra. En caso de que no te vayas a encontrar en tu casa dejarselo a alguien para que lo reciba"

### Carrier
- same_day: "domiciliario propio" — no se menciona nombre de transportadora
- Resto: "transportadora" generico — no se menciona nombre especifico

### Proteccion descartada
- NO proteger sobreescritura de ciudad en intent informacional (caso 1/500, irrelevante)

### Claude's Discretion
- Exact wording of comprehension prompt rules for tiempo_entrega
- How to structure the delivery_zones lookup function
- Template variable substitution mechanism for zone-based confirmation

</decisions>

<specifics>
## Specific Ideas

- "Tratar ciudad como si" — comprehension ya usa bot context para desambiguar tokens como "si", ciudad funciona igual
- deliveryCity para lookup = analysis.extracted_fields.ciudad ?? state.datos.ciudad (turno actual tiene prioridad para lookup, pero state solo se guarda si no existia)
- Research-phase debe investigar a fondo cuales municipios son "ciudades principales", "pueblos principales" vs "resto" para la clasificacion 1-3 vs 2-4 dias

</specifics>

<deferred>
## Deferred Ideas

- Personalizar carrier por zona (ej: Interrapidisimo para zona X, Servientrega para zona Y) — futuro
- UI para gestionar delivery_zones desde settings — futuro
- Hora de corte configurable por workspace — futuro

</deferred>

---

*Phase: standalone/v3-tiempo-entrega*
*Context gathered: 2026-03-17*
