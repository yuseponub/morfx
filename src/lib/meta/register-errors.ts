// ============================================================================
// Map a Cloud API /register failure to a persisted status + actionable message.
// Pure, server-safe helper (NOT a 'use server' module) so it can be unit-tested
// directly and imported by the onboarding action. (Phase 38 Plan 06.)
// Chain documented in PLAYBOOK-number-activation.md: 2SV → payment → other.
// ============================================================================

import { MetaGraphApiError } from './types'
import type { MetaRegistrationStatus } from '@/lib/domain/meta-accounts'

export interface RegisterErrorMapping {
  status: MetaRegistrationStatus
  /** Actionable Spanish message safe to show the customer. */
  message: string
  /** Raw error detail — server-side only (persisted to registration_error). */
  detail: string
}

export function mapRegisterError(e: unknown): RegisterErrorMapping {
  const baseMsg = e instanceof Error ? e.message : String(e)

  // Meta frequently hides the actionable reason in `error_data.details` behind a
  // generic top-level message like "(#100) Invalid parameter". Discovered live in the
  // Somnio 360dialog→Meta migration (2026-06-11): the missing-payment case surfaced
  // ONLY in error_data.details, so matching e.message alone fell through to the generic
  // bucket and the operator saw "intenta de nuevo" instead of "falta método de pago".
  // Classify against BOTH the message and the details.
  const details = e instanceof MetaGraphApiError ? e.details : undefined
  const detail = details ? `${baseMsg} — ${details}` : baseMsg
  const haystack = `${baseMsg} ${details ?? ''}`

  if (e instanceof MetaGraphApiError) {
    // Leftover two-step verification from a previous BSP — usually subcode 2388001,
    // but Meta may also surface it as a generic (#100) whose details mention two-step.
    if (
      e.errorSubcode === 2388001 ||
      /two-?step|two-?factor|two factor authentication/i.test(haystack)
    ) {
      return {
        status: 'needs_2sv',
        detail,
        message:
          'Tu número tiene verificación en dos pasos de un proveedor anterior. ' +
          'Desactívala en WhatsApp Manager (Configuración del número → Verificación en dos pasos → ' +
          'Desactivar, confirmas por email) y vuelve a conectar. Si no tienes acceso, pídele a tu ' +
          'proveedor anterior que la desactive.',
      }
    }
    // WABA has no payment method. Clear in some flows, but in the migrate flow Meta
    // buries it in error_data.details behind "(#100) Invalid parameter".
    if (/payment method|cannot migrate phone number/i.test(haystack)) {
      return {
        status: 'needs_payment',
        detail,
        message:
          'Tu cuenta de WhatsApp necesita un método de pago. Agrégalo en WhatsApp Manager → ' +
          'Configuración de pagos y vuelve a conectar.',
      }
    }
  }

  return {
    status: 'register_failed',
    detail,
    message: 'No se pudo activar el número en este momento. Intenta conectarlo de nuevo.',
  }
}
