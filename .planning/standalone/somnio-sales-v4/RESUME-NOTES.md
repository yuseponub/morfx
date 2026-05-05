---
status: paused-pre-Plan-12.1-comprehension-calibration
paused_at: 2026-05-05
phase: somnio-sales-v4
next_action: Execute Plan 12.1 — comprehension prompt few-shot per-intent numeric calibration
---

# Resume Notes — somnio-sales-v4 (post-compact)

## Estado HOY (2026-05-05)

Phase pausado en mitad de Plan 12 Task 4 (smoke pre-flip). NO hacer Plan 13 (atomic flip) hasta resolver el bloqueante de comprehension overconfidence.

### Lo que YA está hecho y pushed a `origin/main`:

- ✅ Plans 01-12 ejecutados, 60+ commits en main
- ✅ 5 migraciones SQL aplicadas en producción (jose confirmó 2026-05-03)
- ✅ KB corpus 18 docs sembrados (`agent_knowledge_base` table, workspace Somnio, agent_id='somnio-sales-v4')
- ✅ KB corpus AUDITADO y corregido para eliminar inventos del LLM (commit `360df2c`)
- ✅ v4 deployado en Vercel pero **SIN tráfico real** (Regla 6 OK — sin regla en `routing_rules`)
- ✅ v3 sigue atendiendo clientes Somnio normalmente
- ✅ Sandbox dropdown muestra v4 (fix sibling-family filter, commit `e83a3eb`)

## 🔴 BLOQUEANTE ACTIVO — comprehension overconfidence

### Problema descubierto en smoke pre-flip

Cuando jose probó v4 en `/sandbox` con mensajes ambiguos:
- "qué tan adictivo es vs zolpidem?" → comprehension dio `intent=contraindicaciones, confidence=0.85`
- "funciona si tengo apnea?" → comprehension dio `intent=contraindicaciones, confidence=0.85`
- "y mi tía dice que esto es magia" → `intent=fallback, confidence=0.75` (fue a handoff por intent='fallback' en HANDOFF_INTENTS, NO porque dispare el sub-loop)

**Resultado:** el sub-loop NUNCA se ejecuta porque comprehension siempre da confidence ≥ 0.75, threshold actual es 0.70. v4 termina siendo idéntico a v3 en runtime — toda la infraestructura de KB + sub-loop queda dormida.

### Lo que HEMOS INTENTADO y NO ha funcionado

1. **Few-shot inicial genérico (8 ejemplos)** en `comprehension-prompt.ts` — implementado en Plan 06 Task 5. Cubre 3 universales-claros + 3 context-dependent + 2 sumidero. **NO BASTÓ:** el modelo Haiku ignora la calibración de números bajos en el few-shot genérico, porque los 8 ejemplos no enseñan casos médicos/comparativos/etarios específicos.

2. **Threshold parametrizable** (`platform_config.somnio_v4_low_confidence_threshold = 0.70`) — implementado en Plan 02 + Plan 07. Funciona pero el problema raíz no es el threshold, es que el modelo siempre da ≥0.75.

### Caminos discutidos y descartados/aceptados

| Opción | Estado |
|--------|--------|
| Aceptar D-78 (no calibrar pre-launch, solo post-flip con `agent_unknown_cases`) | DESCARTADO — Karen vería overconfidence sistémico desde día 1 |
| Plan B enum (certain/likely/uncertain) — D-67 contingency | EXPLICADO en detalle pero RECHAZADO por jose: prefirió mantener números |
| **Plan 12.1: per-intent few-shot con números** | ✅ ACEPTADO por jose (2026-05-05) — usar números pero PER-INTENT para los top 8 |
| Stick con genérico actual + post-flip tuning | DESCARTADO — riesgo de v4 ser idéntico a v3 |

## 🎯 PRÓXIMO PASO — Plan 12.1

### Plan acordado (en `.planning/standalone/somnio-sales-v4/12.1-PLAN.md` ya escrito)

**Path:** Opción 3 — números + per-intent few-shot piloto. NO se cambia el schema (sigue `intent_confidence: number`). Solo se rewrite `comprehension-prompt.ts` agregando bloques per-intent para los top 8.

**Scope acordado:** 8 intents (los más frecuentes en data Somnio real consultada en prod):
1. saludo (15% tráfico)
2. precio (6.3%)
3. quiero_comprar (6.6%)
4. rechazar (7%)
5. pago (2.6%) — TRAP por templates limitados
6. tiempo_entrega (2.5%)
7. contraindicaciones (1.4%) — TRAP MEDICAL
8. efectividad (1.3%) — TRAP RELATIVO

### Confidence values acordados (validados contra templates v3 + data real prod)

