# Standalone: somnio-v4-consolidation — Context

**Gathered:** 2026-06-10
**Status:** Ready for research/planning
**Modo de captura:** Usuario delegó las 4 áreas grises a criterio de Claude (Fable 5) con contexto completo de la sesión de auditoría 2026-06-10. Decisiones lockeadas abajo; condición de revisita anotada donde aplica.

<domain>
## Phase Boundary

Consolidación interna del agente `somnio-sales-v4`: (1) eliminar código muerto y desconexiones verificadas (M-1..M-8 de la auditoría), (2) unificar la orquestación del turno prod↔sandbox en un core compartido con adapters, (3) sincronizar la documentación con la realidad del código.

**Invariante absoluto:** los 9 mecanismos (lock+fencing, Path A/B, 8 checkpoints, comprehension, state machine+tracks, sub-loop RAG 3-calls, crm-gate, turn ledger, no-repetición) quedan funcionando IDÉNTICO. Esto es reorganización de complejidad, no cambio de comportamiento.

**Fuera de scope:** calibración ICLR del threshold (post-flip), migración a frameworks externos (descartada con evidencia — ver RESTRUCTURE-RESEARCH), cambios de comportamiento del agente, tocar v3/godentist/recompra/pw (Regla 6), borrado del runner v3 (S-7, cosecha futura).

</domain>

<decisions>
## Implementation Decisions

### Alcance y timing

- **D-01: Scope = Wave 1 + Wave 2.** Wave 1 = limpieza de código muerto + docs (M-1..M-8). Wave 2 = core de turno unificado prod↔sandbox (S-5), que INCLUYE la factorización del boilerplate de checkpoints (helper + tabla declarativa de colocaciones) porque hacerla después duplicaría trabajo. El split de `V4AgentOutput` contract/debug y la superficie de escalación única (W3) quedan DIFERIDOS.
- **D-02: Timing = ANTES del flip productivo del RAG (Plan 08 de somnio-v4-rag-generative).** Racional: v4 DORMANT = riesgo cero en prod durante el refactor, y los smokes obligatorios del flip se corren UNA sola vez sobre el código ya consolidado. **Condición de revisita:** si el usuario necesita flipear urgente por negocio, se invierte el orden y la consolidación pasa a post-flip (en ese caso Wave 2 requiere validación más estricta por estar v4 vivo).

### Diseño del core unificado (Wave 2)

- **D-03: Ubicación `src/lib/agents/somnio-v4/core/`** (junto al agente, NO en `engine/`). El mecanismo es específico de v4 hoy; si otro agente lo adopta en el futuro, se promueve a shared en su propio standalone. Archivos sugeridos: `turn-orchestrator.ts` (restart loop + Path A/B), `restart-context.ts` (struct de acumuladores: effectiveMessage, totalTokens, carryState, accumulatedSentContents), `drain.ts` (`drainPendingAndCombine()` — consolida los 5 drain-sites), `checkpoint-gate.ts` (helper + tabla de colocaciones). Nombres finales a discreción del planner.
- **D-04: Dirección de absorción: el core se EXTRAE del runner de producción** (`v4-production-runner.ts` es la fuente de verdad — es el lado más completo: CKPT-6a pending-templates cross-turn, crash-recovery `_v3:pendingUserMessage`, no-repetición). `engine-v4.ts` se REESCRIBE para consumir el core. El runner queda como wrapper delgado: threading de lock fields desde EngineInput + adapters de producción.
- **D-05: Interfaz de adapters mínima y agnóstica.** El core NO importa nada de WhatsApp ni de NDJSON. Adapters: envío (con hook per-unidad para CKPT-7.N), persistencia de estado/sesión, emisión debug/stream, timing. Producción inyecta V4MessagingAdapter+SessionManager+Supabase; sandbox inyecta onMessage NDJSON+memoria+simulateProdTimingMs.
- **D-06: Checkpoints — factorizar boilerplate, NO mover colocaciones.** Los 8 CKPT mantienen exactamente su posición y semántica actual. Lo que cambia: el patrón repetido de ~25 líneas (skip-gate por lock fields + lostLock throw + interrupted return con discriminator) se extrae a un helper único; las colocaciones del core (CKPT-0/6a/6b) se expresan como tabla declarativa. CKPT-1/2 (agente) y CKPT-3/4/5 (sub-loop) se quedan donde están, usando el helper.
- **D-07: INTERRUPTION-PARITY.md se reduce y re-titula.** Deja de ser contrato de paridad de mecanismo (el mecanismo pasa a ser código único) y documenta SOLO las diferencias legítimas de adapters (envío real vs stream, DB vs memoria, timing real vs simulado, CKPT-6a que el sandbox no necesita).

### Política de re-validación

