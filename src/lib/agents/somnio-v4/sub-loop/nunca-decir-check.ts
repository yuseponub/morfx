import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'

const CheckSchema = z.object({
  violates: z.boolean(),
  violatedRule: z.string().optional(),
})

/**
 * D-51: post-gen check Gemini Flash que valida si `candidateText` viola alguna regla "NUNCA decir".
 * D-30 (Plan 05): migrado de Haiku 4.5 a Gemini Flash-Lite — schema simple sin tools,
 *   Gemini ~4x más barato y CheckSchema 2/2 match en RESEARCH §CheckSchema results.
 * D-50: solo se invoca en outcomes 'canonical' del sub-loop (verbatim del KB).
 * Latencia ~150ms-500ms (toma sólo si hay rules; early-return si vacío).
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
 *
 * D-09 UNLOCKED 2026-05-18 (Plan 07b): model upgrade Flash-Lite → Flash NORMAL +
 * polarity rules en system prompt. Razón: musical chairs evidence post-Plan 07 v1
 * (ver `.planning/standalone/somnio-v4-rag-generative/SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md`).
 * Costo delta ~$6/mes en prod (Jose aceptó budget). Unlock documentado como D-31 en
 * `.planning/standalone/somnio-v4-rag-generative/DISCUSSION-LOG.md`.
 */
export async function checkNuncaDecir(args: {
  candidateText: string
  nuncaDecirRules: string[]
}): Promise<{ ok: boolean; violation?: string }> {
  if (args.nuncaDecirRules.length === 0) return { ok: true }

  const { output } = await runWithPurpose('subloop_nunca_decir', () =>
    generateText({
      model: google('gemini-2.5-flash'),
      system: [
        'You are a content compliance checker for a customer-service response.',
        '',
        'Each forbidden rule is a DECLARATIVE AFFIRMATIVE PROPOSITION that the response',
        'might or might not assert. Your job: decide whether the candidate response',
        'AFFIRMS any of the forbidden propositions.',
        '',
        'POLARITY RULES — apply strictly:',
        '',
        '1. AFFIRMS — Response asserts the forbidden proposition as true.',
        '   → violates = true, violatedRule = <rule that was affirmed>.',
        '',
        '2. NEGATES — Response explicitly says the proposition is FALSE, or denies it,',
        '   or recommends NOT doing what the proposition affirms.',
        '   → violates = false (the response is doing the OPPOSITE of the forbidden act).',
        '',
        '3. REDIRECTS — Response acknowledges the topic but redirects to a professional,',
        '   to a human handoff, or says "consult your doctor" without affirming.',
        '   → violates = false (no assertion of the forbidden proposition).',
        '',
        '4. NEUTRAL — Response does not touch the topic of the rule at all, or is empty',
        '   (silent handoff). Empty/null responses NEVER violate anything.',
        '   → violates = false.',
        '',
        'EXAMPLE — negation that should NOT violate:',
        '  Rule: "El producto es seguro durante el embarazo."',
        '  Response: "No recomendamos el uso durante el embarazo, consultá con tu ginecólogo."',
        '  → violates = false (response NEGATES the rule, not affirms).',
        '',
        'Only mark violates=true when the response EXPLICITLY AFFIRMS the forbidden proposition.',
        'When in doubt, prefer violates=false — false-positives break customer trust.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content:
            `Candidate response: """${args.candidateText}"""\n\n` +
            `Forbidden rules (NUNCA decir — each is a proposition the response might affirm):\n` +
            args.nuncaDecirRules.map((r, i) => `${i + 1}. ${r}`).join('\n') +
            `\n\nApply POLARITY RULES from the system prompt. ` +
            `Mark violates=true ONLY if the response AFFIRMS one of the rules.\n\n` +
            `Return { violates: bool, violatedRule?: string }.`,
        },
      ],
      output: Output.object({ schema: CheckSchema }),
      // Standalone: somnio-sales-v4-runtime-wiring / Plan 07 debug.
      // Disable safety filters — Somnio CORE business incluye medication
      // content (dependencia, contraindicaciones, dosis). El check de NUNCA
      // decir analiza texto canonical del KB que puede mencionar substancias
      // por contexto educativo. Gap descubierto en Smoke A iter 1.
      providerOptions: {
        google: {
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        },
      },
    })
  )

  return output.violates
    ? { ok: false, violation: output.violatedRule }
    : { ok: true }
}
