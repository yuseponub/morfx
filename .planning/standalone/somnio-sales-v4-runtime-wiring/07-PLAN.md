---
plan: 07
phase: somnio-sales-v4-runtime-wiring
wave: 5
depends_on: [03, 06]
files_modified:
  - .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md
addresses_decisions: [D-23, D-24]
addresses_research_pitfalls: [H-1]
autonomous: false
estimated_tasks: 3
must_haves:
  truths:
    - "Smoke Wave A se ejecuta en /sandbox con agentId='somnio-sales-v4' (rama Plan 03)"
    - "Los 5 mensajes de overconfidence (RESEARCH §MessageAnalysisSchema) se ejecutan y producen confidence values dentro del rango esperado"
    - "Sub-loop dispara al menos 1 vez con reason='low_confidence' o 'razonamiento_libre' (mensaje 2 'qué tan adictivo es vs zolpidem?' es trigger garantizado por D-12 / RESEARCH 5/5 calibration)"
    - "Sub-loop completa con outcome válido (template/canonical/no_match) — el shape flat post-Plan 02 es aceptado por GPT-4o mini"
    - "validateLoopOutcomeInvariants pasa para el outcome (no se observan eventos pipeline_decision:subloop_invariant_violation en observability)"
    - "KB retrieval real funciona (workspace Somnio prod) — al menos 1 hit en kb_search durante razonamiento_libre o canonical outcome (D-22)"
    - "Observability events recordados con agent='somnio-sales-v4': comprehension_completed, subloop_*, pipeline_decision (D-24)"
    - "Smoke pasa o falla — gate humano final 'smoke A pass' o 'smoke A fail con rollback'"
    - "Cero edits a código productivo — Plan 07 es ejecución y observación pura"
  artifacts:
    - path: ".planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md"
      provides: "Reporte completo del smoke A — 5 mensajes + sub-loop + outcomes + observability"
      contains: "Smoke Wave A — Sandbox"
  key_links:
    - from: "POST /api/sandbox/process body { agentId: 'somnio-sales-v4', message: 'qué tan adictivo es vs zolpidem?' }"
      to: "SomnioV4Engine → comprehension Gemini → low_confidence trigger → sub-loop GPT-4o mini → kb_search Supabase prod"
      via: "rama branch v4 sandbox + stack mixto + KB real"
      pattern: "agent_observability_events.agent_id = 'somnio-sales-v4'"
---

<objective>
Wave 5 — Smoke Wave A: ejecutar v4 end-to-end en sandbox con stack mixto + schema flat + KB real. **Es la primera vez que el sub-loop ejerce contra una API real (RESEARCH H-1).**

**Por qué esto va antes del flip prod (Plan 08):**
- H-1 estableció que el sub-loop NUNCA corrió contra ninguna API estructurada. Plan 02 re-shapeó el schema, pero la única forma de saber si funciona end-to-end es ejecutarlo. Sandbox es el ambiente seguro para esa primera prueba.
- D-23 lockea: "Smoke = sandbox primero + PROD CON TRÁFICO REAL". Sandbox primero = riesgo cero. Si Smoke A falla, NO se hace flip.

**Casos a ejecutar (corpus mínimo del RESEARCH §MessageAnalysisSchema 5/5 + 1 razonamiento_libre + 1 KB-driven canonical):**

1. **"hola"** — esperado intent=saludo, confidence ≥0.85, sales-track responde con template (sin sub-loop)
2. **"qué tan adictivo es vs zolpidem?"** — esperado confidence ≤0.50 → sub-loop trigger reason='low_confidence' → outcome canonical (KB hit dependencia/contraindicaciones) o no_match
3. **"funciona si tengo apnea?"** — esperado confidence ≤0.50 → sub-loop trigger → outcome canonical (KB hit contraindicaciones)
4. **"lo quiero comprar"** — esperado intent=quiero_comprar, confidence ≥0.85, sales-track responde (sin sub-loop) — eventually crea pedido si state machine lo permite
5. **"ok"** — esperado confidence ≤0.70 (ambiguous), sales-track responde sin sub-loop (RESEARCH expected: 0.55, threshold default 0.70 — borderline; verificar comportamiento real)
6. **"cual es el sentido de la vida?"** — esperado intent=otro o low_confidence, sub-loop trigger reason='razonamiento_libre' → outcome no_match con responseTemplate=handoff_humano
7. **"mi pedido ya llegó?"** (status check fuera de scope sales) — esperado low_confidence o intent=otro → sub-loop razonamiento_libre o crm_mutation → outcome (depende de KB content)