- **D-08: Baseline lock ANTES de tocar nada** (patrón Wave 0): correr suite completa v4 + Smoke A + Smoke B y guardar resultados en `BASELINE.md` del standalone. Todo gate posterior compara contra ese baseline.
- **D-09: Gate por commit:** typecheck + suite v4 completa (~209 tests) verde. Los tests NO se modifican en sus asserts de comportamiento — solo se permiten cambios de imports/setup/mocks por la reorganización de archivos. Un assert que necesite cambiar = señal de regresión, parar y evaluar.
- **D-10: Gate de fin de wave (W1 y W2):** re-correr Smoke A (17 casos) y Smoke B (10, con sus SKIP documentados). Criterio de equivalencia: mismos PASS/FAIL que el baseline 2026-06-05 (Smoke A 15/17, Smoke B 1/3 + 7 SKIP), mismos templates deterministas emitidos, mismos outcomes del sub-loop (generated/no_match/handoff) y mismas decisiones de gates. NO se exige byte-equality del texto generativo (LLM no determinista por diseño).
- **D-11: Gate Regla 6:** los grep-gates del CLAUDE.md + los 3 tests dedicados de no-regresión v3 siguen verdes; el diff fuera de `somnio-v4/`, `engine/v4-production-runner.ts`, `engine-adapters/production/v4-messaging-adapter.ts`, `interruption-system-v2/` y docs debe ser CERO.

### Código muerto y desconexiones (Wave 1)

- **D-12 (M-1):** Borrar el plumbing `isCrmMutation`/`casReject`: params siempre-false en `slots.ts:118/152` + `somnio-v4-agent.ts:414-415`, ramas inalcanzables en `escalation.ts:54-56`, y reducir el union `V4AgentOutput.subLoopReason` (:1224) a los valores que el path del agente puede producir. **OJO:** el `SubLoopReason` del sub-loop (`output-schema.ts`) NO se toca — `crm_mutation`/`cas_reject` siguen vivos allí porque el crm-gate los usa vía `runCrmSubLoop`.
- **D-13 (M-2):** Borrar `shouldCreateOrder` (y `orderData` si existe) de `V4AgentOutput` + sus ~10 asignaciones. Nadie lo consume desde el big-bang D-06 del crm-subloop (verificado: 1 hit en runner y es comentario).
- **D-14 (M-3):** Borrar el branch fallback del runner (`:949-961`, envío de `output.messages` sin templates — el adapter lo dropea y desde el pseudo-template `rag:*` ningún caso llega ahí). Reemplazar por un warning a observability si `output.messages.length > 0 && !output.templates` — nunca debería ocurrir; si ocurre queremos verlo, no un envío silenciosamente fallido. Esto mata también el bug G-3 (log que registra texto no enviado).
- **D-15 (M-4, condicional):** Campo `confidence` 0-100 legacy de comprehension: QUITAR del schema y de `intentInfo` SI el grep de consumidores muestra ≤2 usos fuera del agente (mapear a `intent_confidence*100` donde haga falta). Si hay más consumidores (dashboards/queries de observability), degradar a deprecación con comentario y diferir el borrado. El executor resuelve con el grep.
- **D-16 (M-5):** Labels de observabilidad sin NINGÚN emisor en código (`follower_woke`, `lock_force_acquired_after_ttl_expiry`, y `heartbeat_renewed` si el grep confirma que no tiene emisor condicional): borrar del union `LockEventLabel` y de los gates de validación del CLAUDE.md (actualizar el conteo de 14). El union tipado debe reflejar la realidad; re-agregarlos en el futuro es barato.
- **D-17 (M-6 + M-7):** Rename `runLegacySubLoop` → `runCrmMutationSubLoop` (está VIVO — es el motor del crm-gate; "legacy" invita a borrarlo por error). Sincronizar docs: `ARCHITECTURE.md` (quitar `invocations.ts` que ya no existe, cerrar G-1/G-2/G-3, actualizar tabla de archivos y pipeline §2.0 al flujo real post-híbrido con slot resolver y crm-gate), `INTERRUPTION-PARITY.md §6` (caveat RAG-send obsoleto), y la corrección en `AUDIT-2026-06-10.md`.
- **D-18 (M-8):** CONSERVAR el crash-recovery `_v3:pendingUserMessage` del runner (es funcional — edge de interrupt con pending vacío y 0 sends). Añadir comentario: por qué existe, y que es borrable cuando v3 muera (D-38).

### Claude's Discretion

- Nombres finales de archivos/funciones del core (D-03 da sugerencias, no mandatos).
- Orden interno de tareas dentro de cada wave y división en planes.
- Cómo estructurar los tests del core unificado (mover los de engine-v4-lock/restart-loop vs duplicar temporalmente durante la transición).
- Detalle del warning de D-14 (label del evento, payload).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auditoría y diseño (esta sesión — la base de todo el standalone)
- `.planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md` — inventario completo, los 9 mecanismos, deuda M/S, plan S-1..S-7
- `.planning/standalone/somnio-v4-audit/RESTRUCTURE-RESEARCH-2026-06-10.md` — modelo funcional "como un todo" + investigación verificada (por qué NO frameworks; Arquetipo A)

