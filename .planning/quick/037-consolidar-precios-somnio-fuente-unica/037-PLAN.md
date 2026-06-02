---
phase: quick-037
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v3/constants.ts
  - src/lib/agents/somnio/order-creator.ts
autonomous: true

must_haves:
  truths:
    - "Precios numéricos y productos de Somnio viven en UN solo archivo (somnio-v3/constants.ts)"
    - "order-creator.ts importa precios/productos desde somnio-v3/constants.ts en lugar de tenerlos hardcoded"
    - "El bot cotiza al cliente y crea el pedido en CRM con los MISMOS valores (imposible desincronizar sin tocar constants.ts)"
    - "Cambiar un precio en el futuro requiere editar UN solo lugar"
    - "npm run build pasa sin errores de TypeScript"
    - "grep confirma que no quedan números de precio hardcoded dentro de src/lib/agents/somnio/ ni src/lib/agents/somnio-v3/"
  artifacts:
    - path: "src/lib/agents/somnio-v3/constants.ts"
      provides: "PACK_PRICES_NUMERIC + PACK_PRODUCTS como fuente única numérica"
      contains: "PACK_PRICES_NUMERIC"
    - path: "src/lib/agents/somnio/order-creator.ts"
      provides: "mapPackToProduct() y effectivePrice leyendo de constants importados"
      contains: "from '../somnio-v3/constants'"
  key_links:
    - from: "src/lib/agents/somnio/order-creator.ts"
      to: "src/lib/agents/somnio-v3/constants.ts"
      via: "import { PACK_PRICES_NUMERIC, PACK_PRODUCTS }"
      pattern: "from ['\"]\\.\\./somnio-v3/constants['\"]"
---

<objective>
Consolidar precios numéricos y metadata de productos Somnio a UNA fuente única en `src/lib/agents/somnio-v3/constants.ts` y eliminar la duplicación en `src/lib/agents/somnio/order-creator.ts`.

Purpose: Prevenir recurrencia del bug del 2026-04-08 donde los precios al cliente (PACK_PRICES strings en constants.ts) quedaron desincronizados con los precios escritos al CRM (SOMNIO_PRICES_NUMERIC + mapPackToProduct en order-creator.ts). El hotfix 4bcd243 sincronizó los valores pero dejó la duplicación estructural intacta.

Output: Código refactorizado donde un cambio de precio en `somnio-v3/constants.ts` propaga automáticamente tanto a las cotizaciones al cliente como a la creación de pedidos en CRM.
</objective>

<context>
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio/order-creator.ts
@src/lib/agents/somnio-recompra/constants.ts

# Info relevante descubierta en planning:
# - constants.ts tiene regla ZERO imports (prevenir circular deps) → tipos de PACK_PRICES_NUMERIC y PACK_PRODUCTS deben usar Record<string, ...> no Record<PackSelection, ...>
# - PackSelection está en src/lib/agents/types.ts — order-creator.ts ya lo importa desde '../types'
# - somnio-recompra/constants.ts tiene PACK_PRICES con valores VIEJOS ($77,900 / $109,900 / $139,900) — esto NO es un bug, es intencional (clientes de recompra mantienen pricing anterior). NO tocar recompra en este refactor.
# - crm/order-manager/ tiene precios viejos hardcoded pero son mocks del sandbox (fuera de scope por instrucción del usuario)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Agregar fuente única PACK_PRICES_NUMERIC + PACK_PRODUCTS a somnio-v3/constants.ts</name>
  <files>src/lib/agents/somnio-v3/constants.ts</files>
  <action>
En la sección "Pack Prices" de `src/lib/agents/somnio-v3/constants.ts` (después de `PACK_PRICES` en línea 139-143), agregar DOS nuevas constantes exportadas que serán la fuente única numérica:

