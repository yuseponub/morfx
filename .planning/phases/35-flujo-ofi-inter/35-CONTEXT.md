# Phase 35: Flujo Ofi Inter - Context

**Gathered:** 2026-03-13 (rewrite — v3 architecture)
**Status:** Ready for planning

<domain>
## Phase Boundary

Detectar y manejar entrega en oficina de Interrapidisimo dentro del agente conversacional Somnio v3 (state machine two-track: sales track + response track). Tres señales de deteccion, confirmacion obligatoria en casos ambiguos, campos bifurcados, y cedula como campo extra (no critico). Solo aplica a Interrapidisimo (hardcoded).

**Arquitectura target:** v3 — `transitions.ts`, `sales-track.ts`, `response-track.ts`, `state.ts`, `comprehension-schema.ts`

</domain>

<decisions>
## Implementation Decisions

### Concepto fundamental: dos cosas distintas

- **Transportadora Inter**: El carrier de envio (siempre es Inter para Somnio) — NO activa ofiInter
- **Entrega en oficina**: Cliente recoge en oficina Inter en vez de domicilio — SI activa ofiInter
- Cuando un cliente dice "interrapidisimo" puede significar cualquiera de las dos. El bot DEBE distinguir.

### Tres señales de deteccion

**Señal 1 — Oficina explicita (directo, sin preguntar):**
- Cliente dice claramente que quiere oficina: "oficina de interrapidisimo", "recoger en oficina/sede", "no hay nomenclatura enviar a oficina", carrier usado COMO direccion sin calle real
- Variantes ortograficas reales: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo
- → `state.ofiInter = true` inmediato, sin preguntar
- → `ofiInterJustSet = true` en StateChanges para que el sales track reaccione

**Señal 2 — Mencion ambigua de Inter (PREGUNTAR):**
- Cliente menciona "inter"/"interrapidisimo" pero SIN decir "oficina"/"recoger"/"sede"
- Ej: "lo envian por interrapidisimo?", "interrapidisimo" suelto, incluso si ya dio direccion completa
- → El bot PREGUNTA: "Deseas recibirlo en tu domicilio o prefieres recogerlo en oficina de Inter?"
- → Si dice oficina → Señal 1 flow
- → Si dice domicilio → flujo normal sin cambios

**Señal 3 — L1 condicional (timer-based, para municipios no capitales):**
- Timer L1 expira (datos parciales) en capturing_data
- Condicion: ciudad presente + direccion ausente + ciudad NO es capital (lista de 20)
- → `ask_ofi_inter`: "Tienes alguna direccion o te enviamos a oficina de Inter?"
- → Si dice oficina → Señal 1 flow
- → Si da direccion → flujo normal
- **barrio se ignora completamente** en esta logica de deteccion

**ELIMINADO: auto-trigger `ciudad_sin_direccion`** — reemplazado por L1 condicional. Ya no se pregunta inmediatamente cuando llega ciudad sin direccion; se espera al timer L1 para dar tiempo al cliente de enviar direccion naturalmente.

### 20 ciudades capitales (excluidas de L1 condicional)

Solo estas ciudades se consideran "capitales" para efectos de L1 condicional. Las capitales de departamentos remotos (Arauca, Amazonas, Casanare, Choco, Guainia, Guaviare, La Guajira, Putumayo, San Andres, Vaupes, Vichada, Caqueta) NO se incluyen porque alli es comun pedir ofi inter incluso en la capital.

```
Medellín, Barranquilla, Cartagena, Tunja, Manizales, Popayán,
Valledupar, Montería, Bogotá, Neiva, Santa Marta, Villavicencio,
Pasto, Cúcuta, Armenia, Pereira, Bucaramanga, Sincelejo, Ibagué, Cali
```

### Comprehension: campo `entrega_oficina`

- Reemplaza el actual `ofi_inter: boolean` en comprehension-schema.ts
- `entrega_oficina: boolean | null`:
  - **true**: señales claras de oficina (Señal 1)
  - **null**: no mencionado
- Separar la deteccion de "menciona inter" (Señal 2) — el comprehension puede extraer otro campo o el prompt puede instruir distincion

### State: ofiInter como modificador, no como fase