**Esto es ejecución manual + observación + reporte. Cero código nuevo.**

D-24: smoke verifica que `pipeline_decision:subloop_*` events aparecen en `agent_observability_events` con `agent_id='somnio-sales-v4'`.

**Tareas:**

1. Ejecutor arranca el dev server (puerto 3020 según CLAUDE.md), navega a `/sandbox`, selecciona dropdown agent='somnio-sales-v4', ejecuta los 7 mensajes en orden.
2. Para cada mensaje, captura:
   - Comprehension intent + confidence value
   - Si dispara sub-loop: reason + outcome status + sourceTopic (si canonical) + reason del LoopOutcome
   - Templates enviados al cliente (verbatim)
   - Errores en consola Next.js (server-side)
3. Después de los 7 mensajes, query observability:
   ```sql
   SELECT event_type, decision_type, agent_id, COUNT(*)
   FROM agent_observability_events
   WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'  -- Somnio
     AND agent_id = 'somnio-sales-v4'
     AND created_at > NOW() - INTERVAL '15 minutes'
   GROUP BY event_type, decision_type, agent_id
   ORDER BY COUNT(*) DESC;
   ```
   Verifica:
   - `comprehension_completed` events (uno por turn)
   - `subloop_low_confidence_invoked` o `subloop_completed` events (al menos 1 por D-12 / mensaje 2)
   - `subloop_invariant_violation` events DEBEN ser 0 (si hay → schema flat tiene un bug — escalate)
   - Cero `error` o `unhandled_exception` events (si hay → bug)
4. Cost query:
   ```sql
   SELECT agent_id, model, COUNT(*) as calls, SUM(cost_usd) as total_cost
   FROM agent_observability_ai_calls
   WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
     AND agent_id = 'somnio-sales-v4'
     AND created_at > NOW() - INTERVAL '15 minutes'
   GROUP BY agent_id, model
   ORDER BY total_cost DESC;
   ```
   Verifica:
   - Solo modelos `gemini-2.5-flash-lite` y `gpt-4o-mini` aparecen (NO claude-haiku)
   - Costo total razonable para 7 mensajes (~$0.001-0.005 esperado por RESEARCH §Pricing analysis)
5. Crear reporte `07-SMOKE-WAVE-A.md` con resultados.
6. **Human checkpoint final:** usuario revisa reporte y aprueba "smoke A pass" o "smoke A fail" (con razón).

**Si Smoke A falla:**
- Documentar la falla en el reporte con detalle (mensaje exacto, observability event, error stack si hay)
- NO proceder a Plan 08
- Volver a Plan 02/05 según el bug encontrado (re-shape adicional o swap rollback)
- El plan que falle se ejecuta en próxima iteración con `--gaps`

**Cero código en Plan 07** — solo ejecución, observación, query SQL, reporte, gate humano.

D-12 verificada: las confidence values de Plan 12.1 (`7d9bb2e` commit) deben funcionar en Gemini 5/5 (RESEARCH ya lo validó); este smoke confirma en runtime real con orchestrator completo.

D-22 verificada: KB retrieval real funcional — el sub-loop debe poder llamar `kb_search` y obtener al menos 1 hit válido en alguno de los mensajes 2/3/6/7 (depende del corpus KB en workspace Somnio prod).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md
@.planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md
@src/app/api/sandbox/process/route.ts
@src/lib/agents/somnio-v4/engine-v4.ts
@src/lib/agents/somnio-v4/comprehension.ts
@src/lib/agents/somnio-v4/sub-loop/index.ts
</context>

