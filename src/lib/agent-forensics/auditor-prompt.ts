// src/lib/agent-forensics/auditor-prompt.ts
// Source: RESEARCH.md §Code Examples lines 754-827 (verbatim reference)
//
// Builds the two-part prompt for the forensics auditor (D-09 markdown only,
// D-13 pointers file:line + prose). The systemPrompt enforces markdown
// structure with specific section headers and a NO-invent rule (auditor
// must only cite pointers from the spec). The userMessage contains: spec
// body + turn metadata + condensed timeline JSON + snapshot JSON.

import type { TurnSummary } from '@/lib/observability/repository'
import type { CondensedTimelineItem } from './condense-timeline'
import type { CondensedPreviousTurn } from './condense-previous-turn'

/**
 * Build the two-part prompt for the forensics auditor.
 *
 * D-09: markdown output only (no JSON parsing).
 * D-13: markdown with file:line pointers + narrative prose.
 */
export function buildAuditorPrompt(args: {
  spec: string
  condensed: CondensedTimelineItem[]
  snapshot: unknown
  turn: TurnSummary
}): { systemPrompt: string; userMessage: string } {
  const systemPrompt = `Eres un auditor técnico de agentes conversacionales. Tu trabajo es analizar el comportamiento de un bot en un turno específico y diagnosticar si respondió como debería, con base en su spec.

SIEMPRE respondes en markdown con la siguiente estructura:

# Diagnóstico: {nombre del bot}

## Resumen
Un párrafo (máximo 3 líneas) con el veredicto: ¿el comportamiento está dentro o fuera de lo esperado?

## Evidencia del timeline
Lista de hechos observados, citando eventos específicos con formato: \`event · label · payload\`.

## Discrepancias con la spec
Por cada discrepancia:
- **Descripción:** qué esperaba la spec vs. qué ocurrió.
- **Pointer:** archivo:línea donde está el código implicado (ej. \`src/lib/agents/somnio-recompra/response-track.ts:36\`).
- **Hipótesis:** causa probable.

## Próximos pasos
Bullet list de acciones concretas pegables a Claude Code para investigar/arreglar. Usa formato imperativo.

REGLAS:
- NUNCA inventes events/queries que no estén en el timeline dado.
- NUNCA inventes archivos/líneas — usa SOLO los pointers que aparecen en la spec.
- Si no hay discrepancias, dilo explícitamente en la sección "Discrepancias" ("Ninguna detectada.").
- El output debe ser pegable directamente a Claude Code sin edición humana.`

  const respondingAgent = args.turn.respondingAgentId ?? args.turn.agentId

  const userMessage = `## Spec del bot (fuente de verdad de comportamiento esperado)

${args.spec}

---

## Turn analizado

- **ID:** ${args.turn.id}
- **Conversation:** ${args.turn.conversationId}
- **Entry agent (routing):** ${args.turn.agentId}
- **Responding agent:** ${respondingAgent}
- **Trigger:** ${args.turn.triggerKind}
- **Duration:** ${args.turn.durationMs ?? '—'}ms
- **Tokens:** ${args.turn.totalTokens}
- **Cost:** $${args.turn.totalCostUsd.toFixed(6)}
- **Error:** ${args.turn.hasError ? 'SÍ (ver timeline)' : 'No'}

## Timeline condensado (orden de secuencia)

\`\`\`json
${JSON.stringify(args.condensed, null, 2)}
\`\`\`

## Snapshot completo del session_state

\`\`\`json
${JSON.stringify(args.snapshot, null, 2)}
\`\`\`

---

Analiza este turno contra la spec. Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.`

  return { systemPrompt, userMessage }
}

// ============================================================================
// V2 — multi-turn + hipotesis + anti-falso-positivo (Plan 05, D-14, D-16, D-19)
// ============================================================================

