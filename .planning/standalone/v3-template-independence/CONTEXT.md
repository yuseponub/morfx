# Independizar Templates v3 de v1

## Objetivo

Crear un sistema de templates completamente independiente para el agente v3, eliminando toda dependencia del v1. El v1 sigue funcionando exactamente igual (producción). El v3 tiene su propia lista de templates en la DB con agent_id `somnio-sales-v3`.

## Estado Actual — Cómo el v3 depende del v1

### Dependencia 1: V3_TO_V1_INTENT_MAP (constants.ts)

El v3 tiene sus propios nombres de intents (22 intents), pero los mapea a nombres de intents del v1 para cargar templates:

```
V3 intent "saludo"              → busca template con intent "hola"
V3 intent "pedir_datos"         → busca template con intent "captura_datos_si_compra"
V3 intent "contenido"           → busca template con intent "contenido_envase"
V3 intent "efectividad"         → busca template con intent "sisirve"
V3 intent "pago"                → busca template con intent "modopago"
V3 intent "registro_sanitario"  → busca template con intent "invima"
V3 intent "efectos"             → busca template con intent "contraindicaciones"
V3 intent "promociones"         → busca template con intent "ofrecer_promos"
V3 intent "confirmacion_orden"  → busca template con intent "compra_confirmada"
V3 intent "rechazar"            → busca template con intent "no_confirmado"
V3 intent "otro"                → busca template con intent "fallback"
```

Ubicación: `src/lib/agents/somnio-v3/constants.ts` — `V3_TO_V1_INTENT_MAP`

### Dependencia 2: Fallback a agent_id v1 (response-track.ts:107-124)

```typescript
// Try v3 templates first (agent_id = 'somnio-sales-v3')
let selectionMap = await templateManager.getTemplatesForIntents(SOMNIO_V3_AGENT_ID, v1Intents, ...)

// Fallback to v1 templates if v3 has none
const hasAnyTemplates = Array.from(selectionMap.values()).some(s => s.templates.length > 0)
if (!hasAnyTemplates) {
  selectionMap = await templateManager.getTemplatesForIntents('somnio-sales-v1', v1Intents, ...)
}
```

Actualmente `somnio-sales-v3` tiene **0 templates en la DB**, así que SIEMPRE hace fallback al v1.

### Dependencia 3: TemplateManager y BlockComposer compartidos

El v3 usa `TemplateManager` de `src/lib/agents/somnio/template-manager.ts` y `composeBlock` de `src/lib/agents/somnio/block-composer.ts`. Estos archivos son del v1 pero son genéricos — no tienen lógica específica de v1.

### Dependencia 4: Templates combinados del v1

El v1 tiene templates combinados como `hola+precio`, `hola+como_se_toma`, etc. El v3 NO los usa — usa primary+secondary intents por separado. Pero esos templates existen en la DB y podrían causar confusión.

## Problema de Ordenamiento (el trigger de esta tarea)

Cuando hay 2 intents (ej: primary="quiero_comprar", secondary="saludo"):
1. `allIntents = [...salesTemplateIntents, ...infoTemplateIntents]` → sales SIEMPRE va primero
2. Block composer extrae CORE en ese orden
3. Resultado: "Por supuesto! Solo tienes que darnos tus datos:" va ANTES que "Hola! Bienvenido a Somnio"
4. Esto es incorrecto — el saludo debería ir primero

Con templates propios del v3, podemos definir el `orden` global que determine la secuencia correcta independiente del orden de intents.

## Lo que hay que hacer

### 1. Crear templates en la DB con agent_id = 'somnio-sales-v3'

Insertar templates usando los nombres de intent del V3 directamente (NO los del v1). Cada template tiene:
- `agent_id`: 'somnio-sales-v3'
- `intent`: nombre de intent v3 (ej: 'saludo', NOT 'hola')
- `priority`: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL'
- `orden`: número de orden dentro del intent
- `content`: texto del template (puede ser igual al del v1 inicialmente)
- `content_type`: 'texto' | 'imagen'
- `visit_type`: 'primera_vez' (siempre, el v3 no usa 'siguientes')

### Lista completa de intents v3 que necesitan templates:

**Informativos (11):**
| Intent v3 | Tiene template v1? | Intent v1 equivalente |
|-----------|--------------------|-----------------------|
| `saludo` | SÍ | `hola` |
| `precio` | SÍ | `precio` |
| `promociones` | SÍ (via ofrecer_promos) | `info_promociones` |
| `contenido` | SÍ | `contenido_envase` |
| `como_se_toma` | SÍ | `como_se_toma` |
| `pago` | SÍ | `modopago` |
| `envio` | SÍ | `envio` |
| `registro_sanitario` | SÍ | `invima` |
| `ubicacion` | SÍ | `ubicacion` |
| `efectos` | SÍ | `contraindicaciones` |
| `efectividad` | SÍ | `sisirve` |