<interfaces>
<!-- Sandbox endpoint contract (post-Plan 03) -->
```http
POST http://localhost:3020/api/sandbox/process
Content-Type: application/json
Cookie: sb-access-token=...  (auth required — Plan 03 verified)

{
  "agentId": "somnio-sales-v4",
  "message": "<test message>",
  "state": { ... initial SandboxState ... },
  "history": [],
  "turnNumber": 1,
  "workspaceId": "a3843b3f-c337-4836-92b5-89c58bb98490",
  "systemEvent": null
}
```

Response shape (V4EngineOutput):
```json
{
  "success": true,
  "messages": ["...templates enviados..."],
  "newState": { ... },
  "debugTurn": { intent: {...}, ... },
  "error": null,
  "timerSignal": null
}
```

<!-- Observability tables (read-only queries) -->
```sql
-- agent_observability_events (records pipeline decisions)
agent_observability_events (
  id, workspace_id, agent_id, event_type, decision_type, payload, created_at
)

-- agent_observability_ai_calls (records LLM calls + costs)
agent_observability_ai_calls (
  id, workspace_id, agent_id, model, purpose, input_tokens, output_tokens, cost_usd, created_at
)
```
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Arrancar dev server + ejecutar 7 mensajes contra /sandbox v4</name>
  <files>.planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md</files>
  <read_first>
    - CLAUDE.md (puerto dev 3020)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-23, D-24)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/RESEARCH.md (§MessageAnalysisSchema 5/5 corpus)
    - src/app/api/sandbox/process/route.ts (post-Plan 03 — branch v4 confirmado)
  </read_first>
  <action>
**Pre-requisitos verificables:**

```bash
# 1. dev server running:
curl -sS http://localhost:3020/api/health || echo "Server not running — start with: npm run dev"

# 2. .env.local tiene env vars necesarias:
grep -q "^GOOGLE_GENERATIVE_AI_API_KEY=" .env.local && echo "✓ GOOGLE_GENERATIVE_AI_API_KEY present"
grep -q "^OPENAI_API_KEY_SALESV4=" .env.local && echo "✓ OPENAI_API_KEY_SALESV4 present"
grep -q "^ANTHROPIC_API_KEY=" .env.local && echo "✓ ANTHROPIC_API_KEY present (legacy compat)"

# 3. Branch v4 sandbox presente:
grep -q "if (agentId === 'somnio-sales-v4')" src/app/api/sandbox/process/route.ts || echo "ERROR: Plan 03 missing"

# 4. Schema flat shipped:
grep -q "z.object({" src/lib/agents/somnio-v4/sub-loop/output-schema.ts || echo "ERROR: Plan 02 missing"
! grep -q "z.discriminatedUnion" src/lib/agents/somnio-v4/sub-loop/output-schema.ts || echo "ERROR: Plan 02 incomplete"

# 5. Stack mixto wireado:
grep -q "google('gemini-2.5-flash-lite')" src/lib/agents/somnio-v4/comprehension.ts || echo "ERROR: Plan 05 missing"
grep -q "OPENAI_API_KEY_SALESV4" src/lib/agents/somnio-v4/sub-loop/index.ts || echo "ERROR: Plan 05 incomplete"
```

Si CUALQUIER pre-requisito falla → PARA, escala. NO ejecutar smoke con state inválido.

**Ejecución:**

1. Abrir browser en `http://localhost:3020/sandbox`. Login si requiere.
2. Seleccionar workspace Somnio (`a3843b3f-c337-4836-92b5-89c58bb98490`) en el switcher.
3. En el dropdown de agent selector, elegir **"somnio-sales-v4"** (registrado en agentRegistry desde Plan 12 padre).
4. Iniciar nueva conversación (estado limpio).
5. Para cada uno de los 7 mensajes, en orden:
   - Enviar el mensaje
   - Esperar respuesta (latencia esperada 1-9s — Gemini + GPT-4o mini)
   - Capturar en `07-SMOKE-WAVE-A.md`:
     - Mensaje enviado (verbatim)
     - Templates enviados por v4 (verbatim, copiar texto)
     - Si hay error visible en UI → capturar screenshot/text
     - Inspector dev panel: intent + confidence + reasoning
     - Sub-loop info (si visible — depende de cómo Plan 03 mapeó debugTurn): reason, outcome.status, sourceTopic
     - Latencia visible

