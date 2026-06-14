# handoff-agent — FUTURE Context (semilla de diseño)

**Gathered:** 2026-06-13
**Status:** FUTURO — no ejecutar todavía. Contexto de diseño capturado para cuando se arranque el milestone.
**Depende de:** `.planning/standalone/v4-handoff-soft-signal/` (la señal `handoff_suggested` debe existir primero — este agente la consume).
**Type:** Agente NUEVO (requiere scope en `.claude/rules/agent-scope.md` — OBLIGATORIO al crear agente, CLAUDE.md).

<vision>
## Qué es

Un agente **separado** cuya ÚNICA responsabilidad es decidir el **handoff REAL** (apagar el bot / pasar a humano). v4 (y otros agentes en el futuro) emiten **señales blandas** (`handoff_suggested`) en sus puntos de determinación de handoff; este agente las **confirma o vetea** usando una **visión de conversación completa** que el agente por-turno no tiene.

**Patrón:** señal vs decisión (separación de responsabilidades).
- v4 = clasificador por-turno → "yo creo que esto va a humano, por X" (señal determinista).
- handoff-agent = motor de política con contexto global → "sí, realmente apagá" / "no, falso positivo, el bot sigue".

**Por qué:** pedirle a un agente por-turno (ve 1-2 mensajes) que tome la decisión irreversible de apagar el bot es visión de túnel. Una sola señal con falso positivo (ej: el caso alcohol→SNC) no debería matar la conversación. La decisión necesita el arco completo.
</vision>

<decisions>
## Decisiones de diseño (locked en conversación 2026-06-13)

### FD-01 — Ejecución async POR TURNO
- Corre **después de cada turno**, de forma **asíncrona** (estilo Inngest, patrón `recompra-preload-context` / no bloqueante). NO bloquea la respuesta al cliente. Puede mirar toda la conversación.

### FD-02 — v4 emite señal blanda; el handoff-agent decide
- La entrada del agente son las señales `handoff_suggested` (contrato definido en `v4-handoff-soft-signal/CONTEXT.md` D-03) + la conversación completa. La salida es la decisión dura (apagar / no apagar).

### FD-03 — La señal es DETERMINISTA, no agregados difusos
- El insumo NO es "conteo de turnos de baja confianza" ni métricas vagas. Es el **evento real** de determinación de handoff de v4 (los gates: guard_r0_r1, no_kb, low_confidence, binary_backstop, escalation_trigger, nunca_decir; vision). El "criterio difuso" (si hace falta) vive DENTRO del juicio del agente con contexto global, no como señal de entrada.

### FD-04 — Re-entrada / anti-oscilación: DIFERIDA
- Una vez que el agente apaga el bot, ¿vuelve? ¿cuándo? **Se decide cuando se construya el agente.** No resuelto.

### FD-05 — Agente NUEVO → scope obligatorio
- Antes de codear: definir PUEDE / NO PUEDE / Validación en `agent-scope.md` (CLAUDE.md "OBLIGATORIO al Crear un Agente Nuevo"). Probable scope: LEE conversación + señales; ESCRIBE solo el estado de handoff de la sesión (apagar/encender bot); NO muta CRM ni envía mensajes.
</decisions>

<open_questions>
## Preguntas abiertas (para el discuss del milestone)

- **¿Qué contexto lee exactamente?** historial de conversación + señales `handoff_suggested` acumuladas + ¿sentimiento? + ¿ya respondió un humano? + ¿horario/business-hours? + #señales consecutivas.
- **¿Cómo confirma/vetea?** ¿LLM con rúbrica? ¿reglas + LLM? ¿umbral de N señales? Definir el criterio de decisión.
- **¿Anti-oscilación / re-entrada?** (FD-04) reglas para no prender/apagar en loop.
- **¿Idempotencia?** corre async por turno → no debe re-decidir/duplicar apagados.
- **¿Puente interino?** mientras el agente NO existe (v4 ya en modo soft), ¿quién apaga el bot? ¿regla puente simple sobre las señales, o nadie apaga durante pruebas? (v4 dormant lo hace tolerable en pruebas; producción requiere puente).
- **¿Multi-agente?** el contrato `source` ya prevé que otros agentes (godentist, varixcenter…) emitan señales en el futuro — ¿el handoff-agent es genérico o per-agente?
- **¿Cómo surface la decisión DURA en el UI?** (vs la sugerencia blanda que ya muestra v4-handoff-soft-signal) — probablemente la Opción C estructurada (badge "bot pausado por handoff-agent — motivo X").

</open_questions>

<contract>
## Contrato de entrada (lo que produce v4-handoff-soft-signal)

```
handoff_suggested = {
  sessionId, conversationId, turnId,
  source: 'somnio-v4',                  // extensible a otros agentes
  layer: 'comprehension' | 'subloop',
  gate: 'guard_r0_r1' | 'vision' | 'no_kb' | 'low_confidence'
      | 'binary_backstop' | 'escalation_trigger' | 'nunca_decir',
  reason: <texto literal>,
  topic?: <sourceTopic>,
  createdAt
}
```
Fuente V1: eventos en `agent_observability_events`. Si el agente necesita lectura eficiente, evaluar persistir las señales en una tabla/columna dedicada (parte del discuss del milestone).
</contract>

<deferred>
## Fuera de alcance de esta semilla
- Toda la implementación (es un milestone futuro).
- Re-entrada, criterio de decisión, scope detallado — se definen en el discuss del milestone.
</deferred>

---

*Future seed: handoff-agent*
*Design captured: 2026-06-13 — NO ejecutar hasta arrancar el milestone.*
