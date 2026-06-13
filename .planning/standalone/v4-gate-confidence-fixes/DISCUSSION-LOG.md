# v4-gate-confidence-fixes — Discussion Log

> **Audit trail only.** No es input para research/plan/execute. Las decisiones viven en CONTEXT.md.

**Fecha:** 2026-06-13
**Tipo:** Standalone
**Origen:** diagnóstico en vivo de `somnio-sales-v4` con la observabilidad nueva (`v4-observability-completeness`).
**Áreas discutidas:** scope del standalone, puerta del CRM gate, default del response_confidence threshold.

---

## Scope (qué entra / qué se difiere)

| Item | Decisión |
|------|----------|
| #1.a Puerta del gate con datosCriticos | ✓ IN |
| #1.b Blindaje del crash AI_NoObjectGeneratedError | DIFERIDO (el gate es para mutaciones, no para responder; riesgo residual anotado) |
| #2 Guardar secondary_confidence | ✓ IN |
| #3 RESPONSE_CONFIDENCE_THRESHOLD → platform_config | ✓ IN |
| Zombie 70s (P0) | DIFERIDO — standalone follow-up (requiere investigar gap 31.8s sin heartbeat) |
| KB interacciones (flip de fondo) | DIFERIDO |

**Empaque del zombie:** opciones "standalone aparte primero" / "todo junto" / "estos 3 primero, zombie después". **Elegido: estos 3 primero, zombie después.**

---

## Puerta del CRM gate

| Opción | Descripción | Selected |
|--------|-------------|----------|
| datosCriticosJustCompleted | Prende solo el turno en que se completan TODOS los críticos. Alinea con buildCrmHint. Bucaramanga no prende. | ✓ |
| datosCriticos completos | Prende mientras todos los críticos estén presentes; requiere pasar gates.datosCriticos. | |
| Guard por category | Mantener shipping-field trigger pero solo si category ∈ {datos, mixto}. | |

**Elección:** `datosCriticosJustCompleted`.

---

## Default del response_confidence threshold (al migrar a platform_config)

| Opción | Descripción | Selected |
|--------|-------------|----------|
| 0.70 (sin cambio) | Cero cambio de comportamiento (Regla 6); solo tuneable por SQL. | ✓ |
| Bajarlo ya (~0.60) | Migrar y bajar para que borderline como alcohol (0.6) se envíe. Cambia comportamiento ya. | |

**Elección:** 0.70 (sin cambio).

---

## Hipótesis explorada (no es decisión — exploración del usuario)

- **¿Se contaminan los 2 confidences medidos en un mismo call?** Verificado con `scripts/_v4-probe-comprehension.ts` (temp=0): `tiempo_entrega` combinado 0.88 == aislado 0.88; alcohol primary 0.3 vs aislado 0.25. **No se sostiene** en el caso probado. El secondary se mide bien.
- **¿Otro LLM mide el secondary?** No — un solo `generateText` (Gemini 2.5 Flash, fallback Haiku 4.5) reporta ambos confidences.
- **¿Cambió el sistema de threshold?** El de escalación se hizo parametrizable + se quitó la fórmula (D-65) en Plan 07 del standalone original. El de generación quedó hardcodeado — de ahí la inconsistencia que el usuario recordaba.

## Claude's Discretion
- Nombre exacto de la key platform_config; cómo cablear el lookup async en sub-loop; si comprehension_completed_v4 agrega secondary+secondary_query además del confidence; si trigger (c) category='datos' del gate queda intacto.

## Deferred Ideas
- Blindaje crash sub-loop CRM; zombie 70s; enriquecimiento KB interacciones.
