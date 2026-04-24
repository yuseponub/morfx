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
