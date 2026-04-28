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

---

## Sesión 2 — 2026-04-25 (post Plan 04 smoke test)

**Trigger:** Tras shipping de Plan 04 y validacion del auditor base, el usuario identifico 2 limitaciones criticas del auditor v1:
1. **Audita por turno aislado** — sin contexto de los demas turns de la sesion → se confunde, infiere mal, genera falsas alarmas (ej. "gap de 11s suspicioso" verificado falso, ver Plan 04 SUMMARY §Pitfalls).
2. **No hay forma de inyectar hipotesis del usuario** — el auditor analiza blind, sin aprovechar que el usuario YA sabe que sospecha del bot.

**Decision estructural:** insertar nuevo Plan 05 (`auditor-multi-turn-and-hypothesis`) ANTES del cierre del phase. El Plan 05 viejo (LEARNINGS + docs + tests) se renumera a Plan 06.

### Decisiones lockeadas

**D-14. Multi-turn context: sesion actual completa, granularidad media.**
El audit de un turn N debe incluir contexto de TODOS los turns previos de la misma sesion. Granularidad:
- **Turn auditado (N):** timeline condensado COMPLETO + session snapshot completo (igual que hoy).
- **Turns previos de la sesion (1..N-1):** version "ligeramente condensada" — NO ultra-resumen, sino: intent detectado + salesAction emitida + templates enviados + transition reason + key state changes (datos capturados nuevos, mode change si aplica) + duracion + cualquier pipeline_decision relevante.
- **Razon (user quote):** "no super condensada, sino ligeramente condensada con suficiente contexto para entender bien la logica de cada turno". Permite al auditor entender la linea de la conversacion sin saturar el prompt.
- **Implicacion arquitectural:** debe incluir TAMBIEN turns de crm-reader (cuando existen para esa sesion) — el reader emite eventos `crm_reader_completed/failed/empty/timeout` que afectan la interpretacion del comportamiento del agente.

**D-15. Cap de tokens: 50K total prompt.**
- Cap suave. Si la sesion excede 50K tokens en contexto multi-turn, truncar a los **ultimos N turns** + flag visual al usuario en la UI: "sesion trimmed (mostrando ultimos N de M turns)".
- **Razon (user quote):** "no lo estaremos usando mucho que digamos" — el cap alto cubre la mayoria de sesiones reales (Somnio promedia 3-15 turns) sin gating prematuro.
- **Costo estimado por audit con cap maximo:** ~50K tokens prompt × $3/1M = $0.15 input + ~3K tokens response × $15/1M = $0.045 output = ~$0.20 por audit en el peor caso. Tipico: $0.05-0.10.

**D-16. Input de hipotesis: hibrido text-box pre-audit + chat de seguimiento.**
- **Pre-audit (opcional):** text-box arriba del boton "Auditar sesion" donde el usuario escribe su hipotesis ANTES del primer audit. Si esta llena, el system prompt incluye: "El usuario sospecha: <hipotesis>. Investiga especificamente si esto es correcto o incorrecto, citando evidence del timeline + spec."
- **Chat de seguimiento (continuo):** despues del primer audit (sea blind o con hipotesis), aparece un input "Pregunta de seguimiento" debajo del markdown renderizado. Permite refinar ("no, no me importa eso, fijate en el template del segundo turn"), pedir mas detalle, contradecir el diagnostico. Backend mantiene historial de mensajes del audit en memoria de la session UI.
- **Razon:** la text-box pre-audit es trivial de agregar y muy util cuando ya sabes que buscar. El chat es el verdadero unlock — convierte el auditor de oracle one-shot en assistant interactivo. Ambos juntos cubren ambos modos de uso (blind exploration vs guided investigation).