```
### intent="saludo"
- "hola" → 0.95
- "buenos días" → 0.95
- "Hola buenos días" → 0.92
- "Buenas noches q precio tiene" → 0.50  (saludo + precio, real)
- "hola, una pregunta sobre algo médico" → 0.45
- "hola, mi sobrina toma esto y se siente rara" → 0.30

### intent="precio"
- "cuánto cuesta?" → 0.95
- "qué precio tiene?" → 0.95
- "Precio" → 0.90 (real, corto)
- "Valor" → 0.90 (real)
- "Me recuerdas el valor?" → 0.88 (real)
- "Que precio tiene los 2x" → 0.80 (real, precio de pack)
- "es muy caro?" → 0.30 (juicio subjetivo)
- "vale la pena al precio?" → 0.30
- "Información... dirección y valor... contenido" → 0.40 (multi-intent real)

### intent="quiero_comprar"
- "lo quiero comprar" → 0.92
- "Me interesa" → 0.88 (real)
- "Hola! Me interesa comprar un ELIXIR DEL SUEÑO" → 0.92 (real templated trigger)
- "Solo quiero 2 frascos" → 0.65 (real, multi: comprar + seleccion_pack)
- "y si quiero comprar?" → 0.35 (hipotético)
- "¿cómo funciona la compra?" → 0.40 (info, no compromiso)

### intent="rechazar"
- "no me interesa" → 0.92
- "no gracias" → 0.92
- "no quiero" → 0.90
- "No" (solo) → 0.55 (real, sin contexto)
- "déjalo así" → 0.50
- "no estoy seguro" → 0.35
- "ahorita no" → 0.50 (real)
- "No quiero seguir botando plata" → 0.50 (real, rechazo emocional)

### intent="pago" — RECALIBRADO POR HALLAZGO
- "cómo pago?" → 0.85 (cubierto por template oferta)
- "se puede pagar contraentrega?" → 0.92
- "aceptan efectivo?" → 0.90
- "SI EN EFECTIVO" → 0.88 (real)
- "aceptan tarjeta?" → 0.40 (NO cubierto, escala)
- "Puedo pagar por nequi?" → 0.40 (real, NO cubierto)
- "Para pagar con tarjeta o PSE" → 0.35 (real, NO cubierto)
- "PSE?" → 0.40
- "pago a cuotas con qué tarjeta?" → 0.30
- "Listo es mejor nequi" → 0.40 (real, método NO automatizado)

### intent="tiempo_entrega"
- "en cuánto llega?" → 0.88
- "Cuando llega?" → 0.88 (real)
- "cuándo me lo entregan?" → 0.88
- "Cuando llegará el somnio?" → 0.85 (real)
- "es rápido?" → 0.50
- "llega antes del jueves?" → 0.40 (condicional + temporal)
- "si pago hoy cuándo llega a Cartagena?" → 0.40

### intent="contraindicaciones" — TRAP MEDICAL
- "tiene efectos secundarios?" → 0.92
- "puedo si tomo licor?" → 0.92
- "Tiene alguna contraindicación?" → 0.88
- "Yo no tomo anticoagulante" → 0.85 (real, cubierto inverso)
- "es muy fuerte?" → 0.55
- "Hipertensión?" → 0.30 (real, NO cubierto)
- "soy paciente oncológica, tiene contraindicación?" → 0.25 (real, NO cubierto)
- "funciona si tengo apnea?" → 0.30 (caso real probó jose)
- "qué tan adictivo es vs zolpidem?" → 0.25 (caso real probó jose)
- "puedo si estoy embarazada?" → 0.25
- "interactúa con sertralina?" → 0.30
- "puedo darle a mi hijo de 10 años?" → 0.30

### intent="efectividad" — TRAP RELATIVO
- "funciona?" → 0.92
- "es efectivo?" → 0.92
- "Pero quiero saber si es verdad que sirve para dormir" → 0.88 (real)
- "qué resultados ha dado?" → 0.55
- "Si pero es de verdad que sirve tiene garantía" → 0.40 (real, multi-intent)
- "Para la ansiedad y el estrés sirve" → 0.45 (real, caso específico)
- "funciona para insomnio crónico de 10 años?" → 0.35
- "Deseo saber si funciona en una persona de 96 años" → 0.30 (real, caso etario)
- "es más efectivo que melatoxina pura?" → 0.30
- "qué dicen los médicos sobre su efectividad?" → 0.35
- "funciona si ya he probado de todo?" → 0.30
```

### Generic fallback (~20 intents restantes — solo 4 ejemplos)
- "no me interesa, gracias" → 0.92
- "ok" → 0.55 (ack ambiguo)
- "lol jajaja 😂" → 0.30 (off-topic)
- "y mi tía dice que esto es magia" → 0.20 (opinión tercero)

## Reglas globales del prompt (encabezado nuevo del bloque few-shot)

```
Después de elegir intent.primary, evalúa qué tan bien encaja con un número entre 0 y 1:

NUNCA des ≥0.85 cuando el mensaje pregunte por:
- Una condición médica específica no listada (apnea, fibromialgia, lupus, post-quirúrgico, etc.)
- Una comparación con otros fármacos (zolpidem, melatoxina, sertralina, etc.)
- Una circunstancia personal (embarazo, lactancia, niños menores de 14, edad avanzada)
- Una opinión subjetiva o juicio de tercero
- Un mensaje vago, off-topic, broma, o tema fuera de Somnio
```

## Tasks de Plan 12.1 (~2-3 hrs trabajo)

