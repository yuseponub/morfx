# Standalone agent-varixcenter — Learnings

**Fecha:** 2026-06-11
**Duración:** 1 sesión (research → plan → execute → review → verify, mismo día)
**Plans ejecutados:** 11 (7 waves) + code-review-fix

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| **CR-01 (CRITICAL): ninguna cita se podía crear** — `parseSlotToISO` esperaba rango `"10:00 AM - 10:20 AM"` pero comprehension captura solo el inicio `"10:00 AM"` → TypeError → todo booking degradaba a handoff | Contrato de formato de string entre módulos (availability ↔ comprehension) definido en dos planes distintos sin test de integración cruzado; 251 tests unitarios verdes en ambos lados no lo detectaron | Opción B: `parseSlotToISO` tolera ambos formatos, `fin = inicio + SLOT_MINUTES` si falta el separador (`37e9f42e`) | Cuando dos módulos intercambian strings con formato, escribir UN test que use el output real de A como input de B. El code-review post-ejecución es gate obligatorio — atrapó lo que 251 tests no vieron |
| **W-01: falla de Supabase = "todos los slots libres"** — la query de appointments ignoraba `error` | Patrón recurrente: supabase-js no lanza, retorna `{ data: null, error }`; `data ?? []` convierte error en lista vacía | `throw` ante `error`; el caller ya hace fail-open (`37e9f42e`) | Misma clase que el bug RLS silent 0-rows (memoria `whatsapp_template_status_sync`): SIEMPRE chequear `error` de supabase-js explícitamente |
| **W-02: `otro` con confianza ≥80 dejaba al cliente sin respuesta** | Transición #10 del diseño solo cubría conf<80; el caso conf≥80 caía a natural_silence | Catch-all `* + otro → handoff` (patrón godentist) (`aa5d9425`) | En state machines: enumerar el complemento de cada condición (si hay rama conf<80, preguntar qué pasa con ≥80) |
| **Grilla del diseño con error aritmético** — DISENO decía último slot mañana "11:10" pero la grilla :00/:20/:40 desde 8:00 produce 11:00-11:20 | Aritmética manual en discuss-phase sin validar contra la generación real | Executor lo detectó al implementar y ajustó el test (documentado en 05-SUMMARY) | Los ejemplos numéricos de un diseño son hipótesis, no specs — el código generador es la verdad |
| **Build de Vercel roto a las 15:40 (commit 0bb0a95)** — `guards.ts` importaba `comprehension-schema` (Wave 2) desde Wave 1 | Dependencia forward PLANEADA entre waves + checkout compartido: otra instancia Claude pusheó en la ventana rota aunque este orquestador retuvo el push deliberadamente | Wave 2 cerró el gap; prod nunca cayó (Vercel sirve el último deploy verde) | **Con checkout compartido entre instancias, cada merge a main local debe ser push-safe (tsc=0)** — cualquier instancia puede pushear en cualquier momento. No planear forward-deps entre waves; si son inevitables, mergear las waves juntas |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Integración varix-clinic: **query directa con 2º cliente Supabase service_role** en `src/lib/domain/varix-clinic/` | (a) API route HTTP en varix-clinic; (b) robot scraping tipo Dentos | Controlamos ambos proyectos → menos latencia, cero deploy coupling, menos puntos de falla. El HTTP de GoDentist→Dentos existía solo porque Dentos es de terceros. Desviación domain documentada (sin workspace_id, mono-cliente, análogo platform-config.ts) |
| VAL guard parametrizado: `CRITICAL_FIELDS_BY_AGENT` map en v3-production-runner | Hardcodear otro if; copiar el guard a un runner nuevo | godentist usa `sede_preferida`, varixcenter usa `cedula` (D-05); el map preserva godentist intacto (Regla 6) y escala a futuros agentes |
| Saludo custom 2 plantillas sin doble triage (amenda D-12 del usuario mid-flight) | 5 opciones A-E del diseño original | Decisión del usuario en checkpoint Wave 0; el triage se difiere al template `triage`; afirmativo post-saludo = `quiero_agendar` (regla contextual en comprehension-prompt) |
| `rule_type='agent_router'` en routing_rules | `'router'` (como dice el template godentist-fb-ig en agent-scope.md) | El CHECK constraint real solo acepta `'agent_router'` — el template de agent-scope.md tiene deuda doc pre-existente |
| Checkpoint Wave 0 resuelto semi-autónomo | Esperar al operador para todo | UUIDs doctores + routing priorities se obtuvieron por query REST directa con credenciales locales (read-only); solo saludo + env vars quedaron como acción humana real |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| availability.ts (`parseSlotToISO`) | comprehension (`horario_seleccionado`) | Formato rango vs solo-inicio (CR-01) | Parser tolerante a ambos formatos |
| Wave 6 SQL activación | `workspace_agent_config` | El workspace Varixcenter NO tenía row → un UPDATE no haría nada | `INSERT ... ON CONFLICT DO UPDATE` con `lifecycle_routing_enabled=true` (detectado en Wave 0 audit) |
| guards.ts (Wave 1) | comprehension-schema.ts (Wave 2) | Forward-dep rompió build intermedio pusheado por instancia concurrente | Ver bug #5; regla push-safe por wave |

