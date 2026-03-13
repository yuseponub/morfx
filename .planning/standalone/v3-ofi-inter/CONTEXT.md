# Standalone: v3 Ofi Inter - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Scope

Implementar deteccion y manejo de entrega en oficina de Interrapidisimo dentro del agente Somnio v3 (state-driven, two-track). Tres señales de deteccion, confirmacion obligatoria en casos ambiguos, campos bifurcados, cedula como campo extra.

**IMPORTANTE: Este standalone es independiente de Phase 35.** Phase 35 implemento ofi inter en el agente v1 (somnio-sales-v1, produccion). Este standalone implementa ofi inter en el agente v3 (somnio-sales-v3, sandbox) con una arquitectura completamente diferente. NO copiar, NO referenciar, NO reutilizar codigo de Phase 35 / `src/lib/agents/somnio/`. El v3 tiene su propia estructura en `src/lib/agents/somnio-v3/`.

**Arquitectura target:** v3 — `transitions.ts`, `sales-track.ts`, `response-track.ts`, `state.ts`, `comprehension-schema.ts`, `comprehension-prompt.ts`, `constants.ts`, `phase.ts`

</domain>

<decisions>
## Implementation Decisions

### PRINCIPIO RECTOR: State-Driven Agent

Somnio v3 es un **agente state-driven puro**. Toda la logica de ofi inter DEBE fluir a traves del state machine existente, no como codigo ad-hoc.

**Esto significa:**
- Deteccion → comprehension (extrae señales) → state merge (actualiza `ofiInter`, computa `ofiInterJustSet`)
- Decisiones → transition table entries en `transitions.ts` (phase + event + condition → action)
- Respuestas → response track resuelve templates a partir de la accion del sales track
- Gates → `datosCriticos`/`datosCompletos` recalculan automaticamente segun `ofiInter`
- Timers → señales de timer en las transiciones, no logica especial fuera de la tabla
- L1 condicional → condicion en la transicion `timer_expired:1` en `capturing_data`, no un auto-trigger separado

**PROHIBIDO:**
- Codigo especial fuera del pipeline comprehension → state → gates → sales track → response track
- Auto-triggers ad-hoc (el anterior `ciudad_sin_direccion` se ELIMINA — ver seccion "Codigo a eliminar")
- Logica de ofi inter en el agent main (`somnio-v3-agent.ts`) — todo pasa por la tabla de transiciones
- Acciones que no esten registradas en la transition table
- Copiar/referenciar codigo de `src/lib/agents/somnio/` (v1). Solo modificar `src/lib/agents/somnio-v3/`

**El test acido:** Si un developer lee solo `transitions.ts`, debe poder entender COMPLETAMENTE como ofi inter funciona en el state machine.

### Concepto fundamental: dos cosas distintas

- **Transportadora Inter**: El carrier de envio (siempre es Inter para Somnio) — NO activa ofiInter
- **Entrega en oficina**: Cliente recoge en oficina Inter en vez de domicilio — SI activa ofiInter
- Cuando un cliente dice "interrapidisimo" puede significar cualquiera de las dos. El bot DEBE distinguir.

### Tres señales de deteccion

**Señal 1 — Oficina explicita (directo, sin preguntar):**
- Cliente dice claramente que quiere oficina: "oficina de interrapidisimo", "recoger en oficina/sede", "no hay nomenclatura enviar a oficina", carrier usado COMO direccion sin calle real
- Variantes ortograficas reales: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo
- → Comprehension extrae `entrega_oficina: true`
- → State merge: `ofiInter = true`, `ofiInterJustSet = true`
- → Sales track reacciona via transition table

**Señal 2 — Mencion ambigua de Inter (PREGUNTAR):**
- Cliente menciona "inter"/"interrapidisimo" pero SIN decir "oficina"/"recoger"/"sede"
- Ej: "lo envian por interrapidisimo?", "interrapidisimo" suelto, incluso si ya dio direccion completa
- → Comprehension extrae `menciona_inter: true` (campo separado, NO activa ofiInter)
- → Sales track detecta `menciona_inter` en changes → accion `ask_ofi_inter`
- → Bot PREGUNTA: "Deseas recibirlo en tu domicilio o prefieres recogerlo en oficina de Inter?"
- → Cliente responde → comprehension del siguiente turno extrae `entrega_oficina: true` (si dice oficina) → Señal 1 flow. O extrae datos normales (si da direccion) → flujo normal.

**Señal 3 — L1 condicional (timer-based, para municipios no capitales):**
- Timer L1 expira (datos parciales) en capturing_data
- Condicion en la transicion `timer_expired:1`: ciudad presente + direccion ausente + ciudad NO es capital (lista de 20)
- → Accion `ask_ofi_inter` (misma accion que Señal 2)
- → Cliente responde igual que Señal 2
- **barrio se ignora completamente** en esta logica de deteccion

