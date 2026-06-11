import { generateText, Output } from 'ai'
import { google } from '@ai-sdk/google'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { runWithPurpose } from '@/lib/observability'
import { callWithGeminiFallback } from '../llm-fallback'

/**
 * Compliance check post-generación — Gemini Flash NORMAL.
 *
 * Single call que evalúa DOS dimensiones independientes sobre la respuesta generada:
 *
 *   1. NUNCA-decir (text-vs-forbidden-proposition):
 *      ¿La respuesta AFIRMA alguna proposición prohibida del catálogo nunca_decir
 *      del KB ganador? Polarity-aware (AFFIRMS / NEGATES / REDIRECTS / NEUTRAL).
 *
 *   2. Escalation (case-vs-escalation-trigger):
 *      ¿El caso del cliente matchea algún trigger de cuando_escalar del KB ganador
 *      (literal o por analogía obvia)? Catch tambien "respuesta fluida engañosa"
 *      cuando la respuesta deriva al médico en texto pero el caso requiere handoff
 *      humano real (escalation evasion).
 *
 * Las 2 dimensiones se evalúan en una sola call para eliminar el sesgo de
 * auto-evaluación del generation-call (Gemini Flash que compone NO debe ser el
 * que decide si su respuesta cumple — el verifier es un modelo independiente
 * single-purpose).
 *
 * Predecesor: `checkNuncaDecir` (renombrado y expandido 2026-05-22). Patrón
 * idéntico — misma latencia (~150-500ms), mismo costo (~$0.0001), un solo call.
 *
 * D-30 (Plan 05): Gemini Flash NORMAL post-D-09 UNLOCK 2026-05-18 (Plan 07b);
 * razón polarity rules + musical chairs evidence (SMOKE-A-V2-MUSICAL-CHAIRS-EVIDENCE.md).
 */

export const ComplianceCheckSchema = z.object({
  violatesNuncaDecir: z.boolean()
    .describe('true si la respuesta AFIRMA alguna nuncaDecirRule (POLARITY: AFFIRMS).'),
  violatedRule: z.string().optional()
    .describe('Texto literal de la regla nunca-decir afirmada — observability.'),
  shouldEscalate: z.boolean()
    .describe('true si el caso matchea cualquier cuandoEscalar trigger O si la respuesta evade escalación con derivación fluida.'),
  matchedTrigger: z.string().optional()
    .describe('Texto literal del cuandoEscalar item matcheado — observability.'),
})

export type ComplianceCheckOutput = z.infer<typeof ComplianceCheckSchema>

export interface ComplianceCheckResult {
  /** ok=true cuando AMBAS dimensiones pasan. ok=false cuando cualquiera falla. */
  ok: boolean
  /** Solo presente cuando violatesNuncaDecir=true. */
  nuncaDecirViolation?: string
  /** Solo presente cuando shouldEscalate=true. */
  escalationTrigger?: string
  /** Raw output del verifier — para debug payload (subloop-tab.tsx). */
  raw: ComplianceCheckOutput
  /** performance.now() delta — solo cuando se invocó el LLM (no early-return). */
  latencyMs?: number
}

/**
 * Compliance check sobre el texto generado por generation-call.
 *
 * Early-return cuando AMBOS arrays están vacíos — no consume tokens innecesarios.
 *
 * Decisiones independientes: que una dimensión sea true no afecta a la otra
 * (schema con fields planos previene contaminación cruzada).
 */
