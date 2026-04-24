# Agent Forensics Panel — Discussion Log

**Session:** 2026-04-23
**Format:** Conversational (user respondió las 13 preguntas del CONTEXT.md directamente, sin el flujo iterativo del `/gsd-discuss-phase`)
**Status:** All decisions locked. Ready for `/gsd-research-phase`.

---

## Decisiones locked

### Scope y alcance

**D-01. Scope del piloto: 3 bots.**
Bots incluidos: `somnio-sales-v3`, `somnio-recompra-v1`, `godentist-valoraciones`.
**Razón:** sales-v3 y recompra-v1 están acoplados por el routing bug (no se puede arreglar uno sin el otro). Godentist valoraciones se suma porque tiene comportamiento distinto y es un buen caso de prueba para validar que la arquitectura del auditor generaliza.
**Implicación:** 3 archivos de spec por bot a crear de arranque.

**D-02. Ubicación del panel: ruta actual + paralelismo en módulo nuevo.**
La vista forensics se construye sobre el panel existente en `src/app/(dashboard)/whatsapp/components/debug-panel-production/` (mismo lugar donde el usuario ya mira los turns). Adicionalmente se crea un módulo paralelo (ruta TBD en research) que centralice la experiencia forensics cross-bot.
**Razón:** no romper el flujo actual; iterar sobre lo que ya funciona.

**D-03. Invocación del auditor: manual (botón "Auditar sesión").**
El auditor AI no corre automáticamente al abrir un turn. El usuario presiona un botón explícito cuando quiere el análisis.
**Razón:** costo de tokens por invocación + no todas las sesiones ameritan auditoría.

### Timeline condensado

**D-04. Eventos relevantes: todo lo que refleje el mecanismo real del bot.**
Draft a confirmar en research: `pipeline_decision`, `salesAction` emitida, template enviado, intent detectado, `mode_transition`, `session_lifecycle` (start/close), tool calls de CRM (reader/writer), guard results, transitions aplicadas.
**Razón:** el usuario pidió explícitamente "todo lo que veas relevante para el mecanismo real del bot" — esto lo aterrizamos en research-phase con lista concreta por bot.

**D-05. SQL queries: se esconden TODAS en vista condensada.**
Toggle "Ver timeline completo" las muestra. Si luego resulta que hay SQLs que sí aportan (ej. INSERT a `agent_turns`, UPDATE a `session_state`), se reevalúa.
**Razón:** empezar simple, iterar. Usuario aprobó con "si acaso luego lo cambiamos".

**D-06. Snapshot de estado: `session_state` completo.**
No resumen, no campos filtrados. Dump completo del JSON de estado actual de la sesión.
**Razón:** usuario pidió "completo". El auditor también consume esto — mejor data cruda.

### Spec por bot (auditor)

**D-07. Spec vive en archivo dedicado por bot, consolidado y editable.**
Path TBD en research. Cada bot tiene UN archivo que contiene:
- Scope (qué PUEDE / NO PUEDE)
- Transitions clave
- Catálogo de templates aplicable
- Reglas de comportamiento esperado (cuándo manda promo, cuándo pregunta dirección, intents habilitados, etc.)
- Contratos con otros bots/módulos (ej. somnio-recompra ↔ crm-reader)

Este archivo es la **fuente de verdad** para el auditor y **editable por el usuario** cuando cambia el comportamiento esperado. No se autogenera — se mantiene a mano.

**Razón (user quote):** "cada bot debe tener un archivo para guiarse especifico y facilmente cambiable para ponerlo a funcionar como realmente debe en caso de que haya que hacer cambios"

**Implicación:** consolidar fuentes fragmentadas actuales (`CLAUDE.md`, `.claude/rules/agent-scope.md`, `.planning/standalone/somnio-recompra-template-catalog/`, prompts del agente) en los 3 archivos por bot. Research-phase debe proponer path + template de este archivo.

