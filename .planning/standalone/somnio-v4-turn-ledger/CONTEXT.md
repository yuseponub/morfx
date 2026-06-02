# CONTEXT — somnio-v4-turn-ledger

**Created:** 2026-05-28
**Status:** discuss-phase
**Agent:** somnio-sales-v4 (DORMANT en prod — Regla 6 satisfecha)
**Sequence:** standalone #1 de 3 (ver memoria `somnio_v4_architecture_roadmap`)

---

## El problema (de fondo)

El camino de **escritura al estado** de v4 está fragmentado. Cada rama del agente
decide por su cuenta qué persiste, y la rama RAG se salta el registro:

- `mergeAnalysis` empuja `intentsVistos` a mitad de turno (es entrada de decisión —
  `response-track` lo lee para suprimir re-saludo).
- El track de templates empuja `templatesMostrados` + `accionesEjecutadas`.
- **La rama RAG (`mapOutcomeToAgentOutput`) hace `return` temprano y NO registra nada
  durable** — `sourceTopic` / `responseConfidence` viven solo en observability + en
  `decisionInfo` (debug por-turno), no en estado persistido.
- Las acciones CRM se guardan finas: `accionesEjecutadas` = `{tipo, turno, origen,
  crmAction:true}` — sin qué tool, ni args, ni resultado (success/failed/cas_reject).

**Consecuencia:** el estado es un reflejo del camino determinista, no del agente
completo. No hay concepto `intent_kb`. Una conversación respondida por RAG sobre
"apnea" no deja rastro consultable → el turno siguiente no sabe que ya se respondió →
riesgo de re-responder / incoherencia. Y cuando el CRM se mude al sub-loop (standalone
#2), el CRM se vuelve **totalmente invisible** al estado salvo que esto se arregle antes.

## "Cerrar el ciclo"

Que **todo turno, venga de donde venga (templates, RAG, CRM, timer), produzca UN
registro canónico de lo que hizo, y UN solo commit lo persista.** Si el commit es el
único que escribe, ninguna rama puede "olvidar". Eso hace el estado un reflejo **real**
de todo el agente (RAG y CRM incluidos) → "state visual real" + base para el híbrido B.

## Approach elegido: Unified Turn Ledger (Opción 2)

NO bolt-on (parche por dimensión). NO event-sourcing (sobre-ingeniería, reescribe
persistencia). Sí: un `TurnLedger` que toda rama produce + commit único al final.

**Refinamiento crítico (Punto 2 del usuario):** separar dos cosas que NO se deben
conflactuar:
- **Cognición intra-turno (working state):** `mergeAnalysis → mergedState → gates →
  sales-track → response-track`. Se queda **idéntica**. NO se difiere. Las decisiones
  siguen leyendo el `mergedState` vivo. `intentsVistos` se empuja antes porque es entrada.
- **Efectos del turno (lo que el ledger captura):** topics KB, CRM tool+result, texto
  generado. Se computan **después** de la decisión y nada intra-turno los lee (en el
  diseño excluyente actual) → se pliegan limpios al final. El "commitTurn único" es un
  **principio** (toda salida serializa el estado COMPLETO con las dims nuevas), no una
  reescritura mecánica de todas las escrituras.

## Alineación con interrupción (sin cambios al mecanismo)

El commit/serialize al final = **frontera transaccional**. Working state efímero hasta
serializar. Interrupt Path A antes del commit → descartar + re-run (incluye `turnCount++`,
por eso hoy no se double-incrementa). `carryState` Path B = el estado serializado de msg1.
Mismo principio que ya dejamos en `debounce-v2-interrupt-reprocess` — nada nuevo que inventar.

## Lo que el ledger debe capturar

- `comprehension`: intent primary/secondary/confidence (alimenta `intentsVistos` como hoy).
- `atendido[]`: `{kind:'template_intent', intent, templateIds}` | `{kind:'sales_action',
  accion, templateIds}` | `{kind:'kb_topic', topic, confidence, texto}` | `{kind:'handoff',
  reason}` | `{kind:'silence'}`.
- `crmActions[]`: `{tool, args, result:'success'|'failed'|'cas_reject', code?, origen:
  'determinista'|'rag'|'timer', stageAtTime?}` — **diseñado para recibir el sub-loop
  orquestador del standalone #2** (no solo el camino determinista de hoy).
- `modeTransition`, `messagesSent`.

## Fuera de scope (deferido)

- **3 capas de seguridad CRM** (grounding / tool guards / observabilidad) → standalone #2
  (consolidación CRM al sub-loop). Este ledger solo debe **NO cerrar esa puerta**: la
  forma de `crmActions` ya anticipa el orquestador grounded.
- **Mover `createOrder` / CRM al sub-loop** → standalone #2. El ledger se construye contra
  el CRM determinista ACTUAL y registra `crmActions` sin importar quién las dispare.
- **Turno híbrido template+RAG** → standalone #3 (B). El ledger es su prerequisito.
- **Cambiar decisiones deterministas** → este standalone NO altera qué sales-action /
  template se elige. Solo el registro de efectos. Las dims nuevas se leen en turnos
  FUTUROS (deserialize al inicio), nunca intra-turno.

## Regla 6 / docs

- v4 DORMANT (0 workspaces). Cambios tocan solo archivos somnio-v4-specific →
  cero impacto en v3/godentist/recompra/pw-confirmation. Gate verificable en research.
- Actualizar `src/lib/agents/somnio-v4/ARCHITECTURE.md` (Regla 4) — incluir el ledger
  y corregir la descripción desactualizada de `crm_mutation` (hoy lo pinta vivo).
