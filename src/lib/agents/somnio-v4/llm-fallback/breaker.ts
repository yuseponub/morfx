/**
 * Circuit-breaker FSM in-memory module-singleton por callSite (RESEARCH Q4).
 *
 * In-memory, NO Redis (a diferencia de interruption-system-v2): N=1 + maxRetries:0
 * → re-descubrir saturación = 1 fallo rápido por lambda fría. La info es transitoria
 * (30s), no estado de negocio (T-fb-02). Fluid Compute reusa instancias → el breaker
 * persiste entre invocaciones en la misma instancia Vercel.
 */

import type { CallSite } from './config'
import { COOLDOWN_MS } from './config'

export type BreakerState = 'closed' | 'open' | 'half_open'

interface BreakerEntry {
  state: BreakerState
  openedAt: number // Date.now() cuando se abrio
}

// Module singleton — persiste entre invocaciones en la misma instancia Vercel
// (Fluid Compute reusa instancias). Informacion transitoria de 30s, no estado de
// negocio. RESEARCH Q4: in-memory, NO Redis (N=1 + maxRetries:0 → re-descubrir = 1
// fallo rapido por lambda fria).
const breakers = new Map<CallSite, BreakerEntry>()

/** Reset helper OBLIGATORIO para tests — evita leak de estado del module-singleton
 *  entre tests de vitest (Pitfall #3). Llamar en afterEach. */
export function __resetBreakers(): void {
  breakers.clear()
}

/** Devuelve el estado efectivo: 'open' dentro de cooldown salta Gemini; 'open' con
 *  cooldown vencido se promueve a 'half_open' (probe con trafico real, D-08). */
export function effectiveState(callSite: CallSite, now = Date.now()): BreakerState {
  const b = breakers.get(callSite)
  if (!b) return 'closed'
  if (b.state === 'open') {
    if (now - b.openedAt >= COOLDOWN_MS) return 'half_open'
    return 'open'
  }
  return b.state
}

/** Abre/re-abre el circuito (primer fallo o probe fallido). Resetea openedAt. */
export function openBreaker(callSite: CallSite, now = Date.now()): void {
  breakers.set(callSite, { state: 'open', openedAt: now })
}

/** Cierra el circuito (probe OK). */
export function closeBreaker(callSite: CallSite): void {
  breakers.set(callSite, { state: 'closed', openedAt: 0 })
}