**Acciones de venta (del response-track resolveSalesActionTemplates):**
| Intent v3 (template) | Tiene template v1? | Intent v1 equivalente |
|-----------------------|--------------------|-----------------------|
| `ofrecer_promos` | SÍ | `ofrecer_promos` |
| `pedir_datos` | SÍ | `captura_datos_si_compra` |
| `pedir_datos_quiero_comprar_implicito` | SÍ | igual |
| `resumen_1x` | SÍ | igual |
| `resumen_2x` | SÍ | igual |
| `resumen_3x` | SÍ | igual |
| `confirmacion_orden` | SÍ | `compra_confirmada` |
| `pendiente_promo` | SÍ | igual |
| `pendiente_confirmacion` | SÍ | igual |
| `no_interesa` | SÍ | igual |
| `rechazar` | SÍ | `no_confirmado` |
| `ask_ofi_inter` | SÍ | igual |
| `confirmar_ofi_inter` | SÍ | igual |
| `confirmar_cambio_ofi_inter` | SÍ | igual |
| `retoma_inicial` | SÍ | igual |
| `retoma_datos` | SÍ | igual |
| `retoma_datos_parciales` | SÍ | igual |
| `retoma_datos_implicito` | SÍ | igual |
| `fallback` | SÍ | igual |

**NO crear templates combinados (hola+precio, etc.) — el v3 maneja multi-intent con primary+secondary.**

### 2. Contenido de cada template

El contenido INICIAL será copiado del v1 equivalente. Usar EXACTAMENTE el mismo texto — esto NO es una reescritura de contenido, es una migración de estructura.

**Contenido actual de cada intent v1 (para copiar al v3):**

```
hola (→ saludo):
  CORE:  "Hola💁 Bienvenido a Somnio, donde tus sueños se hacen realidad 😴"
  COMP:  [IMAGEN] https://expslvzsszymljafhppi.supabase.co/storage/v1/object/public/whatsapp-media/...

precio:
  CORE:  "Nuestro ELIXIR DEL SUEÑO tiene un valor de $77,900 con envio gratis, este contie..."
  COMP:  "Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudar..."
  OPC:   "Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas..."

como_se_toma:
  CORE:  "Debes consumir 1 comprimido 30min antes de dormir, todos los dias."
  COMP:  "Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudar..."
  OPC:   "Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y p..."

contenido_envase (→ contenido):
  CORE:  "Nuestro ELIXIR DEL SUEÑO contiene 90 comprimidos de melatonina y magnesio para r..."
  COMP:  "Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudar..."

contraindicaciones (→ efectos):
  CORE:  "La melatonina y el citrato de magnesio son compuestos seguros y bien tolerados."
  COMP:  "Si tomas anticoagulantes, consulta con tu médico antes de usarlo."

sisirve (→ efectividad):
  CORE:  "Claro que sí! El tiempo en el que el suplemento empezará a hacer efecto depende..."
  COMP:  "Verás los resultados desde los primeros 3-7 dias de uso. La melatonina te ayudar..."
  OPC:   "Lo ideal es que con los días y de forma natural se ajuste tu reloj biológico y p..."

modopago (→ pago):
  CORE:  "Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas..."

envio:
  CORE:  "Hacemos envíos a toda Colombia 🚚 (gratis)."
  COMP:  "Usamos Coordinadora, Envia, Interrapidísimo o domiciliarios propios según tu ciu..."

invima (→ registro_sanitario):
  CORE:  "Contamos con producción en laboratorio con registro Invima. Fabricante: PHARMA S..."

ubicacion:
  CORE:  "Tenemos centros de distribución en las principales ciudades del país, sin embarg..."
  COMP:  "Recuerda que el pago lo haces una vez recibes el producto en tu hogar y lo pagas..."

ofrecer_promos (→ ofrecer_promos):
  CORE:  "Estas son las promociones que manejamos, ¿Cuál deseas adquirir?😊\n\n• 1×: $77,9..."

captura_datos_si_compra (→ pedir_datos):
  CORE:  "Por supuesto! Solo tienes que regalarnos los siguientes datos:"
  COMP:  "Nombre:\nApellido:\nTeléfono:\nDirección completa:\nBarrio:\nDepartamento:\nCiud..."

compra_confirmada (→ confirmacion_orden):
  CORE:  "Perfecto! Despacharemos tu pedido lo antes posible✅..."
  COMP:  "Recuerda tener el efectivo listo el día que te llegue el pedido..."

no_confirmado (→ rechazar):
  CORE:  "Entiendo. ¿Deseas que te comparta nuevamente las **promociones** o prefieres que..."

no_interesa:
  CORE:  "Claro que sí 🤍 Esperamos tu mensaje..."

fallback:
  CORE:  "Regálame 1 minuto por favor"

resumen_1x/2x/3x: (cada uno tiene CORE + COMP)
pendiente_promo: 2x CORE (variantes)
pendiente_confirmacion: 2x CORE (variantes)
retoma_inicial: 2x CORE (variantes)
retoma_datos: 2x CORE (variantes)
retoma_datos_parciales: 2x CORE (variantes con {{campos_faltantes}})
retoma_datos_implicito: 2x CORE (variantes)
pedir_datos_quiero_comprar_implicito: 2x CORE (con {{campos_faltantes}})
ask_ofi_inter: 2x CORE (variantes)
confirmar_ofi_inter: 2x CORE (con {{ciudad}} y {{campos_faltantes}})
confirmar_cambio_ofi_inter: 2x CORE (con {{campos_faltantes}})
```

