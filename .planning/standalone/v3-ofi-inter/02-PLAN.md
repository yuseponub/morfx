# Plan 02: Behavior — Transitions, Sales Track, Response Track, Cleanup

**Standalone:** v3-ofi-inter
**Scope:** Transition table, sales track logic, response track templates, phase derivation, cleanup
**Depends on:** Plan 01 (foundation — schema, state, constants)

---

## Objetivo

Implementar el comportamiento del agente: como las señales de ofi inter fluyen por el state machine (transitions), como el sales track las procesa, como el response track genera mensajes, y limpiar el auto-trigger eliminado.

---

## Tareas

### T1: Eliminar auto-trigger `ciudad_sin_direccion` del sales track

**Archivo:** `src/lib/agents/somnio-v3/sales-track.ts`

**Cambio:** Eliminar el bloque que detecta ciudad sin direccion y dispara auto event:

```typescript
// ELIMINAR este bloque completo:
if (!state.ofiInter && changes.ciudadJustArrived && !state.datos.direccion && !state.datos.barrio) {
  // auto:ciudad_sin_direccion
  autoEvent = 'auto:ciudad_sin_direccion';
}
```

**Nota:** `changes.ciudadJustArrived` ya no existe (eliminado en Plan 01 T3).

---

### T2: Eliminar transicion `auto:ciudad_sin_direccion` de transitions.ts

**Archivo:** `src/lib/agents/somnio-v3/transitions.ts`

**Cambio:** Eliminar la entrada:
```typescript
// ELIMINAR:
{ phase: '*', on: 'auto:ciudad_sin_direccion', action: 'ask_ofi_inter', ... }
```

---

### T3: Agregar transiciones ofi inter al transition table

**Archivo:** `src/lib/agents/somnio-v3/transitions.ts`

**Agregar las siguientes entradas.** El orden importa — estas deben ir ANTES de las transiciones normales de datos para que tengan prioridad.

```typescript
// === OFI INTER TRANSITIONS ===

// Señal 1: ofiInterJustSet sin direccion previa → confirmar oficina
// Phase: initial (datos + ofi inter en primer mensaje)
{
  phase: 'initial',
  on: 'datos',
  when: (state, changes) => !!changes.ofiInterJustSet && !state.datos.direccion,
  action: 'confirmar_ofi_inter',
  timer: 'L1',
  description: 'Ofi inter detectado en initial sin direccion → confirmar + pedir faltantes',
},

// Señal 1: ofiInterJustSet sin direccion previa → confirmar oficina (capturing_data)
{
  phase: 'capturing_data',
  on: 'datos',
  when: (state, changes) => !!changes.ofiInterJustSet && !state.datos.direccion,
  action: 'confirmar_ofi_inter',
  timer: 'L1',
  description: 'Ofi inter detectado durante captura sin direccion → confirmar',
},

// Señal 1: ofiInterJustSet CON direccion previa → cambio tardio
{
  phase: 'capturing_data',
  on: 'datos',
  when: (state, changes) => !!changes.ofiInterJustSet && !!state.datos.direccion,
  action: 'confirmar_cambio_ofi_inter',
  timer: 'L1',
  description: 'Ofi inter detectado pero ya tenia direccion → cancelar direccion + confirmar',
},
{
  phase: 'promos_shown',
  on: 'datos',
  when: (state, changes) => !!changes.ofiInterJustSet && !!state.datos.direccion,
  action: 'confirmar_cambio_ofi_inter',
  timer: 'L1',
  description: 'Ofi inter cambio tardio en promos_shown',
},
{
  phase: 'confirming',
  on: 'datos',
  when: (state, changes) => !!changes.ofiInterJustSet && !!state.datos.direccion,
  action: 'confirmar_cambio_ofi_inter',
  timer: 'L1',
  description: 'Ofi inter cambio tardio en confirming',
},

// Señal 2: mencionaInter → preguntar domicilio vs oficina
{
  phase: 'initial',
  on: 'datos',
  when: (_state, changes) => !!changes.mencionaInter,
  action: 'ask_ofi_inter',
  timer: 'L5',
  description: 'Mencion ambigua de Inter en initial → preguntar',
},
{
  phase: 'capturing_data',
  on: 'datos',
  when: (_state, changes) => !!changes.mencionaInter,
  action: 'ask_ofi_inter',
  timer: 'L1',
  description: 'Mencion ambigua de Inter durante captura → preguntar',
},

// Señal 3: L1 condicional — timer expira + ciudad + !direccion + !capital
{
  phase: 'capturing_data',
  on: 'timer_expired:1',
  when: (state) => {
    if (state.ofiInter) return false; // ya es ofi inter
    if (!state.datos.ciudad) return false;
    if (state.datos.direccion) return false;
    const normalizedCity = state.datos.ciudad
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return !CAPITAL_CITIES.includes(normalizedCity);
  },
  action: 'ask_ofi_inter',
  timer: 'L1',
  description: 'L1 condicional: ciudad no-capital sin direccion → preguntar ofi inter',
},
```

