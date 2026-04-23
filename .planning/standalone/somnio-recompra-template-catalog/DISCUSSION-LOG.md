# somnio-recompra-template-catalog — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** somnio-recompra-template-catalog (standalone)
**Areas discussed:** Rollout strategy, Copy preparation, Template snapshot / scope, preguntar_direccion_recompra existence, Update sales-v3 copy

---

## Rollout strategy (Regla 6)

| Option | Description | Selected |
|--------|-------------|----------|
| A — Migration SQL + code push juntos | Aditivo: templates no destructivos, rollback del código si rompe | ✓ |
| B — Feature flag en response-track | Conmutador entre catálogo recompra-v1 vs shared sales-v3; más granular pero más código | |

**User's choice:** A (sin feature flag).
**Notes:** Templates son aditivos/reemplazo, rollback del código via revert commit es suficiente si algo rompe. D-09.

---

## Copy preparation

| Option | Description | Selected |
|--------|-------------|----------|
| Claude prepara borradores; usuario revisa en plan-phase | Flujo ágil, user mantiene control sobre wording final | ✓ |
| Usuario dicta copy línea por línea en discuss | Más costoso de tiempo, poco valor adicional | |

**User's choice:** "si asi, los preparas segun lo que sabes".
**Notes:** Claude usa como base lo que ya sabe del dominio + expectativa del negocio (saludo personalizado, ELIXIR como producto, tono recompra). D-10.

---

## Template snapshot / scope de la migración

| Option | Description | Selected |
|--------|-------------|----------|
| Replace ALL templates bajo recompra-v1 con catálogo nuevo de 22 intents | Scope grande, más trabajo, más riesgo | |
| Scope reducido: SOLO saludo + preguntar_direccion (el resto está OK) | Scope mínimo, templates existentes se respetan | ✓ |

**User's choice:** "son los que hay, excepto el saludo y lo de la direccion".
**Notes:** El usuario confirma que el resto del catálogo bajo somnio-recompra-v1 (precio, promociones, pago, envio, ubicacion, contraindicaciones, dependencia, tiempo_entrega_*, resumen_*, confirmacion_orden_*, pendiente_*, no_interesa, rechazar, retoma_inicial) está correcto y NO se toca. **Reduce el trabajo de 22 templates a 3.** D-11.

Content del nuevo `preguntar_direccion_recompra`: `"¡Claro que sí! ¿Sería para la misma dirección? {{direccion+municipio+dpto}}"` — requiere ampliar el join en `response-track.ts:346` para incluir departamento. D-12.

---

## preguntar_direccion_recompra existence

| Option | Description | Selected |
|--------|-------------|----------|
| Existe — verificar contenido | Si ya está creado, revisar wording y usarlo | |
| No existe — crear en esta fase | Template no existe hoy en DB, hay que insertar | ✓ |

**User's choice:** "no" (no existe).
**Notes:** Confirmado por el usuario. Plan 01 incluye INSERT del template con content de D-12.

---

## Update sales-v3 copy

| Option | Description | Selected |
|--------|-------------|----------|
| Sí — aprovechar para refrescar copy de sales-v3 | Scope expansion, más trabajo pero menos context switches | |
| No — dejar sales-v3 intacto, scope estricto a recompra | Scope limpio, respeta aislamiento entre agentes | ✓ |

**User's choice:** "de que hablas? ese copy del v3 esta bien".
**Notes:** sales-v3 está validado por el usuario, no se toca. Consistente con D-01 (agentes aislados). D-13.

---

## Claude's Discretion

- **Wording exacto de saludo** (D-10): Claude decide si el emoji 😊 va pegado o con espacio, si `{{nombre_saludo}} 😊` se presenta como UN template o si `{{nombre_saludo}}` va como variable adentro de un template más largo. Usuario confirma en plan-phase.
- **URL de la imagen ELIXIR**: Claude reutiliza la URL existente bajo `somnio-sales-v3` orden=1 (`https://cdn.shopify.com/s/files/1/0688/9606/3724/files/Diseno_sin_titulo_25.jpg?v=1774566355`) ya que el producto es el mismo.
- **delay_s del imagen ELIXIR**: Claude mantiene `delay_s=3` (igual que orden=1 de sales-v3) para dar tiempo de que se lea el saludo antes de la imagen.
- **Priority del preguntar_direccion_recompra**: Claude decide CORE (única respuesta en ese turn).

## Deferred Ideas

Ninguna. Todas las ideas del discuss cayeron dentro de scope de la fase.
