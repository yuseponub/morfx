/**
 * Shared in-memory slot for a pending 2FA/email verification code.
 *
 * When Bold's panel challenges a login from a new IP, it shows a
 * "Ingresa el código que te enviamos" screen. The create-link flow
 * cannot proceed without a human reading the code from SMS/email.
 *
 * This module lets the Playwright flow `await` for the code while the
 * HTTP `/api/submit-code` endpoint resolves that promise from a
 * separate request.
 *
 * Single concurrent login only — good enough for the expected low
 * volume (manual merchant triggers from chat).
 */

let pending = null // { resolve, reject, timer, startedAt }

function startWaiting(timeoutMs = 10 * 60 * 1000) {
  if (pending) {
    return Promise.reject(new Error('Ya hay un login pendiente esperando código'))
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null
      reject(new Error('Timeout esperando código de verificación (10 min)'))
    }, timeoutMs)
    pending = {
      resolve: (code) => {
        clearTimeout(timer)
        pending = null
        resolve(code)
      },
      reject: (err) => {
        clearTimeout(timer)
        pending = null
        reject(err)
      },
      startedAt: Date.now(),
    }
    console.log(`[code-waiter] waiting for code (timeout ${timeoutMs}ms)`)
  })
}

function submitCode(code) {
  if (!pending) {
    throw new Error('No hay login pendiente esperando código')
  }
  console.log('[code-waiter] code received from /api/submit-code')
  pending.resolve(String(code).trim())
}

function cancel(reason = 'cancelled') {
  if (pending) {
    pending.reject(new Error(reason))
  }
}

function status() {
  return {
    pending: pending !== null,
    pendingSince: pending ? new Date(pending.startedAt).toISOString() : null,
    elapsedMs: pending ? Date.now() - pending.startedAt : null,
  }
}

module.exports = { startWaiting, submitCode, cancel, status }
