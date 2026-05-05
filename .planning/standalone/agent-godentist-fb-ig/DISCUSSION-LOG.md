# Discussion Log: Agent GoDentist FB/IG (Sibling)

**Date:** 2026-05-05
**Purpose:** Capture decision rationale beyond CONTEXT.md (questions asked, alternatives discarded, user's verbatim answers).

---

## Trigger

Usuario, post-shipping de `routing-channel-fact` (2026-05-04, commit `c410085`):

> "no te entiendo, ya podria rutear con channel o hay que crear la columna? no entiendo esto 'Opción B: columna channel en agent_templates'"

Aclaración: el routing por canal YA funciona; la decisión Opción A vs B era sobre **cómo construir el agente** que recibe esas conversaciones FB/IG (sibling completo vs columna channel en templates).

Usuario eligió **Opción A** (sibling completo):

> "ok opcion A agente sibling, editamos el agente actual y creamos una NUEVA VERSION (se crea otro agente desde 0 con otros template y demas)"

Y proporcionó el saludo nuevo:

> "👋 ¡Hola! Soy goBot 🤖 de godentist ®️.
> Tu valoración odontológica es totalmente GRATIS 🦷✨
> Déjanos estos datos y reservamos tu cita de inmediato:
> 📌 Nombre completo
> 📌 Celular
> 🔒 Al compartir tus datos, autorizas su tratamiento conforme a la Ley 1581 de 2011 (Habeas Data).
> Estás a un paso de comenzar tu nueva sonrisa 💙 ¿Deseas agendar tu cita de valoración G..."

---

## Discovery del estado actual del agente godentist

Antes de pedirle decisiones, exploré el código del godentist actual para entender qué se puede reusar:

- `GODENTIST_AGENT_ID = 'godentist'` en `src/lib/agents/godentist/config.ts:11`
- Pipeline v3 (comprehension Haiku + state machine determinista)
- Webhook entry: `webhook-processor.ts:765` (branch `agentId === 'godentist'`)
- Catálogo global: ~75 templates en `agent_templates` con `agent_id='godentist'`, `workspace_id=NULL`
- 23 intents, 4 sedes hardcoded, 23 servicios dentales
- State machine: `nuevo → conversacion → captura → captura_fecha → mostrando_disponibilidad → confirmacion → cita_agendada → handoff`
- Saludo actual (template DB seed):
  > "¡Hola! Bienvenido a GoDentist, nuestra felicidad es verte sonreír 😊 ¿Deseas agendar tu cita de valoración GRATIS?"
- `CRITICAL_FIELDS = ['nombre', 'telefono', 'sede_preferida']`
- Datos pedidos en `pedir_datos`: nombre + celular + sede (todos juntos)
- Habeas Data: NO mencionado en ningún template

Diferencias detectadas vs saludo nuevo: identidad ("goBot 🤖" vs "GoDentist"), pide datos en saludo (vs después), Habeas Data inline (vs no mencionado), no pide sede en saludo (vs sí).

---

## Preguntas hechas al usuario y respuestas

### Bloque A — Identidad y scope

**A.1 — Canales atendidos**
> Pregunta: ¿solo FB/IG o también otros canales futuros (web chat, Messenger)?
> Aclaración hecha por mí: "FB Messenger" y "facebook" son la misma superficie (mensajes a la página de FB llegan por Messenger → `conversations.channel='facebook'`).
> Respuesta: "ok" (confirma `channel in [facebook, instagram]` solo).
> → **D-01 locked.**

**A.2 — Workspace target**
> Pregunta: ¿es solo el workspace de "GoDentist" o también algún sandbox?
> Usuario: "es 'GoDentist Valoraciones', no 'GoDentist' (este es el nombre de otro). dame el sql para buscarlo"
> SQL ejecutado por usuario:
> ```
> id: f0241182-f79b-4bc6-b0ed-b5f6eb20c514
> name: GoDentist Valoraciones
> slug: godentist-valoraciones
> created_at: 2026-03-18 14:14:38.363557+00
> ```
> → **D-02 locked.** (Workspace distinto del godentist principal — clave para no mezclar el routing.)

**A.3 — Nombre del directorio standalone**
> Pregunta: ¿`godentist-fb-ig-sibling`, `godentist-meta-sibling`, `godentist-fb-ig`, u otro?
> Usuario: "da igual elige tu" + escogió antes el agent_id `godentist-fb-ig`.
> → Directorio: `agent-godentist-fb-ig` (sigue convención de `agent-lifecycle-router`, `agent-godentist`).
> → **D-03 locked.**

### Bloque B — Saludo y captura inicial

**B.1 — Disclaimer adicional / consentimiento explícito**
> Pregunta: ¿URL de política de privacidad? ¿Botón "Sí acepto" antes de capturar?
> Usuario: "sin disclaimer adicional, y no, no deben aceptar"
> → **D-06 locked.** Mandar datos = consentimiento implícito.

**B.2 — Comportamiento ante respuesta irrelevante post-saludo**
> Pregunta: si cliente responde "hola que servicios tienen?" en vez de mandar nombre+celular, ¿qué hace el bot?
> Usuario: "se responde a su pregunta, como lo haria el bot normal. y tambien mantener la pregunta de si desea agendar su cita (que va despues de pregunta informacional, despues de un tiempo con ingers)"
> → **D-07 locked.** Reusa lógica del godentist actual (informational + retoma via timer); lead capture es OPORTUNISTA, no bloqueante.

**B.3 — `pedir_datos_parcial` wording**
> Pregunta: si cliente envía solo nombre, ¿wording especial para FB/IG?
> Usuario: "si, pedimos los que hagan falta y luego sigue el resto de flujo de agendamiento"
> → **D-08 locked en parte.** El template `pedir_datos_parcial` se reusa idéntico al godentist (con `{{campos_faltantes}}`).

**B.4 — Resto del flujo post-captura**
> Pregunta: ¿mismo flujo idéntico (mostrar disponibilidad → confirmación → cita_agendada)?
> Usuario: "exacto, el mismo flujo"
> → **D-13 locked.** State machine sin cambios.

### Bloque C — Catálogo de templates

**C.1 — Templates a clonar/cambiar**
> Pregunta: ¿saludo + pedir_datos + cita_agendada + handoff + no_interesa?
> Usuario: "exacto esos solamente" (refiriéndose a que solo hay que cambiar el saludo + ajustar lógica de captura parcial).
> → **D-08 locked completo.** Solo el template `saludo` cambia; los ~74 restantes se clonan idénticos verbatim.

**C.2 — Templates de precios**
> Pregunta: ¿texto idéntico o tono goBot?
> Usuario: "identico"
> → **D-08 locked.** Idénticos.

**C.3 — `english_response`**
> Pregunta: ¿se clona igual o se ajusta?
> Usuario: "solo es un template? si supongo que igual"
> → **D-08 locked.** Idéntico.

### Bloque D — Comprehension y state machine

**D.1 — Intents**
> Pregunta: ¿mismos 23 o agregamos `consentimiento_habeas`?
> Usuario: "mantenemos los mismos"
> → **D-10 locked.** No nuevo intent.

**D.2 — Modelo de comprehension**
> Pregunta: ¿Haiku (mismo) u otro?
> Usuario: "el mismo"
> → **D-12 locked.** Haiku.

**D.3 — State machine**
> Pregunta: ¿reusa exactamente esta máquina?
> Usuario: "la misma"
> → **D-13 locked.** Sin estados nuevos.

### Bloque E — Activación y rollout

**E.1 — Feature flag**
> Pregunta: ¿con feature flag o solo via routing rule?
> Usuario: "con routing"
> → **D-14 locked.** Sin flag (Regla 6 satisfecha por ausencia de regla = sin tráfico).

**E.2 — Routing rule auto-creada o manual**
> Pregunta: ¿migración crea regla default-OFF o operador la crea?
> Usuario: "no, yo la creo"
> → **D-15 locked.** Manual via `/agentes/routing/editor`.

**E.3 — Workspace de pruebas**
> Pregunta: ¿sandbox primero o producción directo?
> Usuario: "pasamos a produccion directo (pues se activa es con el routing, el agente actual queda funcionando igual como default"
> → **D-16 locked.** Deploy directo a prod del workspace "GoDentist Valoraciones"; el blast radius lo controla el routing engine.

### Bloque F — Tests y verificación

**F.1 — Suite de tests**
> Pregunta inicial: ¿clones del godentist (más caro) o solo tests de lo nuevo (mínimo)?
> Usuario respondió primero F.2 con confusión: "no entiendo, como asi 'tests' del siblig, pues lo test serian del bot real nuevo sibling"
> Yo aclaré: "Me refería a unit tests automatizados (los archivos .test.ts que corre vitest), no pruebas manuales..."
> Usuario después de aclaración: "ah ok respecto a esto, haz los tests que necesites para que funcione bien"
> → **D-17 locked.** Suite completa, blindada — no minimalista. Implementador tiene libertad para cubrir lo que considere necesario.

**F.2 — Validación E2E**
> Pregunta: ¿script automatizado vs pruebas manuales?
> Usuario: "no yo hago mis pruebas manuales"
> → **D-18 locked.** Manual end-to-end por el usuario en prod (FB página + IG perfil reales).

---

## Decisiones derivadas (Claude's Discretion)

Decisiones técnicas lockeadas sin gray-area dedicado, basadas en patrones validados del codebase:

- **D-04** — Coexistencia con godentist original (patrón `somnio-sales-v3-pw-confirmation`).
- **D-05** — Texto del saludo locked verbatim del usuario.
- **D-09** — Lead capture parser via intent `datos` (ya existente) + cálculo de campos faltantes (helpers ya existentes en `comprehension.ts`).
- **D-11** — Comprehension prompt reusa el del godentist + 1-2 ejemplos extras de lead capture.
- **D-19** — Project skill + actualización de `.claude/rules/agent-scope.md` (regla obligatoria del proyecto al crear agente nuevo).
- **D-20** — LEARNINGS documenta el pattern "agente sibling para canal alterno" como reusable.

---

## Alternativas descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Opción B (columna `channel` en `agent_templates`) | Usuario eligió Opción A explícitamente. Opción B mezclaba lógica de canal dentro del agente único, complicando el system prompt y la selección de templates. |
| Splitear FB e IG en dos agentes (`godentist-fb` + `godentist-ig`) | Saludo y comportamiento idénticos para ambos. Splitear duplica código sin ganancia. Diferido para si en el futuro divergen (ver `<deferred>`). |
| Agregar intent `consentimiento_habeas` | Usuario descartó (D-10). Agrega ruido al clasificador sin valor (mandar datos = consentimiento implícito). |
| Cambiar modelo a Sonnet/Opus para comprehension | Variable confusa para debug. El sibling es estructuralmente idéntico al godentist; cambiar modelo pierde la base de comparación A/B. (D-12) |
| Feature flag `godentist_fb_ig_enabled` | Ceremonia sin valor — el routing engine es el control point. (D-14) |
| Migración inserta routing rule | Riesgo de colisión de priority con otras reglas existentes. Usuario decide priority correcto manualmente. (D-15) |
| Workspace de pruebas separado | El routing rule controla el blast radius. Sin regla = sin tráfico. (D-16) |
| Tests minimalistas (solo lo que difiere) | Usuario explícitamente dijo "haz los tests que necesites para que funcione bien" → suite completa blindada. (D-17) |
| Script E2E automatizado contra Meta APIs | Usuario hace pruebas manuales. Costo + flakiness alta de E2E vs Meta. (D-18) |

---

## Notas para el siguiente paso (research-phase)

El research debe enfocarse en:

1. **Inventario completo del módulo `src/lib/agents/godentist/`** — listar TODOS los archivos a clonar, sus dependencias (imports), y identificar exactamente qué cambia (idealmente: solo el `agent_id` constant + el texto del saludo + lead capture parser en transitions/sales-track).
2. **Patrón de registro multi-agente** — cómo `somnio-sales-v3-pw-confirmation` se registró en `agentRegistry`, `agent-catalog.ts`, y se pre-importa en `webhook-processor` para evitar cold-lambda race.
3. **Estructura de la migración SQL** — confirmar el patrón idempotente con `DELETE WHERE agent_id='godentist-fb-ig'` + `INSERT ... SELECT ... FROM agent_templates WHERE agent_id='godentist'` con `CASE WHEN intent='saludo' ...`.
4. **TemplateManager lookup contract** — confirmar que el TemplateManager NO cachea agent_id (cada lookup es fresh, anti-regresión D-08 vs el caso del cdc06d9 revertido).
5. **Lead capture: extracción de nombre/teléfono del slot payload** — confirmar que `comprehension.ts` ya retorna `slots.nombre` y `slots.telefono` correctamente cuando el cliente manda datos, y diseñar la lógica de "calcular campos_faltantes" como helper puro testeable.
6. **Tests del godentist actual** — revisar `src/lib/agents/godentist/__tests__/` (si existe) como referencia para estructurar la suite del sibling (D-17).
7. **Integration test contra Inngest webhook**: ver si el patrón de tests del `somnio-sales-v3-pw-confirmation` standalone incluye integration tests que disparan el flujo completo, y si aplica para el sibling.

---

*Discussion captured: 2026-05-05*
*Next: `/gsd-research-phase agent-godentist-fb-ig`*