1. Editar `src/lib/agents/somnio-v4/comprehension-prompt.ts` — reemplazar bloque "## EJEMPLOS DE CALIBRACIÓN DE CONFIDENCE" con (a) reglas globales + (b) per-intent blocks (top 8) + (c) generic fallback (4 ejemplos)
2. Verificar que `npx tsc --noEmit -p tsconfig.json` exit 0
3. Verificar que tests vitest no rompen (no debería — los tests no tocan el prompt content directly)
4. Commit + push (no hay migration nueva, solo TS)
5. Esperar Vercel redeploy ~1-2min
6. Smoke retest en /sandbox con los mismos mensajes que jose probó:
   - "hola" → debe seguir 0.95+
   - "ok" → debe ser ~0.55
   - "qué tan adictivo es vs zolpidem?" → debe bajar a < 0.70 (escala al sub-loop)
   - "funciona si tengo apnea?" → debe bajar a < 0.70
   - "y mi tía dice que es magia" → debe bajar a < 0.70 directamente (no por intent='fallback' transition)
7. Verificar observability en Supabase: `SELECT payload FROM agent_observability_events WHERE agent_id='somnio-sales-v4' ORDER BY created_at DESC LIMIT 30` — buscar `pipeline_decision:subloop_low_confidence_invoked`
8. Si smoke PASS → continuar a Plan 13 (atomic flip)
9. Si smoke FAIL → considerar pivot a Plan B enum como contingency

## Reglas operativas que jose locked en este sprint

1. **Tono escalación = silencio absoluto.** NO mencionar "asesor humano" / "te derivo" / "te paso" / "tomo nota" / "te conecto" en respuesta visible. Cuando un escalate_if dispara, el bot SIMPLEMENTE NO RESPONDE — no dice "vuelvo en un momento". El cliente debe creer que un humano atiende todo el tiempo.

2. **Composición real (locked):** melatonina 10mg + citrato de magnesio 50mg. Sin valeriana, sin otros activos.

3. **Forma producto (locked):** 90 comprimidos por frasco, 1 diaria, 30 min antes de dormir, se traga entera con agua (no se mastica ni se disuelve).

4. **Edad mínima (locked):** 14 años. Menores de 14 → escalate.

5. **Métodos de pago (locked):** contraentrega efectivo (default automatizado) + transferencia (Bancolombia/Nequi/Daviplata) + tarjeta vía link de pago. Los 3 últimos los maneja humano manualmente — bot escala (silencio) cuando los pide.

6. **Insomnio crónico con medicación recetada:** protocolo de bajada paulatina 15 días (texto literal en `insomnio_largo_plazo.md`).

7. **Devoluciones (locked):** 30 días desde recepción + cliente envía el producto restante. Reembolso vía humano.

8. **Same-day delivery (locked, leído de prod `delivery_zones`):** Bucaramanga, Floridablanca, Girón, Piedecuesta (corte 14:30) + Bogotá (corte 09:00).

9. **Fabricante / INVIMA específico:** ESCALATE (silencio). Bot NO da nombres ni números, solo dice "está en la etiqueta del frasco".

10. **Alternativas naturales:** Bot recomienda hábitos (dormir hora fija, sin pantallas 30 min antes, cenas livianas, café antes de las 2pm) — NO recomienda otros consumibles (manzanilla, tilo, etc.).

## Archivos clave para retomar

- `.planning/standalone/somnio-sales-v4/12.1-PLAN.md` — el plan formal (escrito antes del compact)
- `.planning/standalone/somnio-sales-v4/12-SUMMARY.md` — checklist smoke completo
- `.planning/standalone/somnio-sales-v4/CONTEXT.md` — D-01 a D-79 decisiones lockeadas
- `src/lib/agents/somnio-v4/comprehension-prompt.ts` — el archivo que hay que editar
- `src/lib/agents/somnio-v4/knowledge/**/*.md` — 18 KB docs ya corregidos y sembrados
- `src/lib/agents/somnio-v4/threshold.ts` — reads `platform_config.somnio_v4_low_confidence_threshold`
- `src/lib/agents/somnio-v4/escalation.ts` — `decideSubLoopReason` evalúa `confidence < threshold`

## Seguridad pendiente

⚠️ La `OPENAI_API_KEY` que jose pegó en chat (sk-proj-x3J8sG3pQQGdjI_bLhZW...) quedó en history. Después de Plan 13 ship: revocar en `platform.openai.com/api-keys` + crear una nueva solo para Vercel env vars + agregar a Vercel Production scope para que el cron `knowledge-sync-v4` (Plan 09) corra en backend sin requerir key local.

## Si el smoke retest FAIL después del Plan 12.1

Plan B contingency (D-67) escrito en detalle en chat history pre-compact:
- Pivotar `comprehension-schema.ts` de `intent_confidence: number` a `confidence_calibration: z.enum(['certain','likely','uncertain'])`
- Mapping numérico vive en `platform_config.somnio_v4_calibration_map` JSONB
- Operator-tunable sin redeploy
- Documentado completo arriba de este archivo (no se ejecutó porque jose prefirió Opción 3)
- ~5-7 hrs trabajo si hay que rescatarlo
