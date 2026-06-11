# Standalone: gemini-fallback-haiku - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** standalone gemini-fallback-haiku
**Areas discussed:** Alcance y granularidad, Parámetros de detección

---

## Selección de áreas

| Área ofrecida | Seleccionada |
|---------------|--------------|
| Alcance y granularidad | ✓ |
| Estado del breaker (in-memory vs Redis) | (a criterio de Claude) |
| Parámetros de detección | ✓ |
| Errores y doble fallo / knobs / flag | (a criterio de Claude) |

---

## Alcance y granularidad

### Q1: ¿Compliance-check (4º call-site Gemini, no estaba en el brief) entra en el fallback?
| Option | Description | Selected |
|--------|-------------|----------|
| Sí, los 4 call-sites (Recomendado) | generation + compliance + comprehension v4 + visión | |
| Solo los 3 del brief | compliance queda como deuda | |
| Solo el generador RAG | mínimo viable | |

**User's choice (free text):** "creo que hay unos que son flash y otros normal, entonces dependiendo de la funcion que este haciendo le podemos poner otro modelo mas barato (si la funcion es muy sencilla intentar ponerle un modelo muy barato pero que cumpla las expectativas)"
**Notes:** Interpretado + confirmado después como: los 4 entran, con fallback POR NIVELES según función (D-01/D-02). Dato corregido: hoy los 4 call-sites usan el mismo `gemini-2.5-flash` (no hay mix flash/normal).

### Q2: ¿Breaker global único o por call-site?
| Option | Description | Selected |
|--------|-------------|----------|
| Global único (Recomendado) | saturación es del modelo upstream | |
| Por call-site | aislamiento por sitio | |

**User's choice (free text):** "1 solo fallo triggerea en esa llamada el cambio, pero tene en cuenta lo que te dije la anterior rta"
**Notes:** Capturado como N=1 (D-05) — primer fallo dispara el cambio en esa misma llamada — combinado con mapping de modelo por call-site. La topología exacta del breaker (estado global vs per-site) queda a criterio de Claude informado por research, respetando N=1 y el mapping por función.

### Q3: ¿Visión hace fallback a Haiku visión o mantiene handoff D-07?
| Option | Description | Selected |
|--------|-------------|----------|
| Fallback a Haiku visión (Recomendado) | cliente no percibe falla; handoff = último recurso | ✓ |
| Mantener handoff D-07 | solo gana detección rápida | |

### Q4: ¿Módulo genérico-reusable o acotado a v4?
| Option | Description | Selected |
|--------|-------------|----------|
| Acotado a v4 (Recomendado) | menos superficie, Regla 6 trivial | ✓ |
| Módulo shared desde ya | estilo crm-query-tools | |

---

## Parámetros de detección

### Q1: Confirmación del fallback por niveles (por función, techo Haiku 4.5)
| Option | Description | Selected |
|--------|-------------|----------|
| Sí, por función (Recomendado) | research propone el modelo más barato que cumpla ~99%; techo Haiku 4.5 | ✓ |
| Todos Haiku 4.5 parejo | un solo modelo de fallback | |

### Q2: ¿Timeout guard además de detección por error? (maxRetries=0 implícito por N=1)
| Option | Description | Selected |
|--------|-------------|----------|
| Timeout informado por P95 (Recomendado) | research mide latencias reales y fija ~2-3x P95 por call-site | ✓ |
| Valor fijo agresivo (~10s) | sin medición previa | |
| Sin timeout extra | solo detección por error | |

### Q3: Cooldown del circuito
| Option | Description | Selected |
|--------|-------------|----------|
| 60 segundos (Recomendado) | olas de saturación duran minutos | |
| 30 segundos | recuperación más rápida a Gemini | ✓ |
| 5 minutos | conservador | |

### Q4: Probe de recuperación
| Option | Description | Selected |
|--------|-------------|----------|
| Half-open con tráfico real (Recomendado) | 1ª llamada post-cooldown intenta Gemini; si falla, fallback en esa misma llamada | ✓ |
| Probe sintético en background | infra y costo extra | |

---

## Claude's Discretion

- Estado del breaker: in-memory por lambda vs Redis Upstash compartido
- Política de errores: qué dispara fallback además de saturación/timeout
- Doble fallo (fallback también cae): comportamiento por call-site
- Knobs (constantes vs platform_config) + feature flag (probablemente innecesario — v4 DORMANT = gating natural)
- Predicado exacto de detección del error de saturación en AI SDK v6

## Deferred Ideas

- `v4-smoke-stability` (hermano, fuera de scope explícito)
- Generalizar el fallback a módulo shared
- Limpiar mapping stale `claude-haiku-4-5`→Sonnet en `claude-client.ts` (Regla 6 — deuda anotada)

## Cierre

**User's choice:** "crea contexto y lanzala el planning de una" + "incluyendo research obviamente" → chain a `/gsd-plan-phase gemini-fallback-haiku` (research incluido).