**D-17. Persistencia: tabla nueva `agent_audit_sessions`.**
Schema:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `turn_id UUID NOT NULL` — FK al turn auditado en `agent_observability_turns(id)`
- `workspace_id UUID NOT NULL` — para RLS/scoping
- `user_id UUID NOT NULL` — quien corrio el audit (super-user)
- `responding_agent_id TEXT NOT NULL` — agente del turn auditado
- `conversation_id UUID NOT NULL` — para indexar por conversation
- `hypothesis TEXT NULL` — la hipotesis del usuario si fue pre-audit (D-16), NULL si fue blind
- `messages JSONB NOT NULL DEFAULT '[]'::jsonb` — array de `{ role: 'user' | 'assistant', content: string, timestamp: timestamptz }` con todo el chat (audit + follow-ups)
- `cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0` — costo acumulado (input + output tokens × pricing)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())` — Regla 2
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())`
- Indices: `(workspace_id, conversation_id, created_at DESC)` para listado en UI futuro, `(turn_id, created_at DESC)` para reabrir audits del mismo turn.
- **Razon:** permite reabrir audits viejos, ver historial de hipotesis correctas/incorrectas, busqueda futura por workspace/agent/conversacion. Base para mejora continua del auditor (ej. captura de patrones de hipotesis frecuentes).
- **Regla 5:** la migracion SQL se aplica en Supabase prod ANTES del push de codigo que la usa.

**D-18. Sin prompt caching en esta version.**
- Cache requiere 2+ audits del mismo agente en <5min para amortizar la complejidad de implementacion + cache reads vs ahorro real.
- Bajo volumen esperado de uso del auditor — no justifica el overhead.
- **Razon (user quote):** "no vamos a utilizar muchisimos audits tampoco". Si el uso aumenta en el futuro, agregamos en standalone trivial (es solo flag de configuracion).
- **Aclaracion importante:** prompt caching NO degrada calidad — el modelo ve el mismo contenido. Es solo optimizacion de billing/latencia que aplica cuando hay re-uso temporal cercano. Skip por ROI, no por riesgo.

**D-19. Multi-turn context incluye crm-reader turns cuando existen.**
- Si la sesion auditada tiene turns con `responding_agent_id='crm-reader'` (porque el feature flag `platform_config.somnio_recompra_crm_reader_enabled` estaba on para ese workspace y el flow disparó al reader), esos turns deben incluirse en el contexto multi-turn — no solo los turns conversacionales.
- **Razon:** el comportamiento del agente conversacional (somnio-recompra-v1, somnio-sales-v3-pw-confirmation) depende del resultado del crm-reader. Si el reader retorno `_v3:crm_context` con histórico de pedidos, eso afecta cómo el agente interpreta `quiero_comprar` (ej. "ya conozco al cliente, salto direccion"). Auditar el agente sin ver el reader es analisis incompleto.
- **Implicacion:** el query de carga del contexto debe `JOIN` o `IN (SELECT ...)` para traer todos los turns con misma `conversation_id` y `started_at` overlapping con la sesion (no solo filtrar por `responding_agent_id` del agente principal).

---

## Siguiente paso (sesion 2)

```
/gsd-research-phase agent-forensics-panel  # solo para Plan 05 nuevo
/gsd-plan-phase agent-forensics-panel       # produce 05-PLAN.md detallado
```

**Research-phase Sesion 2 debe cerrar:**

1. Estrategia exacta de cargar todos los turns de la sesion (incluyendo crm-reader) — query SQL + cursor de paginacion si necesario (D-14, D-19).
2. Algoritmo de "ligeramente condensado" para turns previos — que campos exactos del timeline y session snapshot incluir, formato JSON optimizado para tokens (D-14).
3. Cap de tokens — como medir tokens del prompt antes de mandarlo al modelo, biblioteca/funcion a usar, fallback de truncado (D-15).
4. Pattern de chat continuo en AI SDK v6 con `useChat` — como mantener conversacion multi-message contra el mismo endpoint, persistir cada round en `agent_audit_sessions.messages` (D-16, D-17).
5. Schema migration para `agent_audit_sessions` — validar que indices propuestos cubren los queries reales del UI (D-17, Regla 5).
6. UI patterns existentes en codebase para text-box + chat (revisar componentes shadcn ya en uso) (D-16).
7. Ejemplo concreto del system prompt extendido con "El usuario sospecha: ..." — verificar que no rompe la regla de los 4 headers obligatorios del Plan 04 (D-16, alinear con D-09).
