# Plan 01: Foundation — Comprehension, State, Constants

**Standalone:** v3-ofi-inter
**Scope:** Schema de comprension, prompt de comprension, state merge, gates, constants
**Depends on:** Nada (es la base)

---

## Objetivo

Preparar toda la infraestructura de datos para ofi inter en v3: como el LLM extrae las señales, como el state las absorbe, y como los gates recalculan.

---

## Tareas

### T1: Bifurcar `ofi_inter` en comprehension schema

**Archivo:** `src/lib/agents/somnio-v3/comprehension-schema.ts`

**Cambio:** Reemplazar campo `ofi_inter: boolean | null` por dos campos:

```typescript
// ANTES
ofi_inter: z.boolean().nullable().describe('true si menciona recoger en oficina de Inter'),

// DESPUES
entrega_oficina: z.boolean().nullable().describe(
  'true SOLO si señal CLARA de pickup en oficina: "oficina de inter", "recoger en oficina/sede", ' +
  '"no hay nomenclatura enviar a oficina", carrier usado COMO dirección sin calle real, ' +
  '"centro oficina [ciudad]", "sede principal". ' +
  'Variantes: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo. ' +
  'Si dice "oficina" + "inter" → true. Si SOLO dice "inter" sin oficina → false (usar menciona_inter).'
),
menciona_inter: z.boolean().nullable().describe(
  'true si menciona "inter"/"interrapidisimo" (o variantes) SIN señal clara de oficina/recoger/sede. ' +
  'Ej: "lo envian por interrapidisimo?", "interrapidisimo" suelto. ' +
  'NUNCA true si entrega_oficina es true — son mutuamente excluyentes. ' +
  'En caso de duda, preferir menciona_inter (preguntar es más seguro).'
),
```

**Validacion:** El tipo `MessageAnalysis` inferido ahora tiene `entrega_oficina` y `menciona_inter` en vez de `ofi_inter`.

---

### T2: Actualizar comprehension prompt con reglas de deteccion

**Archivo:** `src/lib/agents/somnio-v3/comprehension-prompt.ts`

**Cambio:** Agregar seccion de reglas para `entrega_oficina` y `menciona_inter` en el system prompt. Buscar donde se menciona `ofi_inter` y reemplazar con las nuevas reglas:

```
## Reglas entrega_oficina vs menciona_inter

entrega_oficina = true CUANDO:
- "oficina de interrapidisimo/inter", "recoger en oficina", "sede principal"
- "no hay nomenclatura, enviar a oficina"
- Usa el nombre del carrier COMO dirección (sin calle/carrera real)
- "centro oficina [ciudad]"
- "Principal Servientrega" (Somnio solo usa Inter, misma intención)
- Variantes ortográficas: interrapidisimo, interrapidicimo, interapidisimo, intirrapicimo, rapidisimo, interrapid, iterrapidisimo

menciona_inter = true CUANDO:
- Menciona "inter"/"interrapidisimo" (o variantes) SIN decir "oficina"/"recoger"/"sede"
- "lo envían por interrapidisimo?", "interrapidisimo" suelto
- Incluso si ya dio dirección completa

REGLA: Si dice "oficina" + "inter" → entrega_oficina. Si solo "inter" → menciona_inter.
NUNCA ambos true simultáneamente. En duda → menciona_inter (preguntar es más seguro).
```

---

### T3: Actualizar StateChanges con nuevos campos

**Archivo:** `src/lib/agents/somnio-v3/state.ts`

**Cambio en interface StateChanges:**

```typescript
// AGREGAR:
ofiInterJustSet: boolean      // ofiInter pasó de false→true este turno (Señal 1)
mencionaInter: boolean         // cliente mencionó inter sin oficina (Señal 2)

// ELIMINAR (solo si no se usa en otro lugar — verificado: solo se usa en auto:ciudad_sin_direccion):
// ciudadJustArrived: boolean  — SE ELIMINA
```

**Nota:** `ciudadJustArrived` se elimina de StateChanges porque su unico uso era el auto-trigger `ciudad_sin_direccion` que se elimina en Plan 02.

---

### T4: Actualizar mergeAnalysis para nuevos campos

**Archivo:** `src/lib/agents/somnio-v3/state.ts`

**Cambios en `mergeAnalysis()`:**

1. **Leer `entrega_oficina` y `menciona_inter`** del analysis en vez de `ofi_inter`:
```typescript
// ANTES:
if (fields.ofi_inter === true) {
  merged.ofiInter = true;
}

// DESPUES:
const prevOfiInter = merged.ofiInter;
if (fields.entrega_oficina === true) {
  merged.ofiInter = true;
}
```

