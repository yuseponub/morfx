# v4-llm-fallback-resilience — Discussion Log

> **Audit trail only.** No es input para research/plan/execute. Las decisiones viven en CONTEXT.md.

**Date:** 2026-06-14
**Phase:** v4-llm-fallback-resilience (standalone)
**Areas discussed:** Alcance del fallback, Reporte de créditos, Doble fallo billing, Schema (corrección)

---

## Selección de áreas

| Opción | Seleccionada |
|--------|--------------|
| Alcance del fallback | ✓ |
| Reporte de créditos | ✓ |
| Doble fallo billing | ✓ |
| Schema slim | ✗ (usuario: "fue una suposición tuya, realmente era que no tenía créditos; investigar si es necesario porque no creo realmente") |

**Nota:** El usuario corrigió la premisa del schema-slim → reclasificado como verificación de research (D-08), fuera de scope de implementación.

---

## Alcance del fallback

| Pregunta | Opción elegida |
|----------|----------------|
| ¿Créditos agotados en Gemini? | **Cae a Haiku pero avisa siempre que se acabó sin créditos** |
| ¿Union-types como disparador? | **Sí, pero con evento ruidoso** |

**Notas:** Preserva Pitfall #4 — disparadores nombrados/específicos; parse/NoObjectGenerated genuino sigue re-lanzando.

---

## Reporte de créditos

| Pregunta | Opción elegida |
|----------|----------------|
| ¿Dónde avisar? | **Correo personal al operador con workspace** (free text) |
| ¿Email destino? | `joseromerorincon041100@gmail.com` |
| ¿Persistir evento observability? | **Sí, correo + evento `llm_credits_depleted`** |
| ¿`[ERROR AGENTE]` técnico en inbox? | **Mantenerlo siempre** |

**Notas:** Email = canal nuevo → research debe localizar la infra de envío. El evento sirve de registro durable + base de dedup.

---

## Doble fallo billing

| Pregunta | Opción elegida |
|----------|----------------|
| ¿Si Gemini Y Haiku fallan? | **Handoff suave + correo urgente** |
| ¿Diferenciar del correo normal? | **Sí, dos severidades** |

**Notas:** Reusa la señal `handoffSuggested` shipeada en v4-handoff-soft-signal.

---

## Claude's Discretion
- Estructura de archivos del predicado nuevo, mecanismo de envío de correo, formato del cuerpo.

## Deferred Ideas
- Schema-slim (solo si research lo justifica), ampliar a otros agentes, recargar créditos (operador), canales de alerta adicionales.
