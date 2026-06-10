# REESTRUCTURACIÓN DEL V4 — MODELO FUNCIONAL + INVESTIGACIÓN TECNOLÓGICA VERIFICADA

**Fecha:** 2026-06-10
**Complementa:** `AUDIT-2026-06-10.md` (inventario y deuda).
**Método:** lectura de primera mano del código (ARCHITECTURE.md + somnio-v4-agent.ts + runner + adapter) + deep-research online con verificación adversarial (24 fuentes, 22 claims confirmados 3-0, 3 refutados 0-3).

---

## PARTE 1 — EL SISTEMA "COMO UN TODO" (modelo funcional)

Antes de evaluar tecnologías hay que nombrar qué ES el v4 conceptualmente. No es "una state machine + subloops + Redis": es **cuatro ideas arquitectónicas componiéndose**, y cada mecanismo custom es la implementación de una de ellas.

### 1.1 Idea 1 — Actor serializado por conversación (el lock ES el mailbox)

Cada conversación se comporta como un **actor con mailbox**: exactamente un procesador a la vez (lock SET NX = exclusividad del actor), los mensajes que llegan mientras procesa van al mailbox (pending list Redis), y una señal (`interrupt` key) avisa que el mailbox no está vacío. No hay debounce por timer: **la duración natural del turno es la ventana de agrupación**. Esto es lo que la industria resuelve con "buffer window de 10s" (patrón n8n/AWS verificado) — el v4 lo resuelve sin latencia artificial.

### 1.2 Idea 2 — Pipeline lineal con salidas tipadas y cancelación cooperativa

El turno es una **tubería de etapas con contratos de salida explícitos** (verificado en `somnio-v4-agent.ts`):

```
deserialize → [VISION branch dedicado]
            → comprehend (Gemini)        ── CKPT-1
            → mergeAnalysis + gates + threshold
            → computeSlots (plan híbrido por intent: covered|low)
            → guards R0/R1 (escape → R1 handoff)
                                          ── CKPT-2
            → resolveSalesTrack (QUÉ hacer — state machine 6 estados + timers)
            → runCrmGate (ADITIVO: grounding lazy + hint + sub-loop CRM + crmActions ground-truth)
            → resolveResponseTrack (QUÉ decir — templates CORE/COMPLEMENTARIA, gated por coverage)
            → registrar acción + templatesMostrados
            → SLOT RESOLVER (al FINAL): inyecta RAG para slots low
                 runSubLoop 3-calls       ── CKPT-3/4/5 internos
                 generated → pseudo-template `rag:<topic>` (viaja por el path de templates)
                 no_match  → partial handoff (el slot resuelto SÍ se envía — R1-A)
                 interrupt → discriminator `interrupted_at_ckpt_*` (corta el turno limpio)
            → combinar [RAG?, templates...] en orden de intent (D-11)
            → salida tipada: R1 guard-handoff | R2 silence | R3 happy | R7-R9 interrupt/error | R10 timer
            → commitTurn (ÚNICO punto de fusión estado + ledger)
```

Tres propiedades hacen este pipeline especial:
- **Cancelación cooperativa por valores, no excepciones**: un interrupt no lanza — retorna un output con `errorMessage: 'interrupted_at_ckpt_*'` que burbujea por los returns normales. Esto es lo que permite descartar o conservar estado de forma explícita y testeable.
- **El agente nunca envía** — el envío es post-return en el runner. Por eso un interrupt antes del send descarta TODO sin efectos secundarios (Path A es seguro por construcción).
- **Toda salida comprometida pasa por `commitTurn`** (7 commit-paths, 3 passthrough) — el ledger nunca queda inconsistente.

### 1.3 Idea 3 — Loop reanudable alrededor del pipeline (el runner es un motor de durabilidad casero)

El runner (`v4-production-runner.ts`) es un **motor de ejecución durable en miniatura**: `while(shouldRestart)` con lease renovable (heartbeat), fencing token contra zombies, y dos semánticas de reanudación:
- **Path A** (nada enviado): rollback total + merge del mailbox + re-run = "rollback & combine".
- **Path B** (envío parcial): conservar lo enviado + `carryState` + procesar solo lo nuevo = "interrupt & resume con estado acarreado".

Esto es EXACTAMENTE lo que los durable execution engines (Temporal/Restate/WDK) hacen genéricamente — con la diferencia crítica de que ninguno (verificado) ofrece el **merge de mensajes pendientes** (ver Parte 2).

### 1.4 Idea 4 — LLM bajo tutela determinista (gates por todas partes)