**ELIMINADO: auto-trigger `ciudad_sin_direccion`** — reemplazado por L1 condicional. Ya no se pregunta inmediatamente cuando llega ciudad sin direccion; se espera al timer L1 para dar tiempo al cliente de enviar direccion naturalmente durante captura silenciosa.

### Comprehension: dos campos separados

Reemplazar el actual `ofi_inter: boolean` por **dos campos distintos**:

```
entrega_oficina: boolean | null
  — true: señales CLARAS de oficina pickup
  — "oficina de inter", "recoger en oficina", "sede principal",
    "no hay nomenclatura", carrier usado COMO direccion
  — Activa ofiInter directamente (Señal 1)

menciona_inter: boolean | null
  — true: menciona "inter"/"interrapidisimo" sin señal clara de oficina
  — "lo envian por interrapidisimo?", "interrapidisimo" suelto
  — NO activa ofiInter, solo dispara ask_ofi_inter (Señal 2)
```

**Regla para el prompt:** Si el cliente dice "oficina" + "inter" → `entrega_oficina: true`. Si solo dice "inter" sin "oficina/recoger/sede" → `menciona_inter: true`. Ambos NO pueden ser true simultaneamente. Si hay duda, `menciona_inter` (preguntar es mas seguro que asumir).

**Variantes ortograficas** que el prompt DEBE cubrir: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo, "centro oficina", "sede principal".

### State: ofiInter como modificador, no como fase

- `ofiInter` es un boolean en AgentState (ya existe en v3)
- Las fases NO cambian: initial → capturing_data → promos_shown → confirming → order_created
- `ofiInter = true` modifica los campos criticos, nada mas
- El mode reportado (`computeMode`) puede diferenciar: `captura_inter` vs `captura` (ya existe)

### StateChanges: dos nuevos campos

```typescript
ofiInterJustSet: boolean    // ofiInter paso de false→true este turno (Señal 1)
mencionaInter: boolean      // cliente menciono inter sin oficina (Señal 2)
```

- `ofiInterJustSet` → sales track dispara `confirmar_ofi_inter` o `confirmar_cambio_ofi_inter`
- `mencionaInter` → sales track dispara `ask_ofi_inter` (preguntar domicilio vs oficina)

### Campos bifurcados

- **Flujo normal (6 criticos):** nombre, apellido, telefono, direccion, ciudad, departamento
- **Flujo ofi inter (5 criticos):** nombre, apellido, telefono, ciudad, departamento
- **cedula_recoge: campo EXTRA (como correo/barrio)** — se pide, se intenta capturar, pero si el cliente no la da, se puede despachar. NO bloquea la orden.
- `camposFaltantes()` incluye cedula cuando `ofiInter=true`, junto con correo como extras
- Los mecanismos existentes (retoma_datos, retoma_datos_parciales, `{{campos_faltantes}}`) piden cedula automaticamente

### Acciones del sales track — transition table entries

| Accion | Phase | Event/Condition | Proposito |
|--------|-------|-----------------|-----------|
| `confirmar_ofi_inter` (NUEVA) | `capturing_data` | `datos` + `ofiInterJustSet` + `!state.datos.direccion` | Reconocer oficina + pedir campos faltantes |
| `confirmar_cambio_ofi_inter` (NUEVA) | `capturing_data` / `promos_shown` / `confirming` | `datos` + `ofiInterJustSet` + `state.datos.direccion` (ya tenia) | Cancelar direccion + confirmar oficina |
| `ask_ofi_inter` (MANTENER) | `capturing_data` | `datos` + `mencionaInter` (Señal 2) | Preguntar domicilio vs oficina |
| `ask_ofi_inter` (MANTENER) | `capturing_data` | `timer_expired:1` + ciudad + !direccion + !capital (Señal 3) | Preguntar domicilio vs oficina |

**Nota:** `confirmar_ofi_inter` y `confirmar_cambio_ofi_inter` se distinguen por si el cliente YA tenia direccion capturada. Si tenia → cambio tardio (confirmar_cambio). Si no tenia → confirmacion directa.

### Coexistencia con transiciones existentes

**Caso critico: datos + ofi inter en `initial`**
Ej: "Milena Cespedes Orito Putumayo Interapidisimo"
- Comprehension extrae: datos (nombre, ciudad, depto) + `entrega_oficina: true`
- State merge: datos se guardan + `ofiInter = true` + `ofiInterJustSet = true`
- Gates: `datosCriticos` se evalua con campos ofi inter (5 criticos)
- Sales track: la transicion `(initial, datos + ofiInterJustSet)` tiene PRIORIDAD sobre `(initial, datos)` normal
- Accion: `confirmar_ofi_inter` (no `pedir_datos_quiero_comprar_implicito`)
- Fase pasa a `capturing_data` (via derivePhase de `confirmar_ofi_inter`)