## Tips para Futuros Agentes

### Lo que funcionó bien
- **Pattern-mapper pre-planning detectó el riesgo VAL guard** (CRITICAL_FIELDS hardcodeado) antes de escribir una línea — el planner lo resolvió por diseño, no como hotfix.
- **Wave 0 audit con queries reales a prod** (doctors_view, routing_rules) eliminó los bloqueos de mitad de ejecución; los UUIDs reales viajaron en los prompts de los executors.
- **Receta de clone godentist-fb-ig (LEARNINGS previo) + 6 grep gates** — el registro en sitios compartidos fue mecánico y verificable.
- **Code review post-ejecución como gate** — atrapó el bug CRITICAL que toda la suite verde no vio.
- Amendas de diseño mid-flight (saludo D-12) registradas en 00-WAVE0-AUDIT.md y propagadas vía prompt de cada executor afectado — cero drift.

### Lo que NO hacer
- NO asumir que suites verdes en ambos lados de un contrato string = contrato correcto.
- NO tratar `{ data, error }` de supabase-js con `data ?? []` sin chequear `error`.
- NO dejar main local con tsc≠0 entre waves en un checkout compartido (cualquier instancia puede pushear).
- NO confiar en los line numbers de PATTERNS/RESEARCH al ejecutar — el repo se mueve por instancias concurrentes; ubicar branches por contenido.

### Patrones a seguir
- Agente clonado v3: 6 sitios de registro (index self-register, AGENT_CATALOG, pre-warm, dispatch branch, agentModule branch, VAL guard) — falta uno = roto en silencio.
- Domain module cross-project: único `createClient` en `client.ts` fail-fast, caller fail-open, scope acotado a las tablas mínimas.
- Constraint 23P01 (EXCLUDE gist): retry con el otro doctor → si ambos fallan → `slot_taken` → re-availability.
- TZ Bogotá: `Date.UTC(...).getUTCDay()` para día de semana; offset literal `-05:00` en TIMESTAMPTZ; nunca `new Date(string)` sin offset.

### Comandos útiles
```bash
# Suite completa del agente + regresión clones
npx vitest run src/lib/agents/varixcenter/ src/lib/domain/varix-clinic/ src/lib/agents/godentist/__tests__/ src/lib/agents/godentist-fb-ig/__tests__/
# Los 6 grep gates de registro
grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts
grep -c "id: 'varixcenter'" src/lib/agents/agent-catalog.ts
grep -c "import('../varixcenter')" src/lib/agents/production/webhook-processor.ts   # >= 2
grep -c "agentId === 'varixcenter'" src/lib/agents/production/webhook-processor.ts
grep -c "agentModule === 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts
grep -cE "agentModule.*!== 'varixcenter'" src/lib/agents/engine/v3-production-runner.ts
# Templates en prod (REST, sin SQL editor)
curl -s "$URL/rest/v1/agent_templates?agent_id=eq.varixcenter&select=id" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -H "Range: 0-0" -I | grep content-range
```

## Gap de activación encontrado en vivo (2026-06-12)

El SQL de activación cubría `lifecycle_routing_enabled` + routing rule pero NO el master switch **`agent_enabled`** (default `false`) de `workspace_agent_config` — con él en false, `isAgentEnabledForConversation` (agent-config.ts:160) deshabilita todas las conversaciones y el bot no responde aunque el routing esté perfecto. Síntoma: inbound real llegó, cero eventos, cero respuesta. Fix: `agent_enabled=true` vía PATCH. **Lección:** en activaciones de agente nuevo, la checklist es TRES switches: `agent_enabled` + `lifecycle_routing_enabled` + routing rule activa.

## Estado al cierre

- Código completo, pusheado (`4fc7bf9b`), 251/251 tests, tsc=0, VERIFICATION 18/18.
- Templates aplicados en prod (count=46, saludo D-12 verificado).
- **Agente DORMANT** — activación 100% manual pendiente del operador: env vars `VARIX_CLINIC_*` en Vercel → routing rule SQL (`12-ROUTING-RULE-USER-ACTION.md`) → smoke real.