**Prioridad:** Las transiciones ofi inter (con `when` que chequea `ofiInterJustSet`/`mencionaInter`) deben estar ANTES de las transiciones genericas de `datos` en el mismo phase. El lookup es "first match wins".

**Import:** `CAPITAL_CITIES` desde `constants.ts`.

---

### T4: Actualizar sales track para pasar changes a transition lookup

**Archivo:** `src/lib/agents/somnio-v3/sales-track.ts`

**Cambio:** Verificar que `resolveSalesTrack` pasa `changes` a la funcion de lookup de transiciones, ya que las nuevas transiciones usan `when: (state, changes) => ...`.

Actualmente, las condiciones `when` reciben `(state, gates)`. Necesitamos que tambien reciban `changes`:

```typescript
// Verificar firma de when en transitions.ts:
// when?: (state: AgentState, changes: StateChanges) => boolean
// o
// when?: (state: AgentState, gates: Gates) => boolean

// Ajustar segun lo que exista. Si when recibe (state, gates),
// cambiar a (state, context: { gates, changes }) o agregar changes al lookup.
```

**IMPORTANTE:** Revisar como `lookupTransition` funciona actualmente. Si las condiciones `when` solo reciben `(state, gates)`, necesitamos extender para que tambien reciban `changes`. Esto es critico porque `ofiInterJustSet` y `mencionaInter` estan en `changes`, no en `state` ni `gates`.

**Opciones:**
- A) Extender `when` signature: `when?: (state, gates, changes) => boolean`
- B) Promover `ofiInterJustSet` y `mencionaInter` a `gates` (pero semanticamente no son gates)
- C) Mergar changes relevantes en state temporalmente

**Recomendacion:** Opcion A — extender `when` para recibir changes. Es el mas limpio.

---

### T5: Agregar `confirmar_ofi_inter` y `confirmar_cambio_ofi_inter` a derivePhase

**Archivo:** `src/lib/agents/somnio-v3/phase.ts`

**Cambio:** Agregar las nuevas acciones al mapeo de fase:

```typescript
// Agregar al mapping:
'confirmar_ofi_inter' → 'capturing_data'
'confirmar_cambio_ofi_inter' → 'capturing_data'  // vuelve a captura porque cambio campos
'ask_ofi_inter' → mantener fase actual (no es accion "significativa" que cambie fase)
```

**Nota:** `ask_ofi_inter` probablemente ya existe en phase.ts. Verificar. Si no existe, NO agregarlo como accion significativa — preguntar no cambia la fase.

---

### T6: Agregar templates de response track para nuevas acciones

**Archivo:** `src/lib/agents/somnio-v3/response-track.ts`

**Cambio:** Agregar manejo para las nuevas acciones en el response track.

Para `confirmar_ofi_inter`:
```
"¡Perfecto! Anotamos que lo recogerás en oficina de Interrapidísimo en {{ciudad}}. {{campos_faltantes_texto}}"
```