```typescript
/**
 * Numeric pack prices (COP). Source of truth for order creation in CRM.
 * MUST stay in sync with PACK_PRICES (string format for client-facing templates).
 * When updating prices, edit BOTH constants here — no other file should hardcode these numbers.
 */
export const PACK_PRICES_NUMERIC: Record<string, number> = {
  '1x': 89900,
  '2x': 129900,
  '3x': 169900,
}

/**
 * Pack product metadata for CRM order creation (productName + quantity).
 * Single source of truth — order-creator.ts imports from here.
 */
export const PACK_PRODUCTS: Record<string, { name: string; quantity: number }> = {
  '1x': { name: 'Somnio 90 Caps',    quantity: 1 },
  '2x': { name: 'Somnio 90 Caps x2', quantity: 2 },
  '3x': { name: 'Somnio 90 Caps x3', quantity: 3 },
}
```

IMPORTANTE:
- Usar `Record<string, ...>` NO `Record<PackSelection, ...>`. El archivo tiene regla estricta de CERO imports (ver comentario línea 4: "ZERO imports from other project files. Prevents circular dependencies.").
- NO eliminar ni modificar `PACK_PRICES` existente — sigue siendo usado por templates (comillas + formato con coma).
- Dejar los valores numéricos alineados con los strings de `PACK_PRICES` actuales (89900 ↔ "$89,900", etc).
- Agregar comentario JSDoc enfatizando que `PACK_PRICES` y `PACK_PRICES_NUMERIC` deben mantenerse sincronizados.
  </action>
  <verify>
```bash
# Verificar que las nuevas constantes existen y compilan
grep -n "PACK_PRICES_NUMERIC\|PACK_PRODUCTS" src/lib/agents/somnio-v3/constants.ts
npx tsc --noEmit src/lib/agents/somnio-v3/constants.ts 2>&1 | head -20
```
Expected: grep encuentra ambas constantes, tsc no reporta errores en constants.ts.
  </verify>
  <done>
`src/lib/agents/somnio-v3/constants.ts` exporta `PACK_PRICES_NUMERIC` (Record<string, number>) y `PACK_PRODUCTS` (Record<string, {name, quantity}>) con los valores 89900/129900/169900 alineados con el `PACK_PRICES` string existente. El archivo sigue sin imports (regla de zero-imports preservada).
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactorizar order-creator.ts para consumir la fuente única</name>
  <files>src/lib/agents/somnio/order-creator.ts</files>
  <action>
Modificar `src/lib/agents/somnio/order-creator.ts`:

**Paso 1 — Agregar import al tope del archivo** (donde están los otros imports de `../somnio-v3/` si existen, o junto a los imports de agents):

```typescript
import { PACK_PRICES_NUMERIC, PACK_PRODUCTS } from '../somnio-v3/constants'
```

**Paso 2 — Eliminar `SOMNIO_PRICES_NUMERIC` (líneas 80-88)**: borrar el bloque completo del comentario "Numeric prices for Somnio products..." incluyendo la constante entera. Preservar el separador "// Constants" y "// Order Creator Class".

**Paso 3 — Actualizar línea 125** de:
```typescript
const effectivePrice = priceOverride !== undefined ? priceOverride : SOMNIO_PRICES_NUMERIC[pack]
```
a:
```typescript
const effectivePrice = priceOverride !== undefined ? priceOverride : PACK_PRICES_NUMERIC[pack]
```

**Paso 4 — Reescribir `mapPackToProduct()` (líneas 428-457)** eliminando el switch hardcoded y leyendo de las constantes importadas:

```typescript
/**
 * Map pack selection to product details.
 * Reads from single source of truth in somnio-v3/constants.ts.
 *
 * @param pack - Pack selection (1x, 2x, 3x)
 * @returns Product mapping with name, quantity, and price
 */
mapPackToProduct(pack: PackSelection): ProductMapping {
  const product = PACK_PRODUCTS[pack]
  const price = PACK_PRICES_NUMERIC[pack]

  if (!product || price === undefined) {
    logger.warn({ pack }, 'Unknown pack, defaulting to 1x')
    const fallback = PACK_PRODUCTS['1x']
    return {
      productName: fallback.name,
      quantity: fallback.quantity,
      price: PACK_PRICES_NUMERIC['1x'],
    }
  }

  return {
    productName: product.name,
    quantity: product.quantity,
    price,
  }
}
```