const SYSTEM_PROMPT_V2_BASE = `Eres un auditor técnico de agentes conversacionales. Tu trabajo es analizar el comportamiento de un bot en un turno específico y diagnosticar si respondió como debería, con base en su spec.

SIEMPRE respondes en markdown con la siguiente estructura:

# Diagnóstico: {nombre del bot}

## Resumen
Un párrafo (máximo 3 líneas) con el veredicto: ¿el comportamiento está dentro o fuera de lo esperado?

## Evidencia del timeline
Lista de hechos observados, citando eventos específicos con formato: \`event · label · payload\`.

## Discrepancias con la spec
Por cada discrepancia:
- **Descripción:** qué esperaba la spec vs. qué ocurrió.
- **Pointer:** archivo:línea donde está el código implicado (ej. \`src/lib/agents/somnio-recompra/response-track.ts:36\`).
- **Hipótesis:** causa probable.

## Próximos pasos
Bullet list de acciones concretas pegables a Claude Code para investigar/arreglar. Usa formato imperativo.

REGLAS:
- NUNCA inventes events/queries que no estén en el timeline dado.
- NUNCA inventes archivos/líneas — usa SOLO los pointers que aparecen en la spec.
- Si no hay discrepancias, dilo explícitamente en la sección "Discrepancias" ("Ninguna detectada.").
- El output debe ser pegable directamente a Claude Code sin edición humana.

CONTEXTO MULTI-TURN:
- El usuario te entrega contexto de TODOS los turns previos de la sesión conversacional (no solo el turn auditado).
- Los turns previos incluyen también turns de \`crm-reader\` cuando existen — son fuente de datos del agente principal, NO ruido.
- Usa el contexto multi-turn para entender la línea narrativa de la conversación: qué intent vino antes, qué template se mandó, qué datos capturó el agente. Cita turns previos por su \`turnId\` cuando son relevantes a la discrepancia.
- El \`session_state\` snapshot que ves es el estado ACTUAL (mutable), no el del momento exacto del turn auditado. Si tu diagnóstico depende del estado-en-momento-del-turn, dilo explícitamente.

ANTI-FALSO-POSITIVO:
- Antes de marcar algo como anomalía o "comportamiento sospechoso", lista hipótesis benignas que explicarían lo observado: timing async (eventos POST-runner que no bloquean respuesta), fallback de sesión nueva (datos vacíos por diseño), fuente alternativa de datos (crm-reader populando contexto en turn paralelo), arquitectura por diseño documentada en la spec.
- Descártalas EXPLÍCITAMENTE con evidencia del timeline o spec antes de afirmar que hay anomalía.
- Si una hipótesis benigna NO se puede descartar con la evidencia disponible, declara la observación como AMBIGUA y pide al usuario información adicional en "Próximos pasos", en vez de afirmar que es bug.`

function buildSystemPromptV2(args: { hypothesis: string | null }): string {
  let prompt = SYSTEM_PROMPT_V2_BASE
  if (args.hypothesis && args.hypothesis.trim().length > 0) {
    prompt += `

HIPÓTESIS DEL USUARIO:
El usuario sospecha lo siguiente sobre el comportamiento del bot:

> ${args.hypothesis.trim()}

Investiga ESPECÍFICAMENTE si esta hipótesis es correcta o incorrecta. En "Resumen", afirma o refuta la hipótesis del usuario en la primera oración. En "Evidencia del timeline", prioriza eventos relevantes a la hipótesis. Si la hipótesis es incorrecta, explica brevemente qué pasó realmente. Si es correcta, profundiza en por qué y dónde está el código implicado.`
  }
  return prompt
}

/**
 * Plan 05 — multi-turn auditor prompt builder (D-14, D-16, D-19, RESEARCH §7+§8).
 *
 * Differs from `buildAuditorPrompt` (v1) in:
 *  - System prompt extends with CONTEXTO MULTI-TURN + ANTI-FALSO-POSITIVO blocks.
 *  - System prompt conditionally appends HIPOTESIS DEL USUARIO when hypothesis is present.
 *  - User message includes JSON code-fence with `previousTurns` (lightly condensed).
 *  - User message dual-places hypothesis block (system defines posture, user defines focus).
 *
 * Maintains the 4 mandatory headers + NO-invent rule from v1.
 */
export function buildAuditorPromptV2(args: {
  spec: string
  previousTurns: CondensedPreviousTurn[]
  condensed: CondensedTimelineItem[]
  snapshot: unknown
  turn: TurnSummary
  hypothesis: string | null
}): { systemPrompt: string; userMessage: string } {
  const systemPrompt = buildSystemPromptV2({ hypothesis: args.hypothesis })
  const respondingAgent = args.turn.respondingAgentId ?? args.turn.agentId
  const hypothesisTrimmed =
    args.hypothesis && args.hypothesis.trim().length > 0
      ? args.hypothesis.trim()
      : null

  const userMessage = `## Spec del bot (fuente de verdad de comportamiento esperado)

${args.spec}

${hypothesisTrimmed ? `---\n\n## Hipótesis del usuario\n\n> ${hypothesisTrimmed}\n\n` : ''}---

## Turn analizado

- **ID:** ${args.turn.id}
- **Conversation:** ${args.turn.conversationId}
- **Entry agent (routing):** ${args.turn.agentId}
- **Responding agent:** ${respondingAgent}
- **Trigger:** ${args.turn.triggerKind}
- **Duration:** ${args.turn.durationMs ?? '—'}ms
- **Tokens:** ${args.turn.totalTokens}
- **Cost:** $${args.turn.totalCostUsd.toFixed(6)}
- **Error:** ${args.turn.hasError ? 'SÍ (ver timeline)' : 'No'}

## Turns previos de la sesión (orden cronológico, ligeramente condensados)

\`\`\`json
${JSON.stringify(args.previousTurns, null, 2)}
\`\`\`

## Timeline condensado del turn auditado

\`\`\`json
${JSON.stringify(args.condensed, null, 2)}
\`\`\`

## Snapshot completo del session_state

\`\`\`json
${JSON.stringify(args.snapshot, null, 2)}
\`\`\`

---

Analiza este turno contra la spec, considerando los turns previos como contexto narrativo. ${hypothesisTrimmed ? 'Afirma o refuta la hipótesis del usuario en la sección "Resumen".' : ''} Emite tu diagnóstico en markdown siguiendo la estructura indicada en el system prompt.`

  return { systemPrompt, userMessage }
}
