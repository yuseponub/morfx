/**
 * PII redaction wrapper para mensajes cliente antes de embedding.
 *
 * Reusa los helpers shipped en `crm-mutation-tools/helpers.ts`:
 *   - phoneSuffix: retorna últimos 4 dígitos
 *   - emailRedact: enmascara local-part del email
 *
 * Uso (D-12 / RESEARCH Security):
 *   const safe = redactPii(rawCustomerMessage)
 *   const embedding = await generateEmbedding(safe)
 *   await supabase.from('agent_unknown_cases').insert({ message: safe, embedding, ... })
 *
 * Standalone: somnio-sales-v4 / Plan 09 Task 1.
 */

import {
  phoneSuffix,
  emailRedact,
} from '@/lib/agents/shared/crm-mutation-tools/helpers'

/**
 * Redacta PII (teléfono + email) en un string de mensaje cliente ANTES de embedding.
 *
 * - Phones: secuencias de 7-15 dígitos (con o sin `+` prefix). Se reemplaza por
 *   `phone****<últimos-4-digitos>` usando `phoneSuffix`.
 * - Emails: matching básico `local@domain.tld`. Se reemplaza usando `emailRedact`
 *   (mismo formato `head…@domain` que la observability de mutation-tools).
 *
 * No se detectan documentos de identidad / tarjetas / direcciones — esos pueden
 * curarse en una iteración futura si la observación post-launch lo requiere.
 */
export function redactPii(text: string): string {
  // Phones primero (los emails contienen `@`/`.` y nunca matchearían `\+?[0-9]{7,15}`).
  let out = text.replace(
    /\+?[0-9]{7,15}/g,
    (match) => `phone****${phoneSuffix(match)}`,
  )
  // Emails (RFC 5322-ish, suficiente para PII redaction de mensajes cliente).
  out = out.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    (match) => emailRedact(match),
  )
  return out
}
