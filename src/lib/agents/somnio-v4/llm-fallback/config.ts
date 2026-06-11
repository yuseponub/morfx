/**
 * Knobs constantes del fallback Gemini → Anthropic (acotado a somnio-v4, D-04).
 *
 * Fuente: CONTEXT.md D-02/D-03/D-06/D-07 + RESEARCH Q3/Q5.
 *
 * LANDMINE CRITICO (Pitfall #10): `src/lib/agents/claude-client.ts:29` mapea
 * `'claude-haiku-4-5'` → Sonnet (comentario stale). El fallback DEBE importar
 * `anthropic` de '@ai-sdk/anthropic' con el literal de abajo — NUNCA via el
 * wrapper legacy `claude-client.ts`, o caería silenciosamente a Sonnet violando
 * la restricción de costo (techo absoluto Haiku 4.5).
 */

export type CallSite = 'generation' | 'compliance' | 'comprehension' | 'vision'

// D-02/D-03 — techo absoluto Haiku 4.5. NUNCA Sonnet/Opus. claude-3-5-haiku RETIRADO
// en la API directa (RESEARCH Q3) → los 4 call-sites caen al MISMO modelo.
// CRITICO: importar `anthropic` de '@ai-sdk/anthropic' con este literal — NUNCA via
// claude-client.ts (linea 29 mapea claude-haiku-4-5 → Sonnet, LANDMINE Pitfall #10).
export const FALLBACK_MODEL = 'claude-haiku-4-5' as const

export const COOLDOWN_MS = 30_000 // D-07 — cooldown tras abrir el circuito

// D-06 — timeout ~2-3x P95 por call-site. Defaults sensatos (v4 DORMANT en prod →
// poca data real; ajustar con observability post-deploy). RESEARCH Q5.
export const TIMEOUT_MS: Record<CallSite, number> = {
  generation: 20_000,
  comprehension: 10_000,
  compliance: 10_000,
  vision: 15_000,
}