**IMPORTANTE: Para los intents que tienen 2x CORE (variantes), se usan para que el sistema de no-repetición pueda enviar una variante diferente la segunda vez. Mantener ambas variantes.**

### 3. Eliminar V3_TO_V1_INTENT_MAP

Una vez los templates existen en la DB con nombres v3:
- Eliminar `V3_TO_V1_INTENT_MAP` de `constants.ts`
- En `response-track.ts`, eliminar el mapeo (líneas 88-97): pasar `allIntents` directo (ya no necesita traducir)
- Eliminar el fallback a `somnio-sales-v1` (líneas 115-124): si no hay templates v3, es un error, no un fallback

### 4. Resolver el problema de ordenamiento

Con templates propios, definir el orden correcto en el block composer:
- Opción A: `saludo` siempre tiene prioridad de display (orden especial)
- Opción B: En response-track, poner `infoTemplateIntents` ANTES de `salesTemplateIntents` cuando `saludo` está presente
- Opción C: Agregar un campo `display_order` al template o un sort global post-composition

**Recomendación:** Opción B es la más simple — si `saludo` está en infoTemplateIntents, ponerlo primero en allIntents.

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/agents/somnio-v3/constants.ts` | Eliminar `V3_TO_V1_INTENT_MAP` |
| `src/lib/agents/somnio-v3/response-track.ts` | Eliminar mapeo v3→v1, eliminar fallback a v1, fix orden saludo |
| DB migration (SQL) | INSERT templates con agent_id='somnio-sales-v3' |

## Archivos que NO tocar

| Archivo | Razón |
|---------|-------|
| `src/lib/agents/somnio/template-manager.ts` | Genérico, lo usan ambos agentes |
| `src/lib/agents/somnio/block-composer.ts` | Genérico, lo usan ambos agentes |
| Cualquier archivo en `src/lib/agents/somnio/` (v1) | v1 sigue en producción |
| `src/lib/agents/engine-adapters/production/` | No tocar producción |
| Webhook handler, Inngest functions | No tocar |

## Archivos que NO van a cambiar su comportamiento

| Archivo | Razón |
|---------|-------|
| `src/lib/agents/somnio/template-manager.ts` | Solo filtra por agent_id — funciona igual con v3 |
| `src/lib/agents/somnio/block-composer.ts` | Puro algoritmo de prioridades — funciona igual |

## Reglas de implementación

1. **NO adivinar contenido de templates** — copiar EXACTAMENTE del v1. Si no hay equivalente v1, preguntar al usuario.
2. **NO eliminar templates del v1** — el v1 sigue en producción.
3. **NO modificar TemplateManager ni BlockComposer** — son genéricos.
4. **NO crear templates combinados (hola+X)** — el v3 maneja multi-intent con primary+secondary.
5. **Migración SQL primero** — crear los templates en la DB antes de modificar el código (Regla 5 de CLAUDE.md).
6. **El v3 solo carga templates de agent_id='somnio-sales-v3'** — cero fallback al v1.
7. **Mantener variables** — templates con `{{campos_faltantes}}`, `{{ciudad}}`, `{{pack}}`, etc. deben mantener las mismas variables.
8. **Mantener variantes** — intents con 2x CORE son variantes para no-repetición. Copiar ambas.
9. **visit_type siempre 'primera_vez'** — el v3 no usa 'siguientes'.

## Verificación post-implementación

1. `npx tsc --noEmit` — sin errores de tipo
2. En sandbox con v3: "hola" → responde con saludo
3. En sandbox con v3: "que precio tiene?" → responde con precio
4. En sandbox con v3: "hola lo quiero comprar" → saludo PRIMERO, luego pedir datos
5. En sandbox con v3: todos los 22 intents producen respuesta (excepto acknowledgment y otro/fallback que pueden ser silence)
6. V1 en producción: sin cambios, sigue funcionando exactamente igual
7. No existen referencias a `V3_TO_V1_INTENT_MAP` en el código
8. No existe fallback a `somnio-sales-v1` en response-track.ts