**Mensajes (orden estricto):**

| # | Mensaje | Esperado intent | Esperado confidence | Sub-loop trigger? |
|---|---|---|---|---|
| 1 | hola | saludo | ≥0.85 | NO |
| 2 | qué tan adictivo es vs zolpidem? | dependencia o low_conf | ≤0.50 | SÍ (low_confidence) |
| 3 | funciona si tengo apnea? | contraindicaciones o low_conf | ≤0.50 | SÍ (low_confidence) |
| 4 | lo quiero comprar | quiero_comprar | ≥0.85 | NO |
| 5 | ok | acknowledgment | ≤0.70 | borderline (verificar) |
| 6 | cual es el sentido de la vida? | otro o low_conf | ≤0.50 | SÍ (razonamiento_libre) |
| 7 | mi pedido ya llegó? | otro o low_conf | varía | SÍ (probable razonamiento_libre o no_match) |

**Si CUALQUIER mensaje produce un error 5xx o crash en la UI:**
- Capturar el error completo (consola Next.js server-side + UI client-side)
- PARA — anota el bug
- Continuar con los demás mensajes para captura completa, pero la falla es BLOCKER del Smoke A

**Si el sub-loop emite `pipeline_decision:subloop_invariant_violation` event:**
- El schema flat post-Plan 02 tiene un bug de invariantes
- Capturar el payload del event (violation field)
- BLOCKER del Smoke A — Plan 02 necesita fix

**Reporte parcial:** después de los 7 mensajes, escribe la primera sección de `07-SMOKE-WAVE-A.md` con los resultados literales por mensaje. Tasks 2 y 3 completan el reporte con observability + cost.
  </action>
  <verify>
    <automated>test -f .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md && grep -c "^##" .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md | awk '$1 >= 1' | head -1 | wc -l | grep -q "^1$" && grep -qE "Mensaje 1|Mensaje #1|hola" .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md</automated>
  </verify>
  <acceptance_criteria>
    - Pre-requisitos checklist pasa (env vars + branches + schema flat + stack mixto)
    - 7 mensajes ejecutados en /sandbox con dropdown 'somnio-sales-v4'
    - Reporte parcial creado con sección por mensaje (intent + confidence + sub-loop info + templates enviados)
    - Si hubo error 5xx o crash → documentado en reporte como BLOCKER
    - Si subloop_invariant_violation observado → BLOCKER documentado
    - Cero edits a código productivo durante esta task (solo ejecución + observación + escritura del reporte)
  </acceptance_criteria>
  <done>7 mensajes ejecutados, reporte parcial escrito.</done>
</task>

<task type="auto">
  <name>Task 2: Query observability events + costs (D-24, D-27 partial)</name>
  <files>.planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md</files>
  <read_first>
    - .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md (Task 1 partial report)
    - .planning/standalone/somnio-sales-v4-runtime-wiring/CONTEXT.md (D-24, D-27)
  </read_first>
  <action>
**Vía Supabase Studio (PROD MorfX):**

**Query 1 — Events emitidos por v4 (D-24):**

```sql
SELECT
  event_type,
  decision_type,
  COUNT(*) as count,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM agent_observability_events
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v4'
  AND created_at > NOW() - INTERVAL '30 minutes'
GROUP BY event_type, decision_type
ORDER BY count DESC;
```

Esperado (referencia):
- `comprehension_completed` — 7 (uno por turn)
- `comprehension_completed_v4` — 7 (D-68 enriched event)
- `subloop_low_confidence_invoked` — al menos 1 (mensaje 2 garantizado)
- `subloop_completed` — igual al count de invocaciones
- `pipeline_decision:webhook_agent_routed` — sandbox NO emite (sandbox no pasa por webhook-processor) — esperado 0 en Smoke A
- `subloop_invariant_violation` — DEBE ser 0 (si > 0 → BLOCKER)