### Contratos vigentes del sistema
- `src/lib/agents/somnio-v4/ARCHITECTURE.md` — doc principal (OJO: desactualizado en §4.2 G-1, invocations.ts, modelos — este standalone lo corrige)
- `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` — contrato de paridad vigente HASTA Wave 2 (luego se reduce per D-07)
- `CLAUDE.md` §"Module Scope: interruption-system-v2" — scope y gates verificables del módulo de lock (los grep-gates de validación deben seguir pasando; actualizar el conteo de labels si D-16 los reduce)
- `.claude/rules/agent-scope.md` — scopes de agentes

### Código fuente de verdad (Wave 2 extrae de aquí)
- `src/lib/agents/engine/v4-production-runner.ts` — runner prod (1.295 líneas; fuente del core per D-04)
- `src/lib/agents/somnio-v4/engine-v4.ts` — engine sandbox (768 líneas; se reescribe para consumir el core)
- `src/lib/agents/somnio-v4/somnio-v4-agent.ts` — orquestador del turno (NO se toca su lógica; solo M-1/M-2/M-13 y el helper de checkpoints)
- `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts` + `messaging.ts` — adapters de envío
- `src/lib/agents/interruption-system-v2/` — módulo de lock (INTACTO salvo D-16 labels)

### Baselines de validación
- `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md` — baseline Smoke A (15/17, 2026-06-05)
- `.planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md` — baseline Smoke B (1/3 + 7 SKIP, 2026-06-05)
- `.planning/standalone/somnio-v4-rag-generative/STATUS.md` — estado del flip Plan 08 (este standalone va ANTES per D-02)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `interruption-system-v2/` (950 líneas, 48 tests) — módulo limpio y agnóstico; el core nuevo lo consume tal cual.
- Suites de tests existentes: `engine-v4-lock.test.ts` (798 líneas, paridad Path A/B), `restart-loop.test.ts` (718), `v4-production-runner-restart/pathb.test.ts` — se convierten en los tests del core único.
- Patrón Wave 0 baseline-lock (usado en agent-godentist-fb-ig) — aplicar en D-08.

### Established Patterns
- Cancelación cooperativa por valores (`errorMessage: 'interrupted_at_ckpt_*'` burbujeando por returns) — el core la preserva tal cual.
- Envío post-return (el agente nunca envía) — invariante que hace seguro el Path A.
- `commitTurn` como único punto de fusión estado+ledger — no se toca.
- Pseudo-templates `rag:*` por el path de templates (R4-B passthrough + T-7 exclusión del registry) — no se toca.

### Integration Points
- `webhook-processor.ts:847-931` (branch v4) — sigue instanciando el runner; el cambio es interno al runner.
- `app/api/sandbox/process/route.ts` — sigue instanciando SomnioV4Engine; el cambio es interno al engine.
- Tests de Regla 6 (3 dedicados de no-regresión v3) — gate D-11.

</code_context>

<specifics>
## Specific Ideas

- La motivación del usuario para Wave 2 (verbatim de la conversación): que la suposición "si se le hace un cambio en sandbox, en producción se refleje" sea cierta por construcción para el 100% del sistema, no solo para la lógica del agente. El sandbox debe ser "producción con adapters falsos", no "una simulación que hay que mantener sincronizada a mano".
- El bug del 2026-05-28 (dropOwnEntry/carryState arreglado dos veces) es el caso de prueba mental: tras Wave 2, ese tipo de fix debe tocarse en UN solo lugar.

</specifics>

<deferred>
## Deferred Ideas

- **Calibración del threshold de confianza (ICLR 2025 "Trust or Escalate")** — reemplazar el 0.70 hardcoded por threshold calibrado con dataset de etiquetas propio. Standalone post-flip, con datos reales de prod. Ref: RESTRUCTURE-RESEARCH §2.4.
- **Split `V4AgentOutput` contract/debug** — separar campos load-bearing de los ~6 informativos. W3 diferido (toca los ~10 returns del agente; no es necesario para consistencia).
- **Superficie de escalación única al sub-loop** — unificar las dos puertas (slot resolver + crm-gate) que threadean lock fields por separado. W3 diferido.
- **Borrado del runner v3 + Phase 31 polling (S-7)** — cuando v3 muera. Cosecha grande (~1.300 líneas) pero hoy v3 atiende prod.
- **Seed WDK**: re-evaluar mover el runner-loop a Vercel Workflows cuando vercel/workflow#301 (per-key concurrency) shippee.
- **Promover el core a shared** para otros agentes (godentist, recompra) — standalone por agente, patrón crm-mutation-tools.

</deferred>

---

*Standalone: somnio-v4-consolidation*
*Context gathered: 2026-06-10*