**Caso: mencion ambigua en `initial`**
Ej: "Hola quiero comprar, lo envian por interrapidisimo?"
- Comprehension: intent `quiero_comprar` + `menciona_inter: true`
- Sales track: `(initial, quiero_comprar)` se ejecuta normalmente (pedir_datos o ofrecer_promos)
- ADEMAS: `mencionaInter` dispara `ask_ofi_inter` como accion secundaria o se encola
- Alternativa: el `ask_ofi_inter` se dispara en el SIGUIENTE turno si mencionaInter queda pendiente

**Regla de prioridad:** `ofiInterJustSet` (Señal 1) > transiciones normales de datos. `mencionaInter` (Señal 2) NO interrumpe transiciones normales — el ask se puede disparar despues o como parte del response track.

### Flujo completo: de deteccion a orden

```
1. Comprehension extrae entrega_oficina/menciona_inter
   ↓
2. State Merge:
   - entrega_oficina → ofiInter=true, ofiInterJustSet=true
   - menciona_inter → mencionaInter=true (ofiInter NO cambia)
   ↓
3. Gates recalculan (CRITICAL_FIELDS cambian si ofiInter=true)
   ↓
4. Sales Track (transition table):
   - ofiInterJustSet → confirmar_ofi_inter / confirmar_cambio_ofi_inter
   - mencionaInter → ask_ofi_inter
   - timer_expired:1 + condiciones → ask_ofi_inter
   ↓
5. Response Track: template de la accion + {{campos_faltantes}} si aplica
   ↓
6. Captura continua (enCapturaSilenciosa):
   - Cliente envia datos → gates se actualizan
   - cedula_recoge aparece en campos_faltantes si ofiInter=true
   ↓
7. datosCriticos → ofrecer_promos → confirmacion → orden
```

### Codigo a eliminar

El auto-trigger `ciudad_sin_direccion` actual debe eliminarse completamente:

1. **`transitions.ts`**: Eliminar transicion wildcard `{ phase: '*', on: 'auto:ciudad_sin_direccion', action: 'ask_ofi_inter' }`
2. **`sales-track.ts`**: Eliminar bloque que detecta `!state.ofiInter && changes.ciudadJustArrived && !state.datos.direccion && !state.datos.barrio` y dispara auto event
3. **`state.ts`**: Evaluar si `ciudadJustArrived` en StateChanges se usa en otro lugar. Si no → eliminar. Si si → mantener.

### Impacto en orden/CRM

- Ya implementado en v1: `order-creator.ts` genera shipping address como `"OFICINA INTER - ciudad, depto"` cuando `isOfiInter=true`
- cedula_recoge se guarda en notas de la orden
- Este standalone NO modifica order creation — solo el agente conversacional v3

### Claude's Discretion

- Templates/mensajes exactos para cada accion (se discutiran despues)
- Como manejar el cambio de opinion inverso (ofi inter → domicilio)
- Normalizacion de nombres de ciudades para matching contra lista de capitales (accent stripping, lowercase)
- Si `mencionaInter` en initial se maneja como accion secundaria o se encola para el siguiente turno

</decisions>

<specifics>
## Specific Ideas

- Variantes ortograficas reales de clientes colombianos: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo
- "La dirección es interrapidisimo" = cliente usa Inter COMO direccion → `entrega_oficina: true`
- "centro oficina [ciudad]" = oficina pickup → `entrega_oficina: true`
- "lo envian por interrapidisimo?" = solo pregunta por carrier → `menciona_inter: true`
- "Principal Servientrega" = intent de oficina pero carrier equivocado → `entrega_oficina: true` (Somnio solo usa Inter)
- Clientes rurales frecuentemente no tienen nomenclatura → ofi inter es comun
- cedula_recoge puede ser de otra persona ("la persona que vaya a reclamar")
- Algunos clientes confirman ofi inter pero luego dicen "con el teléfono y nombre siempre llega" → no dan cedula, y esta bien
- 20 ciudades capitales excluidas de L1 condicional:
  ```
  Medellín, Barranquilla, Cartagena, Tunja, Manizales, Popayán,
  Valledupar, Montería, Bogotá, Neiva, Santa Marta, Villavicencio,
  Pasto, Cúcuta, Armenia, Pereira, Bucaramanga, Sincelejo, Ibagué, Cali
  ```

</specifics>

<deferred>
## Deferred Ideas

- Flujo generico para multiples transportadoras (no solo Inter) — futura fase
- UI/dashboard para gestionar lista curada de capitales — futura fase
- Templates exactos para cada accion ofi inter — se discutiran en planning

</deferred>

---

*Standalone: v3-ofi-inter*
*Context gathered: 2026-03-13*