2. **Calcular `ofiInterJustSet`:**
```typescript
const ofiInterJustSet = !prevOfiInter && merged.ofiInter; // false→true este turno
```

3. **Calcular `mencionaInter`:**
```typescript
const mencionaInter = fields.menciona_inter === true && !merged.ofiInter;
// Solo si NO se activo ofiInter (entrega_oficina tiene prioridad)
```

4. **Eliminar calculo de `ciudadJustArrived`:**
```typescript
// ELIMINAR:
// ciudadJustArrived: newFields.includes('ciudad'),
```

5. **Retornar nuevos campos en StateChanges:**
```typescript
return {
  state: merged,
  changes: {
    newFields,
    filled,
    hasNewData,
    ofiInterJustSet,
    mencionaInter,
    datosCriticosJustCompleted: ...,
    datosCompletosJustCompleted: ...,
  }
};
```

---

### T5: Agregar cedula_recoge a camposFaltantes

**Archivo:** `src/lib/agents/somnio-v3/state.ts` (funcion `camposFaltantes`)

**Cambio:** Cuando `ofiInter=true`, incluir `cedula_recoge` como campo extra (no critico):

```typescript
// En camposFaltantes():
// Despues de los extras normales (correo, barrio):
if (state.ofiInter) {
  // En ofi inter, no pedir barrio ni direccion como extras
  // Pero SI pedir cedula_recoge como extra
  if (!state.datos.cedula_recoge) {
    extras.push('cedula_recoge');
  }
}
```

**Nota:** cedula_recoge ya existe en el schema de comprehension y en `datos`. Solo falta incluirlo en camposFaltantes cuando aplique.

---

### T6: Actualizar constants.ts si necesario

**Archivo:** `src/lib/agents/somnio-v3/constants.ts`

**Verificar:** Que `CRITICAL_FIELDS_OFI_INTER` ya excluye `direccion`. Si no existe como constante separada, crearlo:

```typescript
export const CRITICAL_FIELDS_NORMAL = ['nombre', 'apellido', 'telefono', 'direccion', 'ciudad', 'departamento'] as const;
export const CRITICAL_FIELDS_OFI_INTER = ['nombre', 'apellido', 'telefono', 'ciudad', 'departamento'] as const;
```

**Verificar:** Que `CAPITAL_CITIES` no existe aun (se necesita para L1 condicional en Plan 02):

```typescript
export const CAPITAL_CITIES = [
  'medellin', 'barranquilla', 'cartagena', 'tunja', 'manizales', 'popayan',
  'valledupar', 'monteria', 'bogota', 'neiva', 'santa marta', 'villavicencio',
  'pasto', 'cucuta', 'armenia', 'pereira', 'bucaramanga', 'sincelejo', 'ibague', 'cali',
] as const;
```

Normalizados sin acentos y en lowercase para matching facil.

---

### T7: Actualizar tipos en types.ts

**Archivo:** `src/lib/agents/somnio-v3/types.ts`

**Verificar/actualizar:** Que `StateChanges` en types refleje los nuevos campos. Si StateChanges esta definido en types.ts (o solo en state.ts), actualizar donde corresponda.

Agregar nuevas acciones al tipo `TipoAccion`:
```typescript
// Agregar:
| 'confirmar_ofi_inter'
| 'confirmar_cambio_ofi_inter'
```

(`ask_ofi_inter` ya deberia existir)

---

## Criterios de Exito

1. Schema de comprehension tiene `entrega_oficina` y `menciona_inter` (no `ofi_inter`)
2. Prompt de comprehension tiene reglas claras para ambos campos con variantes ortograficas
3. StateChanges tiene `ofiInterJustSet` y `mencionaInter`, NO tiene `ciudadJustArrived`
4. mergeAnalysis lee `entrega_oficina`/`menciona_inter` y calcula los nuevos StateChanges
5. camposFaltantes incluye `cedula_recoge` cuando ofiInter=true
6. CAPITAL_CITIES definida en constants.ts
7. TipoAccion incluye `confirmar_ofi_inter` y `confirmar_cambio_ofi_inter`
8. TypeScript compila sin errores

---

## Archivos Modificados

| Archivo | Tipo de cambio |
|---------|---------------|
| `comprehension-schema.ts` | Reemplazar ofi_inter por 2 campos |
| `comprehension-prompt.ts` | Agregar reglas de deteccion |
| `state.ts` | StateChanges, mergeAnalysis, camposFaltantes |
| `constants.ts` | CAPITAL_CITIES, verificar CRITICAL_FIELDS |
| `types.ts` | TipoAccion nuevas acciones |

---

*Plan 01 de 2 — Standalone v3-ofi-inter*