Para `confirmar_cambio_ofi_inter`:
```
"Entendido, cambiamos a entrega en oficina de Interrapidísimo. Ya no necesitamos la dirección. {{campos_faltantes_texto}}"
```

Para `ask_ofi_inter` (ya deberia existir, verificar):
```
"¿Deseas recibirlo en tu domicilio o prefieres recogerlo en oficina de Interrapidísimo?"
```

**Implementacion:** Las templates pueden ser:
- Hardcodeadas en response-track.ts como casos especiales de accion
- O agregadas al ACTION_TEMPLATE_MAP en constants.ts y cargadas desde DB

**Recomendacion:** Dado que el response track ya tiene logica especial para `mostrar_confirmacion` y `crear_orden`, seguir el mismo patron para las acciones ofi inter.

---

### T7: Actualizar ACTION_TEMPLATE_MAP en constants.ts

**Archivo:** `src/lib/agents/somnio-v3/constants.ts`

**Cambio:** Agregar las nuevas acciones al map:

```typescript
// Agregar:
confirmar_ofi_inter: ['confirmar_ofi_inter'],
confirmar_cambio_ofi_inter: ['confirmar_cambio_ofi_inter'],
// ask_ofi_inter ya deberia existir
```

**Nota:** Verificar si estas templates existen en la DB (TemplateManager). Si no, se necesitan crear o manejar inline en response-track.ts.

---

### T8: Limpiar direccion cuando ofiInterJustSet + tenia direccion

**Archivo:** `src/lib/agents/somnio-v3/state.ts` (dentro de mergeAnalysis)

**Cambio:** Cuando se activa ofiInter y el cliente tenia direccion capturada, limpiar la direccion del state:

```typescript
// Despues de setear ofiInter:
if (ofiInterJustSet && merged.datos.direccion) {
  merged.datos.direccion = null;
  // barrio tambien se limpia — no aplica en ofi inter
  merged.datos.barrio = null;
}
```

**Razon:** La direccion anterior ya no aplica si el cliente elige oficina. Los gates (`datosCriticos`) deben recalcular sin ella.

---

### T9: Manejar mencionaInter en initial con otro intent

**Archivo:** `src/lib/agents/somnio-v3/sales-track.ts`

**Caso:** Cliente dice "Hola quiero comprar, lo envian por interrapidisimo?"
- Comprehension: intent `quiero_comprar` + `menciona_inter: true`
- Transition lookup: busca `(initial, quiero_comprar)` — match con transicion existente
- PERO: tambien tiene `mencionaInter`

**Solucion:** Despues del lookup normal de transicion por intent, verificar si `changes.mencionaInter` y no se manejo ya:

```typescript
// En resolveSalesTrack, despues del lookup principal:
if (changes.mencionaInter && accion !== 'ask_ofi_inter') {
  // La accion principal no fue ask_ofi_inter, pero hay mencion ambigua
  // Agregar ask_ofi_inter como accion secundaria en la respuesta
  // O: dejar mencionaInter pendiente para el siguiente turno
  secondaryAction = 'ask_ofi_inter';
}
```