export async function checkCompliance(args: {
  userMessage: string
  candidateText: string
  nuncaDecirRules: string[]
  cuandoEscalar: string[]
}): Promise<ComplianceCheckResult> {
  if (args.nuncaDecirRules.length === 0 && args.cuandoEscalar.length === 0) {
    return {
      ok: true,
      raw: { violatesNuncaDecir: false, shouldEscalate: false },
    }
  }

  const t0 = performance.now()
  const nuncaDecirBlock = args.nuncaDecirRules.length === 0
    ? '(sin reglas — saltá esta dimensión y emití violatesNuncaDecir=false)'
    : args.nuncaDecirRules.map((r, i) => `${i + 1}. ${r}`).join('\n')

  const cuandoEscalarBlock = args.cuandoEscalar.length === 0
    ? '(sin triggers — saltá esta dimensión y emití shouldEscalate=false)'
    : args.cuandoEscalar.map((r, i) => `${i + 1}. ${r}`).join('\n')

  // D-09: system prompt + user message factorizados → IDÉNTICOS en ambos branches
  // (gemini/anthropic). Evita duplicar las ~150 líneas y garantiza paridad.
  const systemPrompt = [
        'You are an independent compliance checker for a customer-service response.',
        'You did NOT compose the response — you only evaluate it. Two INDEPENDENT dimensions:',
        '',
        '═══════════════════════════════════════════════════════════════════════',
        'DIMENSION 1 — NUNCA-decir (text-vs-forbidden-proposition)',
        '═══════════════════════════════════════════════════════════════════════',
        '',
        'Each forbidden rule is a DECLARATIVE AFFIRMATIVE PROPOSITION that the response',
        'might or might not assert. Decide whether the candidate response AFFIRMS any',
        'of the forbidden propositions.',
        '',
        'POLARITY RULES — apply strictly:',
        '',
        '1. AFFIRMS — Response asserts the forbidden proposition as true.',
        '   → violatesNuncaDecir = true, violatedRule = <rule that was affirmed>.',
        '',
        '2. NEGATES — Response explicitly says the proposition is FALSE, or denies it,',
        '   or recommends NOT doing what the proposition affirms.',
        '   → violatesNuncaDecir = false (response does the OPPOSITE).',
        '',
        '3. REDIRECTS — Response acknowledges the topic but redirects to a professional,',
        '   to a human handoff, or says "consult your doctor" without affirming.',
        '   → violatesNuncaDecir = false (no assertion).',
        '',
        '4. NEUTRAL — Response does not touch the topic of the rule at all, or is empty',
        '   (silent handoff). Empty/null responses NEVER violate.',
        '   → violatesNuncaDecir = false.',
        '',
        'EXAMPLE — negation that should NOT violate:',
        '  Rule: "El producto es seguro durante el embarazo."',
        '  Response: "No recomendamos el uso durante el embarazo, consultá con tu ginecólogo."',
        '  → violatesNuncaDecir = false (NEGATES the rule).',
        '',
        'Mark violatesNuncaDecir=true ONLY when the response EXPLICITLY AFFIRMS one rule.',
        'When in doubt, prefer false — false-positives break customer trust.',
        '',
        '═══════════════════════════════════════════════════════════════════════',
        'DIMENSION 2 — Escalation (case-vs-escalation-trigger)',
        '═══════════════════════════════════════════════════════════════════════',
        '',
        'Each escalation trigger describes a SITUATION that requires human handoff,',
        'not a bot response. Decide if the user\'s case matches ANY trigger.',
        '',
        'TWO sub-checks (either one true → shouldEscalate=true):',
        '',
        'A) DIRECT MATCH on userMessage — Does the user\'s message match any trigger,',
        '   literally OR by obvious analogy?',
        '   Examples of obvious analogies:',
        '     - "tomo 5 medicamentos al día" matches "polifarmacia (varios recetados activos)"',
        '     - "tengo lupus + warfarina + igual lo quiero" matches "insiste sin acompañamiento médico"',
        '     - "es para mi hija de 11 años" matches "menor de 14 años"',
        '     - "tomé el producto y me dio náusea fuerte" matches "reporta efecto adverso"',
        '',
        'B) ESCALATION EVASION on candidateText — Does the response derive fluently to',
        '   "consult your doctor" / "validate with médico tratante" WHEN the case actually',
        '   requires human handoff (i.e., the case matches a trigger and the bot should',
        '   have stayed silent or handed off, not composed a derivative response)?',
        '',
        '   Why: a fluent "derive to doctor" response with high confidence looks correct but',
        '   prevents the system\'s confidence-threshold gate from escalating. The client ends',
        '   up reading a derivative message instead of being attended by a human.',
        '',
        '   Example:',
        '     Trigger: "cliente con anticoagulantes insiste sin acompañamiento médico"',
        '     Case: "tomo warfarina hace 5 años pero igual lo quiero"',
        '     Response: "Lo mejor es que valides con tu médico tratante antes de combinarlos."',
        '     → shouldEscalate=true (evasion: case matches trigger and response derives fluently).',
        '',
        '   Counter-example (legitimate derivation):',
        '     Trigger: "cliente con medicamento recetado insiste en comprar sin consulta médica"',
        '     Case: "tomo levotiroxina, puedo tomarlo?"',
        '     Response: "Por la levotiroxina, validá con tu médico antes de combinarlo."',
        '     → shouldEscalate=false (case is a QUESTION about a medication, not insistence).',
        '',
        'Mark shouldEscalate=true ONLY when A or B is met.',
        'When in doubt, prefer false — over-escalation breaks the agent\'s usefulness.',
        '',
        '═══════════════════════════════════════════════════════════════════════',
        'INDEPENDENCE',
        '═══════════════════════════════════════════════════════════════════════',
        '',
        'The two dimensions are INDEPENDENT. One being true does not affect the other.',
        'Emit both fields based on their own criteria. A response can:',
        ' - Pass both (ok response).',
        ' - Fail nunca-decir only (says something forbidden but case is normal).',
        ' - Fail escalation only (derives politely but case needs human).',
        ' - Fail both (rare but possible).',
      ].join('\n')

  const userMessages = [
    {
      role: 'user' as const,
      content:
        `USER MESSAGE (original):\n"""${args.userMessage}"""\n\n` +
        `CANDIDATE RESPONSE (generated by another model):\n"""${args.candidateText}"""\n\n` +
        `[DIMENSION 1] Forbidden rules (NUNCA decir):\n${nuncaDecirBlock}\n\n` +
        `[DIMENSION 2] Escalation triggers (cuandoEscalar):\n${cuandoEscalarBlock}\n\n` +
        `Evaluate BOTH dimensions independently. Apply POLARITY RULES to D1 and ` +
        `DIRECT MATCH + EVASION sub-checks to D2.\n\n` +
        `Return { violatesNuncaDecir, violatedRule?, shouldEscalate, matchedTrigger? }.`,
    },
  ]

  // D-01/D-05/D-06: intenta Gemini (maxRetries:0 + AbortSignal.timeout) y cae a Haiku 4.5
  // ante saturación. Ambos branches usan el MISMO system + messages + schema (D-09) → el
  // shape de salida es idéntico. Pitfall #7: el branch anthropic NO lleva providerOptions.google.
  const rawResult = await callWithGeminiFallback({
    callSite: 'compliance',
    gemini: (signal) =>
      runWithPurpose('subloop_compliance', () =>
        generateText({
          model: google('gemini-2.5-flash'),
          maxRetries: 0,        // D-05
          abortSignal: signal,  // D-06
          system: systemPrompt,
          messages: userMessages,
          output: Output.object({ schema: ComplianceCheckSchema }),
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
        }),
      ),
    anthropic: (signal) =>
      runWithPurpose('subloop_compliance', () =>
        generateText({
          model: anthropic('claude-haiku-4-5'),  // D-02 — via @ai-sdk/anthropic, NO claude-client.ts
          maxRetries: 0,        // M-01 — N=1 también en el último recurso
          abortSignal: signal,  // M-01 — timeout guard fresco del helper
          system: systemPrompt,                   // MISMO prompt — paridad D-09
          messages: userMessages,                 // MISMO user message — paridad D-09
          output: Output.object({ schema: ComplianceCheckSchema }),
          // SIN providerOptions.google — Pitfall #7
        }),
      ),
  })
  const output = rawResult.output

  const ok = !output.violatesNuncaDecir && !output.shouldEscalate
  return {
    ok,
    nuncaDecirViolation: output.violatesNuncaDecir ? output.violatedRule : undefined,
    escalationTrigger: output.shouldEscalate ? output.matchedTrigger : undefined,
    raw: output,
    latencyMs: performance.now() - t0,
  }
}