**Query 2 — Cost analysis (D-27):**

```sql
SELECT
  agent_id,
  model,
  purpose,
  COUNT(*) as calls,
  SUM(input_tokens) as in_tokens,
  SUM(output_tokens) as out_tokens,
  SUM(cost_usd) as total_cost_usd
FROM agent_observability_ai_calls
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v4'
  AND created_at > NOW() - INTERVAL '30 minutes'
GROUP BY agent_id, model, purpose
ORDER BY total_cost_usd DESC;
```

Esperado:
- `gemini-2.5-flash-lite` rows (purpose: comprehension + subloop_nunca_decir)
- `gpt-4o-mini` rows (purpose: subloop)
- **NO** `claude-haiku-4-5-20251001` rows (si aparece → swap incompleto en alguna parte de Plan 05 — BLOCKER)
- Costo total ~$0.0005 - $0.005 para 7 mensajes (RESEARCH §Pricing: Gemini ~$0.0001/call, GPT-4o mini ~$0.0003/call)

**Query 3 — Errores observados:**

```sql
SELECT
  event_type,
  payload,
  created_at
FROM agent_observability_events
WHERE workspace_id = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  AND agent_id = 'somnio-sales-v4'
  AND created_at > NOW() - INTERVAL '30 minutes'
  AND (
    event_type = 'error'
    OR decision_type LIKE '%fail%'
    OR decision_type LIKE '%error%'
    OR decision_type = 'subloop_invariant_violation'
  )
ORDER BY created_at DESC;
```

Esperado: 0 rows. Si > 0 → cada row es un BLOCKER candidate.

**Append al reporte `07-SMOKE-WAVE-A.md`:**

```markdown
## Observability Results

### Events count by type
[paste Query 1 results]

### Cost breakdown by model
[paste Query 2 results]

### Errors and invariants
[paste Query 3 results — should be empty or annotated as BLOCKER]

## Summary
- Total events: [N]
- Sub-loop invocations: [N] (esperado ≥1)
- Invariant violations: [N] (esperado 0 — BLOCKER si >0)
- Total cost USD: $[X]
- Avg cost per turn: $[Y]
- Models seen: [list]
- Anthropic Haiku calls: [N] (esperado 0 — BLOCKER si >0)
```
  </action>
  <verify>
    <automated>grep -q "Observability Results" .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md && grep -q "Total events" .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md && grep -qE "Cost breakdown|gemini-2.5-flash-lite|gpt-4o-mini" .planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md</automated>
  </verify>
  <acceptance_criteria>
    - Query 1, 2, 3 ejecutadas en Supabase Studio (PROD MorfX)
    - Resultados de cada query pegados en el reporte
    - Section "Summary" con: total events, sub-loop count, invariant violations, total cost, avg per turn, models seen, anthropic haiku count
    - Si invariant violations > 0 o haiku calls > 0 → marcado como BLOCKER en el reporte
    - Sandbox NO genera webhook_agent_routed events (sandbox path no pasa por webhook-processor — verificable)
  </acceptance_criteria>
  <done>Observability + costos documentados en el reporte.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: HALT — Usuario revisa Smoke Wave A y aprueba o rechaza</name>
  <what-built>
    Reporte completo del Smoke Wave A con:
    - 7 mensajes ejecutados + sus templates de respuesta + intent/confidence
    - Observability events (esperados emitted, errors zero)
    - Cost breakdown (solo Gemini + GPT-4o mini, cero Haiku)
  </what-built>
  <how-to-verify>
**STOP — Smoke Wave A review.**

(W-6 fix iter 1: este checkpoint usa `checkpoint:human-action` por consistencia con Plan 01 T2 y Plan 08 T4. La acción humana aquí es revisar el reporte + emitir veredicto textual; no hay automatización previa que solo necesite verificación visual — es decisión de gating, no QA.)

Revisa el reporte `.planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md`:

**Decision tree:**

