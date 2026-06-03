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
  const detail = e instanceof Error ? e.message : String(e)

  if (e instanceof MetaGraphApiError) {
    // Leftover two-step verification from a previous BSP (err subcode 2388001).
    if (e.errorSubcode === 2388001) {
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
    // WABA has no payment method ("Cannot Migrate Phone Number ... payment method").
    if (/payment method|cannot migrate phone number/i.test(e.message)) {
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