**Recomendacion (Claude's Discretion del CONTEXT):** Manejar como accion secundaria — el response track genera tanto la respuesta del intent principal como la pregunta de ofi inter. Esto es mejor que encolar para el siguiente turno porque el cliente espera respuesta inmediata.

**Implementacion en response track:** Si hay `secondaryAction`, agregar su template despues del template principal.

---

### T10: Verificar que extrasOk funciona correctamente con ofiInter

**Archivo:** `src/lib/agents/somnio-v3/state.ts`

**Verificar** que `extrasOk(state)` cuando `ofiInter=true`:
- NO requiere barrio (correcto — no aplica en ofi inter)
- NO requiere correo como bloqueante (correcto — es extra)
- El timer L2 se dispara solo cuando `datosCriticos` pero no `datosCompletos`
- Con ofiInter: `extrasOk` debe considerar cedula_recoge (pero NO bloquear)

**Ajuste necesario:** Si `extrasOk` retorna `true` siempre para ofiInter (como esta actualmente), el timer L2 nunca se dispara en ofi inter. Esto es CORRECTO — no queremos delay extra por cedula.

Pero `camposFaltantes()` SI debe listar cedula_recoge para que los templates de retoma lo pidan.

---

## Criterios de Exito

1. Auto-trigger `ciudad_sin_direccion` completamente eliminado (transitions + sales track)
2. Transition table tiene entradas para Señal 1, 2, y 3
3. Sales track pasa `changes` al lookup de transiciones
4. `confirmar_ofi_inter` y `confirmar_cambio_ofi_inter` tienen templates en response track
5. Phase derivation maneja las nuevas acciones correctamente
6. Direccion se limpia del state cuando ofiInterJustSet + tenia direccion
7. mencionaInter en initial funciona como accion secundaria
8. TypeScript compila sin errores
9. El test acido: leyendo solo transitions.ts se entiende todo el flujo ofi inter

---

## Escenarios de Validacion

### Escenario 1: Señal 1 directa en initial
- Input: "Milena Cespedes Orito Putumayo Interapidisimo oficina"
- Comprehension: datos + entrega_oficina=true
- State: ofiInter=true, ofiInterJustSet=true
- Transition: (initial, datos, ofiInterJustSet + !direccion) → confirmar_ofi_inter
- Response: Confirma oficina + pide faltantes (telefono, cedula_recoge)

### Escenario 2: Señal 2 ambigua
- Input: "lo envian por interrapidisimo?"
- Comprehension: intent envio + menciona_inter=true
- State: mencionaInter=true, ofiInter NO cambia
- Transition: (capturing_data, datos, mencionaInter) → ask_ofi_inter
- Response: "¿Domicilio o oficina de Inter?"

### Escenario 3: L1 condicional (Señal 3)
- State: ciudad="Orito", departamento="Putumayo", sin direccion
- Timer L1 expira
- Transition: (capturing_data, timer_expired:1, ciudad + !direccion + !capital) → ask_ofi_inter
- Response: "¿Domicilio o oficina de Inter?"

### Escenario 4: Cambio tardio
- State: ya tiene direccion="Cra 5 #10-20", ciudad="Cali"
- Input: "mejor envienlo a oficina de inter"
- Comprehension: entrega_oficina=true
- State: ofiInter=true, ofiInterJustSet=true, direccion=null (limpiada)
- Transition: (capturing_data, datos, ofiInterJustSet + tenia direccion) → confirmar_cambio_ofi_inter
- Response: "Entendido, cambiamos a oficina. Ya no necesitamos la dirección."

### Escenario 5: mencionaInter + otro intent en initial
- Input: "Hola quiero comprar, lo envian por interrapidisimo?"
- Comprehension: intent quiero_comprar + menciona_inter=true
- Transition principal: (initial, quiero_comprar) → pedir_datos o ofrecer_promos
- Accion secundaria: ask_ofi_inter
- Response: Respuesta normal + "¿Domicilio o oficina?"

### Escenario 6: Capital con L1 — NO ask ofi inter
- State: ciudad="Bogota", sin direccion
- Timer L1 expira
- Transition: (capturing_data, timer_expired:1) → condicion capital=true → NO match con L1 condicional
- Cae a transicion normal de L1: retoma_datos_parciales
- Response: Retoma normal pidiendo direccion

---

## Archivos Modificados

| Archivo | Tipo de cambio |
|---------|---------------|
| `transitions.ts` | Eliminar ciudad_sin_direccion, agregar 8 entradas ofi inter |
| `sales-track.ts` | Eliminar auto-trigger, agregar secondary action, pasar changes |
| `response-track.ts` | Templates para confirmar_ofi_inter, confirmar_cambio_ofi_inter |
| `constants.ts` | ACTION_TEMPLATE_MAP nuevas acciones |
| `phase.ts` | Nuevas acciones en derivePhase |
| `state.ts` | Limpiar direccion en cambio tardio (T8) |

---

*Plan 02 de 2 — Standalone v3-ofi-inter*