✅ **APROBAR si todo lo siguiente es cierto:**
- [ ] 7 mensajes ejecutados sin error 5xx o crash
- [ ] Mensaje 1 (hola) → confidence ≥0.85, intent=saludo
- [ ] Mensaje 2 (zolpidem) → confidence ≤0.50, **sub-loop disparó** con reason='low_confidence', outcome válido (canonical o no_match)
- [ ] Mensaje 4 (lo quiero comprar) → confidence ≥0.85, intent=quiero_comprar
- [ ] Mensaje 6 (sentido de la vida) → sub-loop disparó con reason='razonamiento_libre' o low_confidence, outcome aceptable (no_match esperado, canonical aceptable si hay KB doc)
- [ ] **CERO** invariant_violation events (`subloop_invariant_violation`)
- [ ] **CERO** llamadas a `claude-haiku-4-5` desde agent_id='somnio-sales-v4'
- [ ] Total cost USD < $0.01 para los 7 mensajes (sanity check pricing)
- [ ] Templates enviados al cliente coherentes con la conversación (no respuestas absurdas)

✅ **APROBAR con observación si:**
- Mensaje 5 (ok) tuvo confidence borderline pero no causó problema (calibración Plan 12.1 funcionó parcialmente — D-12 satisfied)
- Mensaje 7 (mi pedido ya llegó?) tuvo comportamiento ambiguo pero respuesta razonable (handoff o template adecuado)
- Latencia mayor a 5s en algún turn (fría primer call, esperable)

❌ **RECHAZAR si:**
- Cualquier mensaje produjo error 5xx o crash en server logs
- Sub-loop falló con schema rejection ("oneOf not supported", "literal not accepted") — significaría que Plan 02 tiene un bug y el schema flat no se aplicó correctamente
- `subloop_invariant_violation` events > 0 — bug en validateLoopOutcomeInvariants o en el LLM emite shape inválido sistemáticamente
- Llamadas a `claude-haiku-4-5` desde agent_id='somnio-sales-v4' — Plan 05 swap incompleto
- Costos anómalos (>$0.10 para 7 mensajes — algo está calling más LLMs de lo esperado)
- Templates incoherentes (ej: emite handoff cuando debería responder, o emite respuesta cuando debería handoff)

**Confirmar al asistente con UNA de:**
- "smoke A pass — proceder a Plan 08 atomic flip"
- "smoke A fail — rollback Plan X" (donde X = Plan que rompió: típicamente 02 schema o 05 swap)
- "smoke A pass con observaciones: [detalles]" (proceder pero con caveats documentados)

NO continuar a Plan 08 sin confirmación explícita.
  </how-to-verify>
  <resume-signal>Usuario escribe "smoke A pass" o "smoke A fail con razón"</resume-signal>
</task>

</tasks>

<verification>
- 7 mensajes ejecutados en sandbox (Plan 03 path)
- Observability emite events con agent_id='somnio-sales-v4' (D-24)
- Cost analysis muestra solo Gemini + GPT-4o mini (D-30 swap completo)
- Cero invariant_violation events (Plan 02 schema flat válido en runtime)
- Sub-loop ejerce GPT-4o mini con stack flat por primera vez en runtime real (cierra H-1)
- Reporte completo en 07-SMOKE-WAVE-A.md
- Gate humano final: pass / fail con razón (checkpoint:human-action — consistente con Plan 01 T2 y Plan 08 T4)
</verification>

<success_criteria>
- Smoke A PASS habilita Plan 08 (atomic flip prod)
- Smoke A FAIL bloquea Plan 08; identifica plan que necesita fix (típicamente 02 o 05) y abre `--gaps` cycle
</success_criteria>

<output>
`.planning/standalone/somnio-sales-v4-runtime-wiring/07-SMOKE-WAVE-A.md` ya creado durante Task 1+2.

Update final tras human checkpoint con:
- Veredicto: PASS / FAIL / PASS-with-observations
- Razón textual si FAIL
- Próximo paso: Plan 08 (si PASS) o gap closure (si FAIL)
</output>
</output>