Ningún LLM tiene el control del flujo. El flujo es determinista y los LLM son **funciones tipadas llamadas en puntos fijos**, cada una con su gate de salida:
- Comprehension → schema Zod + parser resiliente (intent fuera de enum → sumidero `otro`).
- Sub-loop RAG → threshold 0.70 + binary backstop M3 + compliance call (polarity-aware) + invariantes post-hoc del schema.
- CRM → gate determinista de entrada + whitelist de stages + CAS sin retry + idempotencia 4 capas + ground-truth desde toolResults (jamás auto-reporte).
- Respuesta → no-repetición + composeBlock máx 3 + `rag:*` passthrough.

**Esta inversión de control (workflow que invoca LLMs, no agente autónomo) es la decisión arquitectónica más valiosa del v4** y es lo primero que se perdería en una migración ingenua a un framework de agentes.

### 1.5 Corrección importante a la auditoría previa

El gap G-1 ("texto RAG no se envía en producción", ARCHITECTURE.md §4.2 del 2026-05-28) **está CERRADO**: el slot resolver envuelve el texto generado como pseudo-template `rag:<sourceTopic>` con priority CORE (`somnio-v4-agent.ts:743`) y viaja por el path de templates — gana CKPT-7.N, no-repetición passthrough (runner :796-799) y exclusión del registry (:838-842). El branch fallback `output.messages` del runner (:949-961) quedó **efectivamente muerto** (el adapter dropea sin templates, `messaging.ts:170-172`) y es candidato a borrarse. ARCHITECTURE.md §4.2/§12 G-1..G-3 e INTERRUPTION-PARITY.md §6 necesitan actualización.

---

## PARTE 2 — INVESTIGACIÓN ONLINE VERIFICADA (22 claims confirmados)

### 2.1 Conclusión central

**Ninguna tecnología 2025-2026 absorbe los 9 mecanismos.** Los dos mecanismos más distintivos — el mutex por conversación y sobre todo el "merge-and-rerun" de Path A — **NO tienen equivalente off-the-shelf en Vercel serverless** (confirmado 3-0 contra docs primarias de LangChain, Vercel, Inngest).

### 2.2 El problema tiene nombre en la industria: "double texting"

