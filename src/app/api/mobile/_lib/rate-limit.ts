// Mobile API rate-limit stub.
//
// TODO(phase-43): Replace this no-op with the existing web rate limiter
// once the mobile surface graduates from read-only skeleton to write
// endpoints. The signature is intentionally shaped so the future
// implementation can drop in without changing call sites:
//
//   const rl = await rateLimitMobile(req, `mobile:me:${user.id}`)
//   if (!rl.ok) throw new MobileValidationError('rate_limited')
//
// For now every call returns { ok: true } synchronously-wrapped in a
// Promise so handlers already pay the cost of `await` and the switch
// later is a pure internal change.

export interface RateLimitResult {
  ok: true
}

export async function rateLimitMobile(
  _req: Request,
  _key: string
): Promise<RateLimitResult> {
  return { ok: true }
}
