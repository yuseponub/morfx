# Standalone: Somnio Recompra - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Bot de ventas especializado para contactos con badge `is_client=true` que NO tengan estados de pedido activos. Reutiliza la arquitectura v3 (comprehension + sales-track + response-track) con flujo simplificado: confirmar datos existentes en vez de capturarlos, y menos intents informativos.

El agente se registra como `somnio-recompra-v1` (agente separado de v3, no variante).

</domain>

<decisions>
## Implementation Decisions

### Activacion y routing

- Agente separado con ID `somnio-recompra-v1`
- Se activa para contactos con `is_client = true`
- Se EXCLUYEN contactos que tengan tags de estado de pedido (los mismos que ya bloquean: WPP, P/W, etc.)
- Se elimina la excepcion de tags de bloqueo para clientes — el check de `is_client` ya controla el routing
- Routing en webhook-processor: si `is_client=true` y no tiene tag de estado de pedido → `somnio-recompra-v1`

### Datos precargados

- Los datos del cliente se cargan desde el **ultimo pedido entregado** asociado al contacto
- Campos precargados: nombre, apellido, telefono, direccion, ciudad/municipio, departamento
- Estos datos se usan para confirmar, no para capturar desde cero

### Tres escenarios de entrada

**Escenario 1: Solo saluda** ("Hola", "Buenas")
- Saludo personalizado por hora Colombia (America/Bogota):
  - Antes de 12pm: "Buenos dias [nombre]"
  - 12pm-6pm: "Buenas tardes [nombre]"
  - 6pm-12am: "Buenas noches [nombre]"
- Solo primer nombre (ej: "Janet" para "Janet Mejia Vera")
- + "Deseas adquirir tu ELIXIR DEL SUENO?" + imagen (misma plantilla del saludo normal de v3)

**Escenario 2: Quiere pedir** ("Quiero pedir", "Mandeme otro", "Para hacer un pedido")
- Saludo personalizado por hora + nombre
- + "Claro que si! Seria para la misma direccion? [direccion del ultimo pedido entregado]"
- Espera confirmacion de direccion (gate obligatorio antes de promos)
- Manejo de "si" contextual: comprehension debe revisar pregunta anterior del bot para entender que "si" = confirmar direccion
- Si confirma → directo a promos
- Si quiere otra direccion → se piden: direccion, municipio, departamento

**Escenario 3: Datos espontaneos** ("Envienme 1 a Cra 45 #12-30 Bucaramanga")
- Saludo personalizado + directo a promos
- SOLO si tenemos direccion + municipio + departamento (o dpto inferible de la ciudad via normalizeCity)
- Si falta alguno de esos 3 → se pregunta lo que falta antes de pasar a promos
- Si la direccion es diferente a la del ultimo pedido, se usa la nueva directamente

### Flujo de venta

- Confirmar datos (no capturar) → Promos → Seleccion pack → Confirmacion → Crear orden
- Misma logica de v3 para promos, confirmacion y creacion de orden
- Los templates de WhatsApp se reutilizan los mismos de v3

### Intents

**Intents que se MODIFICAN:**
- **precio** → envia promos (SIN "Cual deseas adquirir?") + modo_pago. Se EXCLUYE `tiempo_efecto_1`

**Intents que se EXCLUYEN** (cliente ya conoce el producto):
- contenido
- formula
- como_se_toma
- efectividad

**Intents que se MANTIENEN igual que v3:**
- saludo (modificado con saludo personalizado, ver escenarios)
- envio
- pago
- contraindicaciones
- ubicacion
- registro_sanitario
- tiempo_entrega
- dependencia
- datos
- quiero_comprar
- seleccion_pack
- confirmar
- rechazar
- asesor
- queja
- cancelar
- no_interesa
- acknowledgment
- otro

### Timers simplificados (solo 3)

- **L3** (600s real): Post-promos — "Quedamos pendientes" + crear orden
- **L4** (600s real): Pack elegido, esperando confirmacion — enviar resumen + crear orden
- **L5** (90s real): ACK/silencio — timer general de inactividad

Se eliminan: L0, L1, L2, L6, L7, L8 (no aplican — no hay captura de datos ni ofi inter)

### Fases simplificadas

- `initial` → `promos_shown` → `confirming` → `order_created` → `closed`
- Se elimina `capturing_data` (no hay captura, solo confirmacion de datos existentes)

</decisions>

<specifics>
## Specific Ideas

- Las conversaciones con tag RECO muestran el patron real: clientes saludan, van directo a pedir, confirman direccion, eligen cantidad, confirman y listo. Flujo mucho mas corto que cliente nuevo.
- El comprehension prompt debe tener la regla de contexto del bot (como v3): si el bot pregunto "Seria para la misma direccion?" y el cliente dice "si" → se interpreta como confirmacion de direccion
- normalizeCity ya existe en v3 y puede inferir departamento desde ciudad — reutilizar

</specifics>

<deferred>
## Deferred Ideas

- Bot de recompra con precios especiales/descuentos para clientes recurrentes
- Ofi Inter para recompra (si un cliente quiere cambiar a recogida en oficina)
- Historial de pedidos del cliente visible en el bot

</deferred>

---

*Standalone: somnio-recompra*
*Context gathered: 2026-03-24*
