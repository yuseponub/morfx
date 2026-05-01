import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'

const CheckSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

/**
 * D-51: post-gen check Haiku que valida si `candidateText` viola alguna regla "NUNCA decir".
 * D-50: solo se invoca en outcomes 'canonical' del sub-loop (verbatim del KB).
 * Latencia ~150ms (toma sólo si hay rules; early-return si vacío).
 *
 * Early-return cuando `nuncaDecirRules` está vacío — no consume tokens innecesarios.
 *
 * W-09: las rules vienen ahora de `result.nuncaDecirRules` que el sub-loop copió desde el
 *       hit de `kb_search` (KbHit.nuncaDecirRules), que a su vez vienen del DB column
 *       `nunca_decir` vía RPC `match_knowledge_base`. Cuando el doc tiene la sección
 *       `## NUNCA decir`, las rules están pobladas y este check se ejecuta con datos
 *       reales — vs. la versión inicial donde el parser markdown retornaba [] siempre.
 *
 * Standalone: somnio-sales-v4 / Plan 05 / Task 3.
 */
export async function checkNuncaDecir(args: {
  candidateText: string
  nuncaDecirRules: string[]
}): Promise<{ ok: boolean; violation?: string }> {
  if (args.nuncaDecirRules.length === 0) return { ok: true }

  const { output } = await runWithPurpose('subloop_nunca_decir', () =>
    generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system:
        'You are a content compliance checker. Return whether the candidate text violates any of the given rules.',
      messages: [
        {
          role: 'user',
          content:
            `Candidate response: """${args.candidateText}"""\n\n` +
            `Forbidden rules (NUNCA decir):\n` +
            args.nuncaDecirRules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
            `\n\nReturn { violates: bool, violatedRule?: string }.`,
        },
      ],
      output: Output.object({ schema: CheckSchema }),
    })
  )

  return output.violates
    ? { ok: false, violation: output.violatedRule }
    : { ok: true }
}
