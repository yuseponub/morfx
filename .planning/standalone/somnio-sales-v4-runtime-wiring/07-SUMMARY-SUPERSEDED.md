# Plan 07 — SUPERSEDED (2026-05-16)

**Original goal:** Smoke Wave A del approach canonical-verbatim de v4.
**Status:** SUPERSEDED por standalone nuevo `somnio-v4-rag-generative`.
**Last HEAD del plan:** `8541d63` (Iter 7i — quita category param de kb_search).

## Por qué se cierra

En la sesión 2026-05-15/16 el usuario decidió reemplazar el approach canonical-verbatim (texto enlatado del KB enviado verbatim al cliente) por un approach RAG-generativo (KB pasa a ser material fuente y Gemini Flash redacta respuestas adaptadas a la pregunta específica).

La razón fundamental: el approach canonical es brittle. Dos clientes preguntando lo mismo con phrasings distintos reciben EXACTAMENTE el mismo texto enlatado. El sub-loop tiene un LLM razonando pero lo usábamos solo para seleccionar texto pre-escrito, no para generar.

Discusión completa registrada en:
- `08-ARCHITECTURE-DEEPDIVE.md` (de este standalone) — bug chain Iter 7a-7h + cuestionamiento arquitectónico
- `../somnio-v4-rag-generative/DISCUSSION-LOG.md` — 30 D's del nuevo rediseño

## Iters completados antes del cierre (HEAD `8541d63`)

```
7a `dbddb7d` — alcohol calibration (0.92 → 0.30)
7b `89dfe6e` — destructure inside try/catch
7c `b8808c1` — peek subLoopResult for diagnostics
7d `a2afb45` — stopWhen 4→6 + prompt convergence + AI SDK v6 input/output names
7e `f3f7e30..9eb0fb0` — kb_search logging + TS strict h:KbHit fix
7f `7995d5d` — template-fit framing (eliminó ~80 few-shots)
7g `df4d791` — generalización contraindicaciones cardíacos vs no-cardíacos
7h `b0b2fd9` — embed.ts fallback OPENAI_API_KEY_SALESV4 ?? OPENAI_API_KEY
7i `8541d63` — quitar category param de kb_search (Q1 Opción B)
```

## Lecciones que quedaron documentadas

Las 6 lecciones arquitectónicas de `08-ARCHITECTURE-DEEPDIVE.md` siguen vigentes:

1. `intent_confidence` = template-fit, no intent-clarity
2. Pattern matching con few-shots no escala
3. Errors silenciosos son más peligrosos
4. LLM tool descriptions son contratos críticos
5. Sandbox vs Production paths divergen en observability
6. Debug view del sub-loop es prerequisite del debugging confiable

Estas lecciones informan el diseño del nuevo standalone — especialmente #4 (porque eliminamos el footgun de `category` por completo) y #2 (porque el approach RAG sustituye few-shots por scope semántico del KB).

## Plan 08 del standalone hermano — CANCELADO

El "flip productivo" original (Plan 08 de este standalone) se cancela.
El equivalente vive como Plan 08 del nuevo standalone `somnio-v4-rag-generative` y activará v4 con el approach RAG, no con canonical.

## Estado del código tras `8541d63`

El sub-loop low_confidence funciona pero con limitaciones de calidad documentadas en:
- `08-ARCHITECTURE-DEEPDIVE.md` §2 (bug chain)
- `08-ARCHITECTURE-DEEPDIVE.md` §5 (Q1-Q7 abiertas)

v4 sigue DORMANT en producción. v3 atiende clientes sin cambios (Regla 6 intocada).

## Re-entry para el nuevo standalone

```
.planning/standalone/somnio-v4-rag-generative/
├── CONTEXT.md           ← qué/por qué del rediseño
├── DISCUSSION-LOG.md    ← 30 D's locked
├── STATUS.md            ← progreso live
└── (plans + research a producir)
```

Memory pointer: `somnio_v4_rag_generative.md` (creado 2026-05-16).