- `ofiInter` es un boolean en AgentState (ya existe)
- Las fases NO cambian: initial → capturing_data → promos_shown → confirming → order_created
- `ofiInter = true` modifica los campos criticos, nada mas
- El mode reportado (`computeMode`) puede diferenciar: `captura_inter` vs `captura` (ya existe)

### StateChanges: ofiInterJustSet

- Nuevo campo `ofiInterJustSet: boolean` en StateChanges
- true cuando `ofiInter` pasa de false a true en este turno
- Permite al sales track disparar `confirmar_ofi_inter` o `confirmar_cambio_ofi_inter`

### Campos bifurcados

- **Flujo normal (6 criticos):** nombre, apellido, telefono, direccion, ciudad, departamento
- **Flujo ofi inter (5 criticos):** nombre, apellido, telefono, ciudad, departamento
- **cedula_recoge: campo EXTRA (como correo/barrio)** — se pide, se intenta capturar, pero si el cliente no la da, se puede despachar sin ella. NO bloquea la orden.
- `camposFaltantes()` incluye cedula cuando `ofiInter=true`, junto con correo como extras
- Los mecanismos existentes (retoma_datos, retoma_datos_parciales, `{{campos_faltantes}}`) piden cedula automaticamente

### Acciones del sales track

| Accion | Cuando | Proposito |
|--------|--------|-----------|
| `confirmar_ofi_inter` (NUEVA) | ofiInterJustSet + en capturing_data | Reconocer oficina + pedir campos faltantes |
| `confirmar_cambio_ofi_inter` (NUEVA) | ofiInterJustSet + ya tenia direccion (cambio tardio) | Cancelar direccion + confirmar oficina + pedir cedula si falta |
| `ask_ofi_inter` (MANTENER) | L1 condicional + mencion ambigua de Inter | Preguntar domicilio vs oficina |
| `pedir_datos` (SIN CAMBIO) | flujo normal | Template fijo con lista de campos |

### Flujo de datos cuando ofiInterJustSet

```
Comprehension detecta entrega_oficina/menciona_inter
  ↓
State Merge: ofiInter=true, ofiInterJustSet=true
  ↓
Gates recalculan (CRITICAL_FIELDS cambian)
  ↓
Sales Track detecta ofiInterJustSet:
  ├─ confirmar_ofi_inter (si estaba en captura normal)
  └─ confirmar_cambio_ofi_inter (si ya tenia direccion)
  ↓
Response Track: template con acknowledgment + {{campos_faltantes}}
  ↓
Captura continua → datosCriticos → promos → confirmacion → orden
```

### Impacto en orden/CRM

- Ya implementado: `order-creator.ts` genera shipping address como `"OFICINA INTER - ciudad, depto"` cuando `isOfiInter=true`
- cedula_recoge se guarda en notas de la orden
- Sin cambios necesarios en order creation

### Claude's Discretion

- Templates/mensajes exactos para cada accion (se discutiran despues)
- Implementacion tecnica de la distincion "menciona_inter" vs "entrega_oficina" en comprehension
- Como manejar el cambio de opinion inverso (ofi inter → domicilio)
- Normalizacion de nombres de ciudades para matching contra lista de capitales

</decisions>

<specifics>
## Specific Ideas

- Variantes ortograficas reales de clientes colombianos: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo
- "La dirección es interrapidisimo" = cliente usa Inter COMO direccion → oficina
- "centro oficina [ciudad]" = oficina pickup
- "Principal Servientrega" = intent de oficina pero carrier equivocado → corregir a Inter
- Clientes rurales frecuentemente no tienen nomenclatura → ofi inter es comun
- cedula_recoge puede ser de otra persona ("la persona que vaya a reclamar")
- Algunos clientes confirman ofi inter pero luego dicen "con el teléfono y nombre siempre llega" → no dan cedula, y esta bien

</specifics>

<deferred>
## Deferred Ideas

- Flujo generico para multiples transportadoras (no solo Inter) — futura fase
- UI/dashboard para gestionar lista curada de capitales — futura fase
- Templates exactos para cada accion ofi inter — se discutiran en planning

</deferred>

---

*Phase: 35-flujo-ofi-inter*
*Context gathered: 2026-03-13 (v3 rewrite)*