**D-08. Modelo del auditor: Claude Sonnet 4.6.**
Model ID: `claude-sonnet-4-6`.
**Razón:** usuario pidió Sonnet. Trade-off calidad > costo para este caso.

**D-09. Output del auditor: markdown pegable a Claude Code + legible humano.**
Un solo formato: markdown bien estructurado con pointers file:line, que sirve para:
- Pegarlo directo a Claude Code y tenga contexto accionable
- Que el usuario lo lea directamente en el panel

No se persigue JSON estructurado adicional (descartado — el usuario quiere solo markdown legible).

### Bug de etiquetado (agent_id)

**D-10. Fix: opción B — schema change con `responding_agent_id`.**
Agregar columna `responding_agent_id` (NULL) a `agent_observability_turns`. Persistirla desde el runner de recompra/goldentist. UI muestra `responding_agent_id ?? agent_id`.
**Razón:** preserva info de routing (sabes que entró a sales-v3 Y respondió recompra), que es útil para el auditor al analizar flujos de routing.
**Regla 5:** la migración SQL debe aplicarse en prod ANTES de pushear el código que la usa.

**D-11. Backfill de rows históricas: SÍ.**
Los turns viejos de recompra y godentist actualmente tienen `agent_id` errado (todos como `somnio-v3` o el agente de workspace). Se ejecuta un UPDATE one-shot que recalcula `responding_agent_id` para turns históricos — criterios de detección a definir en research (probablemente: buscar evento `pipeline_decision · recompra_routed` en el turn y setear `responding_agent_id = 'somnio-recompra-v1'`).
**Razón (user quote):** "la idea es dejarlos para tambien analizarlos si es necesario" — para poder analizar históricos con el label correcto.

**D-12. Fix del bug va como PRIMER plan del standalone.**
Secuencia: (1) migración + backfill + persistencia correcta → (2) resto del panel forensics. Pre-requisito porque el panel y el auditor dependen de que `responding_agent_id` esté poblado correctamente.

### Integración Claude Code

**D-13. Output auditor: pointers `file:line` + prosa narrativa.**
El auditor, cuando diagnostica un problema, emite markdown con:
- Diagnóstico en prosa ("el bot respondió X cuando debería haber respondido Y")
- Pointers concretos (ej. `src/lib/agents/somnio-recompra/response-track.ts:36`)
- Evidencia del timeline ("en el evento `pipeline_decision · order_decision` se emitió ...")
- Pegable directo a Claude Code para que accione el fix.

---

## Resumen ejecutivo de trade-offs

- **Alcance:** 3 bots vs 1 — elegimos 3 porque sales-v3 y recompra-v1 son inseparables (routing) y godentist valida generalización.
- **Fix del bug:** B (schema) vs A (mutar tracker) — elegimos B por auditabilidad de routing.
- **Backfill:** SÍ vs prospectivo — elegimos SÍ para poder analizar históricos.
- **Auditor:** manual vs auto — elegimos manual por costo.
- **Spec por bot:** archivo consolidado vs lectura fragmentada — elegimos consolidado + editable para que sea single source of truth del comportamiento esperado.
- **Modelo:** Sonnet 4.6 vs Haiku 4.5 — elegimos Sonnet por calidad del diagnóstico.

---

## Siguiente paso

```
/gsd-research-phase agent-forensics-panel
```

**Research-phase debe cerrar:**

1. Path y template exacto del archivo de spec por bot (D-07).
2. Lista concreta de eventos relevantes por bot para timeline condensado (D-04).
3. Nombre de columna + tipo + constraints de la migración `responding_agent_id` (D-10).
4. Criterio de detección para el backfill one-shot (D-11).
5. Arquitectura de invocación del auditor: desde dónde se llama, cómo recibe contexto, cómo retorna markdown al panel (D-03 + D-13).
6. Estructura del módulo paralelo de forensics (D-02).
7. Patterns existentes de markdown + file:line rendering en la codebase (si los hay).