IMPORTANTE:
- Mantener exactamente la misma firma pública de `mapPackToProduct(pack: PackSelection): ProductMapping` — no cambiar tipos de retorno ni nombre.
- Mantener el warning log en el caso fallback (mismo mensaje que antes).
- NO tocar ningún otro método de la clase `OrderCreator`.
- Verificar que `ProductMapping` sigue teniendo las mismas keys (`productName`, `quantity`, `price`).
  </action>
  <verify>
```bash
# 1. Verificar que el import existe
grep -n "PACK_PRICES_NUMERIC\|PACK_PRODUCTS" src/lib/agents/somnio/order-creator.ts

# 2. Verificar que SOMNIO_PRICES_NUMERIC fue eliminado
grep -n "SOMNIO_PRICES_NUMERIC" src/lib/agents/somnio/order-creator.ts
# Expected: 0 resultados

# 3. Verificar que no quedan precios hardcoded dentro de somnio/ ni somnio-v3/
grep -rnE "89900|129900|169900|77900|109900|139900" src/lib/agents/somnio src/lib/agents/somnio-v3
# Expected: SOLO los valores en somnio-v3/constants.ts (PACK_PRICES y PACK_PRICES_NUMERIC) + el comentario de no-repetition-filter.ts (línea 50 — es texto de prompt, no lógica)

# 4. Build completo
npm run build 2>&1 | tail -30
```
Expected: Build passes, SOMNIO_PRICES_NUMERIC eliminado, precios hardcoded solo aparecen en constants.ts + comentario de prompt (no lógica).
  </verify>
  <done>
- `order-creator.ts` importa `PACK_PRICES_NUMERIC` y `PACK_PRODUCTS` desde `../somnio-v3/constants`.
- `SOMNIO_PRICES_NUMERIC` ya no existe en el archivo.
- `effectivePrice` usa `PACK_PRICES_NUMERIC[pack]`.
- `mapPackToProduct()` lee de las constantes importadas sin ningún switch ni valor hardcoded.
- `npm run build` pasa sin errores.
- Grep confirma que no quedan precios numéricos hardcoded dentro de `src/lib/agents/somnio/` ni `src/lib/agents/somnio-v3/` (excepto la fuente única en constants.ts y el texto de prompt en no-repetition-filter.ts línea 50).
  </done>
</task>

<task type="auto">
  <name>Task 3: Validación final, commit y push a Vercel</name>
  <files>N/A (verificación + git)</files>
  <action>
**Paso 1 — Validación exhaustiva**:

```bash
# Build completo desde cero
npm run build

# Confirmar grep final: buscar números hardcoded en todo src/lib/agents/somnio*
grep -rnE "\\b(77900|89900|109900|129900|139900|169900)\\b" src/lib/agents/somnio src/lib/agents/somnio-v3 src/lib/agents/somnio-recompra

# Resultado esperado del grep:
# - src/lib/agents/somnio-v3/constants.ts: PACK_PRICES (strings) + PACK_PRICES_NUMERIC (nuevos numéricos) con 89900/129900/169900
# - src/lib/agents/somnio-recompra/constants.ts: PACK_PRICES con valores viejos 77900/109900/139900 (intencional — clientes recompra mantienen pricing anterior)
# - src/lib/agents/somnio/no-repetition-filter.ts:50: el "77900" dentro de un string template de prompt (NO es lógica de precio)
# - CERO resultados en src/lib/agents/somnio/order-creator.ts
```

**Paso 2 — Si el grep revela precios hardcoded INESPERADOS** (p. ej. en order-creator.ts, somnio-orchestrator.ts, o cualquier otro archivo que no sea constants.ts o el prompt filter), PARAR y reportar al usuario antes de commitear.

**Paso 3 — Commit atómico** (seguir Regla 1 de CLAUDE.md):

```bash
git add src/lib/agents/somnio-v3/constants.ts src/lib/agents/somnio/order-creator.ts
git commit -m "refactor(quick-037): consolidar precios Somnio a fuente única en somnio-v3/constants

Elimina duplicación que causó el bug del 2026-04-08 (hotfix 4bcd243):
los precios al cliente y los precios del CRM vivían en archivos distintos
y se desincronizaron al actualizar pricing.

- Agrega PACK_PRICES_NUMERIC y PACK_PRODUCTS en somnio-v3/constants.ts
  como fuente única numérica
- order-creator.ts ahora importa de constants en lugar de tener
  SOMNIO_PRICES_NUMERIC y mapPackToProduct() con valores hardcoded
- somnio-recompra NO se modifica (mantiene pricing anterior intencional)
- Sandbox mocks en crm/order-manager quedan fuera de scope

Refs: hotfix 4bcd243, quick-037

Co-authored-by: Claude <noreply@anthropic.com>"
```

