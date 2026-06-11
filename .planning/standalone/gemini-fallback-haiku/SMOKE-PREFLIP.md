# Smoke pre-flip LIVE — fallback Gemini→Haiku (2026-06-11)

**Veredicto: PASS** (comprehension + vision, Haiku 4.5 REAL). Cierra el pendiente del Plan 05 y la verificación humana de M-03.

## Método

Scripts `scripts/_smoke-fallback-live.ts` (comprehension) y `scripts/_smoke-fallback-vision.ts` (vision). Parchean `globalThis.fetch` para que SOLO `generativelanguage.googleapis.com` falle con **error de red real** (connection refused → `APICallError` `statusCode=undefined` + `isRetryable=true` — el shape exacto del fix H-01). La llamada Anthropic va REAL con `ANTHROPIC_API_KEY` de `.env.local`. Cero cambios a prod.

> **Anti-método (incidente del mismo día):** key inválida de Google NO sirve como smoke — produce 400 INVALID_ARGUMENT que el módulo propaga A PROPÓSITO (solo hace fallback en saturación/timeout/red). Además `vercel env pull` trae las vars Sensitive VACÍAS — el "backup" antes del rm era inútil (key recuperada de `.env.local`; prod restaurada + redeploy mismo día). Detalle en memoria `vercel_env_gotchas`.

## Evidencia

### Comprehension (run 2, PASS completo)
- Detección error de red: **93ms** → `circuit_opened` + `fallback_triggered` (errorKind `saturation`)
- Llamada 1 vía Haiku: análisis completo parseado con schema saneado (M-04 OK)
- Llamada 2 inmediata: breaker ABIERTO → directo Haiku (`errorKind: circuit_open`), sin tocar Gemini; 3801ms
- **M-03 verificado (era el pendiente humano):** "¿cuánto cuesta?" → `intent_confidence: 0.92` con reasoning template-fit correcto según la calibración restaurada (0.85+ = la respuesta automática cubre)

### Doble fallo D-10 (verificado por accidente, run 1)
Anthropic estaba degradado (529s ese día) → Haiku excedió su budget de 10s → `fallback_failed` emitido con `anthropic_error: 'TimeoutError'` + error propagado al caller. El path de doble fallo funciona en vivo tal como se diseñó.

### Vision (cierra el [ASSUMED] del RESEARCH)
- Detección: 49ms → fallback → **Haiku 4.5 aceptó el image part del AI SDK sin cambios de shape** (provider-agnóstico CONFIRMADO)
- Clasificación correcta de un screenshot (220KB PNG vía data-URL): `categoria: "pagina"`, descripción fiel, `decision: "responder"`; 4634ms

## Lectura operativa

- Budget de 10s (comprehension) puede quedarse corto si Anthropic también está degradado → doble fallo limpio (diseño). Si en producción se observa frecuente, subir `TIMEOUT_MS.comprehension` es un one-liner en `config.ts`.
- Los call-sites generation/compliance comparten el mismo helper + breaker; sus closures difieren solo en prompt/schema (cubiertos por unit tests de paridad). El smoke vivo de comprehension+vision cubre los dos contratos distintos (texto structured-output + image parts).

**Estado: flip RAG desbloqueado por este frente.** Queda solo la decisión de correr `v4-smoke-stability` antes (recomendado, opcional).
