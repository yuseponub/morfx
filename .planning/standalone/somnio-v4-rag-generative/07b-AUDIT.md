# Plan 07b — AUDIT (1-página)

**Status:** Pre-implementación (2026-05-18)
**Approach:** Nivel 2 defense-in-depth — upgrade Flash-Lite → Flash NORMAL + reglas de polaridad
**D-09 status:** UNLOCKED (documentar como D-31 en `DISCUSSION-LOG.md` durante este plan)

---

## Por qué Plan 07 v1 (semantic-only) no cerró el bug

Plan 07 v1 reescribió 107 items de `nunca_decir` en 18 KBs como proposiciones declarativas
afirmativas. Después del re-run Smoke A V2:

| Caso | V1 result | V2 result | Δ |
|---|---|---|---|
| 1  — "puedo si tomo alcohol?"   | PASS | **FAIL** | REGRESIÓN |
| 2  — "estoy embarazada..."      | FAIL | **PASS** | ARREGLADO |
| 13 — "cuántas horas dura..."    | FAIL | **PASS** | ARREGLADO |
| 14 — "qué hábitos ayudan..."    | FAIL | **PASS** | ARREGLADO |
| 16 — "envían a Miami?"          | PASS | **FAIL** | REGRESIÓN |

Net: +1 PASS (14 → 15) pero con **2 regresiones**. Cases 1+16 que pasaban en V1 ahora fallan
en V2. Conclusión: **musical chairs** — el fix semántico mueve el false-positive de un
item/caso a otro sin eliminar el problema estructural.

Evidencia completa: `SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md` (preservada).

## Root cause estructural (no del item específico)

Gemini Flash-Lite tiene **limitación intrínseca para razonar polaridad** cuando hay overlap
de palabras tópicas entre la respuesta y el item prohibido. No distingue consistentemente:

- "Respuesta AFIRMA la aserción prohibida" → debería violar (correcto)
- "Respuesta NIEGA la aserción prohibida" → NO debería violar (Flash-Lite falla aquí)
- "Respuesta REDIRIGE al profesional sin afirmar" → NO debería violar (Flash-Lite falla aquí)
- "Respuesta es NEUTRAL respecto a la aserción" → NO debería violar (Flash-Lite falla aquí)

Ejemplo case 1 V2: respuesta = handoff silente (string vacío); item = "Combinar el producto
con alcohol es seguro o recomendable." → Flash-Lite emite `violates=true` aunque la
respuesta esté literalmente vacía y NO afirme nada. False-positive estructural por overlap
tópico ("alcohol" en el item, sin contenido en la respuesta).

Ejemplo case 16 V2: respuesta = handoff silente; item = "El envío fuera de Colombia está
aprobado por el bot sin necesidad de confirmación humana." → Flash-Lite emite `violates=true`
aunque el outcome haya sido `requiresHuman=true` (handoff silente correcto del flow).
Mismo patrón: tópico Miami/internacional overlapa con el item.

## Fix locked (Jose 2026-05-18) — Nivel 2 defense-in-depth

Dos cambios mínimos en `src/lib/agents/somnio-v4/sub-loop/nunca-decir-check.ts`:

1. **Model swap línea 36:** `gemini-2.5-flash-lite` → `gemini-2.5-flash` (Flash NORMAL).
   - Razón: Flash NORMAL razona polaridad ~5x mejor que Flash-Lite (research-backed +
     Iter 5b lecciones del standalone hermano `somnio-sales-v4-runtime-wiring`).
   - Costo: ~$6/mes delta en prod (1000 ses/día × 10 turns × $0.000022/check delta).
     Aceptado por Jose 2026-05-18.

2. **System prompt extendido** con 4 reglas de polaridad explícitas (AFFIRMS / NEGATES /
   REDIRECTS / NEUTRAL) + 1 ejemplo verbatim de negación que NO debe disparar violation.

### Unlock D-09 — justificación con evidencia

D-09 lockeó "checkNuncaDecir sigue Flash-Lite. Ya funciona. No tocar." en discuss-phase
inicial (2026-05-15/16) **SIN evidencia empírica** del musical chairs. Plan 07 v1 generó
esa evidencia (`SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`). El lock se condicionó a "funciona";
la evidencia demuestra que NO funciona para razonamiento de polaridad con items declarativos.
El unlock es proporcional, documentado, y reversible (rollback plan en plan 07b).

El ejecutor appendea D-31 a `DISCUSSION-LOG.md` con:

- Status: D-09 UNLOCKED, new lock para Flash NORMAL + polarity rules
- Razón: evidencia Plan 07 v1 musical chairs (link al evidence file)
- Trade-off: +$6/mes en prod, beneficio = arreglar polaridad estructural
- Reversibilidad: `git revert` los 3 commits de Plan 07b → vuelve a baseline V2

## Out of scope (anti-scope-creep)

- Schema refactor (`{violates, violatedRule}` SE QUEDA).
- Multi-call / two-step check (escala a Plan 07c si hace falta).
- KB rewrites (Plan 07 v1 baseline preservado).
- Otros files runtime del sub-loop (`comprehension-schema.ts`, `tooling-call.ts`,
  `generation-call.ts`, `output-schema.ts`, `index.ts`, `tone-base.ts`, `safe-output.ts`,
  `kb-search-tool.ts`, `prompt.ts`, `few-shots.ts` — todos intactos).
- Modificar `smoke-rag-a.test.ts` permanentemente (sí permitido patch sed temporal con
  revert al final).
- Crear routing rule (v4 sigue dormant — eso es Plan 08).
- Migraciones SQL.

## Decision gate

Plan 07b cierra **VERDE** si Smoke A V3 retorna:

- 17/17 PASS judge OVERALL
- 0/17 invenciones
- Cases 1, 2, 13, 14, 16 todos PASS

Cierra **AMARILLO** (excepción aceptable, documentada) si:

- 16/17 PASS + 0 invenciones + cases 2/13/14 PASS + UNA falla residual NO en cases 1 ó 16
  (regresión nueva de un caso V1+V2 PASS es show-stopper, no aceptable).

Escala a Plan 07c (Schema-CoT Nivel 3) si **ROJO**:

- <16/17 PASS
- ≥1 invención nueva
- Cases 1 ó 16 siguen fallando después del upgrade
- Cualquier caso que pasó en V1 Y V2 regresiona en V3

## Next

Task 7b.2 — Modificar `nunca-decir-check.ts` (model swap + polarity prompt).
