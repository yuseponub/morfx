# Standalone: Routing Channel Fact - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Standalone:** routing-channel-fact
**Areas discussed:** Surface del fact, Comportamiento ante error/missing data, Audit log

---

## Surface del fact

| Option | Description | Selected |
|--------|-------------|----------|
| Solo `channel` (Recommended) | Un solo fact que devuelve 'whatsapp' \| 'facebook' \| 'instagram' \| null. Las reglas usan el operador `in` para agrupar. Mantiene el registry minimal. | ✓ |
| `channel` + `isMetaChannel` | Agrega un helper booleano derivado via almanac que devuelve true si channel es facebook o instagram. Mas comodo en reglas comunes, pero crea dos facts donde uno alcanza. | |
| `channel` + `isMetaChannel` + `isWhatsappChannel` | Tres facts. Maxima conveniencia para escribir reglas, pero mas superficie que mantener y mas cosas que documentar. | |

**User's choice:** Solo `channel` (Recommended)
**Notes:** Mantiene minimal el registry. Helpers se pueden agregar despues si la friccion es real.

---

## Comportamiento ante error / missing data

(Re-asked after first attempt — user pidio aclaracion sobre "si la conversacion no existe o falla la query"; se explico con casos concretos: query a Supabase falla, conversationId null, conversacion borrada. Ejemplo de comportamiento de cada opcion para una regla `channel in [facebook, instagram]`.)

| Option | Description | Selected |
|--------|-------------|----------|
| Retornar null (Recommended) | Lo mas seguro y consistente con los 11 facts existentes. Si falla la query, queda registrado en console.error pero el routing sigue funcionando con las demas reglas/facts. Reglas con operador `in` o `equal` simplemente no matchean. | ✓ |
| Default a 'whatsapp' | Asume WhatsApp si no se puede leer. Riesgo de enmascarar bugs si alguien escribe una regla `channel == 'whatsapp'` — matchera cuando en realidad fue un error transitorio. | |
| Throw / fallback_legacy | Un error en esta query tumba TODO el sistema de routing para ese mensaje (cae al if/else viejo). Conservador pero desproporcionado para un error que puede ser transitorio. | |

**User's choice:** Retornar null (Recommended)
**Notes:** Despues de aclaracion sobre los casos edge (query failure, conversationId null, conversacion borrada).

---

## Audit log

| Option | Description | Selected |
|--------|-------------|----------|
| Si, agregar a FACT_NAMES_TO_SNAPSHOT (Recommended) | Cada decision de routing queda registrada con el canal en routing_audit. Visibilidad completa para debug y para entender por que se eligio X agente. Costo: 1 columna mas en el JSONB del facts_snapshot. | ✓ |
| No snapshotear | Mas liviano, pero al debuggear una decision de routing no podras ver si el canal influyo. Tendrias que cruzar con la tabla conversations manualmente. | |

**User's choice:** Si, agregar a FACT_NAMES_TO_SNAPSHOT (Recommended)
**Notes:** Visibilidad completa para debug.

---

## Claude's Discretion

Las decisiones tecnicas D-04 a D-13 fueron tomadas por Claude bajo discrecion del usuario (rol builder), siguiendo patrones establecidos del standalone padre `agent-lifecycle-router`:

- D-04 — Domain helper `getConversationChannel`
- D-05 — `FactContext` extension con `conversationId?`
- D-06 — `BuildEngineInput` extension
- D-07 — Pase desde `route.ts`
- D-08 — Sin caching dedicado (almanac builtin alcanza)
- D-09 — Schema JSON sin cambios
- D-10 — Sin migracion DB (`conversations.channel` ya existe)
- D-11 — Tests obligatorios (unit + integration + audit)
- D-12 — Backward compat (cero impacto en reglas existentes)
- D-13 — Activacion sin feature flag (Regla 6 no aplica — primitive read-only)

## Deferred Ideas

- Diferenciar saludo GoDentist por canal: Opcion A (agente sibling) vs Opcion B (columna `channel` en `agent_templates`). Decision producto, conversacion siguiente.
- Reglas concretas en `routing_rules` que usen `channel` — siguiente conversacion.
- Helpers derivados (`isMetaChannel`) — solo si friccion real aparece.
- Facts futuros (`messageContent`, `inboundMessageType`) — fuera de scope hoy.
- UI de routing-editor que liste facts disponibles — mejora observability futura.
