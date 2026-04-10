// ============================================================================
// BOLD Robot HTTP Client
// Calls the Playwright-based robot on Railway to create payment links
// Robot endpoint: POST /api/create-link
// ============================================================================

import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResponse,
  BoldRobotError,
} from './types'

const BOLD_ROBOT_URL = process.env.BOLD_ROBOT_URL

/**
 * Call the BOLD robot on Railway to create a payment link.
 * Timeout: 60s (robot takes ~30s typical, Playwright navigation).
 *
 * @returns The checkout URL on success
 * @throws Error with a user-friendly message on failure
 */
export async function callBoldRobot(
  input: CreatePaymentLinkInput
): Promise<CreatePaymentLinkResponse> {
  if (!BOLD_ROBOT_URL) {
    throw new Error('BOLD_ROBOT_URL no esta configurado en el servidor')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)

  try {
    const res = await fetch(`${BOLD_ROBOT_URL}/api/create-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: input.username,
        password: input.password,
        amount: input.amount,
        description: input.description,
      }),
      signal: controller.signal,
    })

    const data = await res.json()

    if (!res.ok) {
      const err = data as BoldRobotError
      throw new Error(
        err.error || `Robot respondio con status ${res.status}`
      )
    }

    const result = data as CreatePaymentLinkResponse
    if (!result.url) {
      throw new Error('Robot no devolvio URL de pago')
    }

    return result
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'El robot tardo demasiado (>60s). Intenta de nuevo.'
        )
      }
      throw error
    }
    throw new Error('Error desconocido al contactar el robot de BOLD')
  } finally {
    clearTimeout(timeout)
  }
}