**Paso 4 — Push a Vercel** (Regla 1 de CLAUDE.md obligatoria):

```bash
git push origin main
```

**Paso 5 — Reportar al usuario** el hash del commit, el resultado del build, y recordarle que puede probar el bot somnio-v3 en producción para verificar que cotizaciones y creación de pedidos siguen usando los precios correctos (89900/129900/169900).
  </action>
  <verify>
```bash
# Build limpio
npm run build 2>&1 | tail -5
# Expected: "Compiled successfully" o equivalente

# Commit existe en git log
git log --oneline -1
# Expected: último commit incluye "refactor(quick-037)"

# Push exitoso
git status
# Expected: "Your branch is up to date with 'origin/main'"
```
  </verify>
  <done>
- `npm run build` pasa sin errores ni warnings nuevos.
- Grep final confirma que los únicos lugares con precios Somnio numéricos son: `somnio-v3/constants.ts` (fuente única), `somnio-recompra/constants.ts` (intencional, pricing distinto), y el string de prompt en `no-repetition-filter.ts` (no es lógica).
- Commit atómico creado con mensaje descriptivo en español referenciando el hotfix.
- Push a `origin main` exitoso.
- Usuario informado del commit hash y puede validar en producción.
  </done>
</task>

</tasks>

<verification>
**Verificación global del refactor:**

1. **Fuente única respetada**: Un `grep -rn "89900\|129900\|169900" src/lib/agents/somnio*` debe devolver resultados SOLO en `somnio-v3/constants.ts`.

2. **Import correcto**: `grep -n "somnio-v3/constants" src/lib/agents/somnio/order-creator.ts` debe encontrar el import de `PACK_PRICES_NUMERIC, PACK_PRODUCTS`.

3. **Eliminación completa**: `grep -n "SOMNIO_PRICES_NUMERIC" src/lib/agents/` debe devolver 0 resultados.

4. **Build limpio**: `npm run build` termina sin errores de TypeScript.

5. **Zero-imports rule preservada**: `grep -n "^import" src/lib/agents/somnio-v3/constants.ts` debe devolver 0 resultados (el archivo debe seguir sin imports).

6. **somnio-recompra intacto**: `git diff src/lib/agents/somnio-recompra/` debe estar vacío.
</verification>

<success_criteria>
- [ ] `PACK_PRICES_NUMERIC` y `PACK_PRODUCTS` exportados desde `src/lib/agents/somnio-v3/constants.ts`
- [ ] `somnio-v3/constants.ts` sigue sin imports (zero-imports rule)
- [ ] `SOMNIO_PRICES_NUMERIC` eliminado de `order-creator.ts`
- [ ] `mapPackToProduct()` no tiene ningún switch con valores hardcoded — lee de constantes importadas
- [ ] `effectivePrice` usa `PACK_PRICES_NUMERIC[pack]`
- [ ] `npm run build` pasa sin errores
- [ ] Grep final confirma que los precios nuevos (89900/129900/169900) solo aparecen en `somnio-v3/constants.ts`
- [ ] `somnio-recompra/` no fue modificado
- [ ] Commit atómico pusheado a `origin main` (Regla 1 CLAUDE.md)
</success_criteria>

<output>
Al completar, crear `.planning/quick/037-consolidar-precios-somnio-fuente-unica/037-SUMMARY.md` documentando:
- Commit hash del refactor
- Confirmación de que el build pasó
- Resultado del grep final (qué archivos contienen aún números de precio y por qué)
- Nota sobre deuda técnica restante (lookup inverso en comandos.ts y normalize-order-data.ts — fuera de scope)
- Recordatorio: futuro cambio de precios solo requiere editar `somnio-v3/constants.ts` (ambas constantes: `PACK_PRICES` string y `PACK_PRICES_NUMERIC` numérica)
</output>