LangChain acuñó el término y define **4 estrategias**: `reject`, `enqueue` (default), `interrupt`, `rollback` ([docs](https://docs.langchain.com/langgraph-platform/double-texting), confirmado 3-0 ×4):
- `interrupt` ≈ nuestro **Path B** (preserva progreso, inserta input nuevo, continúa) — pero con matiz mecánico: LangGraph continúa HACIA ADELANTE desde el checkpoint; Path B RE-CORRE el turno con carryState. Resultado convergente, mecanismo distinto.
- `rollback` ≈ nuestro **Path A** parcial — pero **descarta** el input original en vez de **combinarlo**. El merge-and-rerun de Path A no existe en ninguna de las 4 estrategias (verificado contra el enum `MultitaskStrategy` del SDK).
- **Lock-in crítico**: double-texting es exclusivo del LangSmith Deployment **pago** — "not available in the LangGraph open source framework" (verbatim, 3-0). El standalone server requiere licencia comercial Y sus docs prohíben serverless ("Do not run standalone servers in serverless environments").

**Implicación**: nuestro Path A/B es genuinamente más avanzado que el estado del arte comercial para este problema. Vocabulario útil: podemos describir Path A como *"rollback-and-combine"* y Path B como *"interrupt-with-carried-state"* en docs.

### 2.3 Veredictos por candidato

| Candidato | Reemplazaría | Veredicto verificado |
|---|---|---|
| **Vercel Workflows / WDK** (GA ~abr 2026, first-party) | El runner-loop casero (mecanismos 1-parcial y restart) | El MÁS prometedor: replay-safe, hooks para eventos externos, persistencia gestionada, sobrevive deploys (run-pinning al deploy de origen). **PERO**: sin concurrencia per-key/singleton (feature request abierto [vercel/workflow#301](https://github.com/vercel/workflow/discussions/301)) y sin message-combining → el mutex Redis y el combiner seguirían siendo custom. Sin datos de latencia per-step para turnos de 2-8s. |
| **Inngest** (ya en stack) | Mutex (mecanismo 1) | **REFUTADO 0-3**: keyed concurrency `limit:1` NO equivale al mutex. Su cola es FIFO estricta — un follower ESPERA detrás del holder, jamás lo interrumpe. Su debounce REEMPLAZA el evento viejo por el nuevo (no combina). Escepticismo permanente ante cualquier propuesta de "reemplazar el lock con Inngest concurrency". |
| **LangGraph OSS `interrupt()`** | Checkpoints (mecanismo 2 parcial) | 3 costos verificados (3-0 ×3): (1) obliga a adoptar su checkpointer + thread IDs; (2) al reanudar **re-ejecuta el nodo ENTERO desde el inicio** — granularidad más gruesa que nuestro control explícito Path A/B; (3) la idempotencia queda en código del usuario ("side effects before interrupt() must be idempotent") → nuestras 4 capas de idempotencia sobreviven a cualquier adopción. API históricamente inestable (renames sin migración). |
| **Restate** | Runner-loop | ~3-10ms/step (benchmark del vendor, hardware co-locado) — irrelevante vs turno 2-8s, PERO desde Vercel el RTT de red por step dominaría, y es un servicio externo más (lock-in operacional). |
| **NeMo Guardrails** (v0.22.0, may 2026) | Compliance call (mecanismo 5 parcial) | Cubre conceptualmente los 5 tipos de rails (input/dialog/retrieval/execution/output) pero es **Python-only** — en stack TypeScript/Vercel requiere sidecar HTTP o Docker. Costo arquitectónico alto vs nuestra 3ª llamada Gemini. No cubre idempotencia/CAS/ground-truth. |
| **Temporal, Cloudflare DO, Step Functions, XState v5, Mastra, Pydantic AI, CrewAI, Guardrails AI** | — | **Sin evidencia adjudicada** (no sobrevivieron claims). Ausencia de evidencia ≠ inviabilidad: Cloudflare Durable Objects (actor single-threaded por conversación) es conceptualmente el match más cercano a mecanismos 1+2, pero implicaría sacar el runtime del agente de Vercel (cross-cloud). XState quedó sin evaluar — para una máquina de 6 estados ya estable, el valor marginal es dudoso. |

### 2.4 Dos upgrades puntuales con evidencia fuerte

1. **Calibración del threshold 0.70** — ICLR 2025 Oral *"Trust or Escalate"* (UW/AI2, confirmado 3-0 contra el PDF): la confianza auto-reportada verbalizada es **consistentemente sobre-confiada** incluso en los mejores modelos; el paper da un método (fixed sequence testing sobre ~400-500 ejemplos calibrados con etiquetas humanas) que selecciona el threshold con garantía demostrable `P(acuerdo con humano | el modelo responde) ≥ 1-α`. Aplicable a nuestro gate de handoff **sin cambiar arquitectura** — solo requiere recolectar etiquetas de acuerdo en dominio WhatsApp (los smokes A/B ya son el embrión de ese dataset). Caveat: el paper evalúa juicio de preferencias par-a-par; nuestro caso es auto-evaluación — requiere adaptación.
2. **Anthropic "Building Effective Agents"** (confirmado 3-0 ×3, guidance vigente post-actualización 2025): "the most successful implementations weren't using complex frameworks... simple, composable patterns"; los frameworks "obscure the underlying prompts and responses, making them harder to debug". Respaldo directo del enfoque actual. (Nota de honestidad: la inferencia fuerte "frameworks pierden determinismo per se" fue REFUTADA 0-3 — no apoyarse en ella.)

### 2.5 Lo que NADIE cubre

- **Mecanismo 9 (paridad sandbox↔prod)**: cero evidencia de ningún candidato — todos reproducirían el problema de código duplicado o lo dejan sin resolver. La solución es interna (core compartido, S-5 de la auditoría).
- **Mecanismo 6 (idempotencia + CAS + ground-truth CRM)**: sobrevive a CUALQUIER adopción de framework (verificado para LangGraph; estructural para los demás).
- **Mecanismo 7 (turn ledger)**: el equivalente más cercano es memoria gestionada tipo Bedrock AgentCore (two-tier), pero es AWS-locked y menos preciso que nuestro ledger discriminado.

---

## PARTE 3 — ARQUETIPOS DE REESTRUCTURACIÓN

### Arquetipo A — "Consolidación interna + upgrades puntuales" ⭐ RECOMENDADO

**Tesis**: la investigación demuestra que el core custom (lock + Path A/B) NO es una rueda reinventada — está **adelante** del estado del arte comercial para este problema en este stack. La reestructuración de mayor ROI es interna:

1. **Core de turno único prod↔sandbox** (S-5 de la auditoría): extraer el restart-loop + drains + checkpoint placement a un orquestador compartido con adapters (WhatsApp+DB vs NDJSON+memoria). Elimina ~1.500-2.000 líneas, mata la clase de bug de paridad (2026-05-28), y resuelve el mecanismo 9 que ningún vendor cubre.
2. **Checkpoint placement declarativo**: hoy los 8 CKPTs son llamadas inline copy-paste; convertirlos en una tabla `etapa → ckptId` que el orquestador aplica entre etapas del pipeline. El pipeline queda como lista de stages — la forma que LangGraph "vendería" pero sin el framework.
3. **Quick wins S-1..S-4** + borrar el branch fallback muerto del runner (:949-961) + actualizar ARCHITECTURE.md/PARITY.md (G-1 cerrado).
4. **Upgrade de calibración** (ICLR 2025): convertir el 0.70 hardcoded en threshold calibrado con dataset de etiquetas propio. Bajo esfuerzo incremental — los smokes ya generan los casos.
5. **Vocabulario**: documentar Path A/B con los términos de la industria (double-texting: rollback-and-combine / interrupt-with-carried-state) para onboarding.

**Riesgo**: bajo-medio. Re-correr Smoke A/B tras el refactor del core. Cero dependencias nuevas, cero lock-in.
**Resultado**: ~15-17k líneas, 9 mecanismos intactos, paridad estructural, threshold con garantía estadística.

### Arquetipo B — "WDK durable core" (cuando madure)

Migrar el runner-loop a Vercel Workflows: pasos `use step` para comprehension/sub-loop/CRM/send, hooks para señales de followers, persistencia gestionada en vez de carryState manual. **Bloqueadores actuales verificados**: (a) sin per-key concurrency (#301 abierto) → el mutex Redis se queda igual; (b) sin merge de mensajes → el combiner se queda igual; (c) latencia per-step en turnos 2-8s sin datos. **Decisión**: NO migrar hoy; dejar un trigger plantado — *"cuando vercel/workflow#301 shippee per-key/singleton concurrency, re-evaluar mover el runner-loop a WDK"*. En ese mundo, WDK absorbería heartbeat+TTL+cron sweep+replay y quedaría custom solo el combiner Path A/B (que es pequeño).

### Arquetipo C — "LangGraph Platform" — DESCARTADO con evidencia

Única opción con equivalente NOMBRADO del mecanismo 2, pero: no expresa Path A (merge), obliga node-granularity restarts, retiene toda la carga de idempotencia, **exige salir de Vercel serverless** para el runtime del agente, y es plataforma licenciada. Máximo riesgo de migración para un sistema que funciona. Los 3 costos están confirmados contra docs primarias — no es prejuicio anti-framework.

---

## PARTE 4 — PREGUNTAS ABIERTAS (de la verificación adversarial)

1. ¿Cloudflare Durable Objects (actor por conversación) podría hostear SOLO el coordinador (lock+mailbox) mientras el resto queda en Vercel? ¿A qué costo de RTT cross-cloud? (Sin evidencia adjudicada — spike de 1 día si algún día interesa.)
2. ¿Cuál es la latencia/costo real per-step de Vercel Workflows en un turno de 8+ steps? (Vendor no publica; medible con un spike.)
3. ¿Por qué exactamente se refutó "Inngest keyed concurrency = mutex"? Los verificadores no expusieron el modo de fallo preciso (¿at-least-once steps? ¿sin fencing? ¿TTL en crash?) — la inferencia es nuestra. No cambia el veredicto.

---

## PARTE 5 — RECOMENDACIÓN FINAL

**Arquetipo A.** El v4 ya implementa, a mano y con tests, lo que ningún framework 2026 ofrece completo en este stack. La complejidad del sistema NO es accidental en su mayoría — es la complejidad esencial de "actor serializado + pipeline cancelable + LLM bajo tutela" — pero SÍ está mal distribuida (duplicación prod/sandbox, drains copy-paste, dead code). La reestructuración correcta reorganiza esa complejidad sin cambiar los mecanismos:

| Paso | Qué | Cuándo |
|---|---|---|
| 1 | Quick wins S-1..S-4 + borrar fallback muerto + actualizar docs (G-1) | Standalone corto, antes o después del flip |
| 2 | Core compartido + checkpoints declarativos (S-5) | Standalone `somnio-v4-consolidation`, idealmente pre-flip (DORMANT = riesgo cero) |
| 3 | Threshold calibrado (ICLR 2025) con dataset de smokes | Post-flip, con datos reales de prod |
| 4 | Re-evaluar WDK cuando shippee per-key concurrency (#301) | Seed plantado, sin fecha |

Proceso: `/gsd:discuss-phase somnio-v4-consolidation` para lockear el scope.
