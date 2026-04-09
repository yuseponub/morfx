// Mobile API error types and response mapper.
//
// Every route under src/app/api/mobile/* should wrap its handler body
// in a try/catch and funnel thrown errors through `toMobileErrorResponse`.
// This keeps the wire format uniform ({ error: string }) and hides
// internal error details from the mobile client.

import { NextResponse } from 'next/server'

export class MobileAuthError extends Error {
  readonly status = 401
  readonly code: string
  constructor(code: string = 'unauthorized', message?: string) {
    super(message ?? code)
    this.name = 'MobileAuthError'
    this.code = code
  }
}

export class MobileValidationError extends Error {
  readonly status = 400
  readonly code: string
  constructor(code: string = 'bad_request', message?: string) {
    super(message ?? code)
    this.name = 'MobileValidationError'
    this.code = code
  }
}

export class MobileNotFoundError extends Error {
  readonly status = 404
  readonly code: string
  constructor(code: string = 'not_found', message?: string) {
    super(message ?? code)
    this.name = 'MobileNotFoundError'
    this.code = code
  }
}

type KnownMobileError =
  | MobileAuthError
  | MobileValidationError
  | MobileNotFoundError

function isKnownMobileError(err: unknown): err is KnownMobileError {
  return (
    err instanceof MobileAuthError ||
    err instanceof MobileValidationError ||
    err instanceof MobileNotFoundError
  )
}

/**
 * Map any thrown value into a JSON NextResponse.
 *
 * - Known mobile errors -> their declared status + { error: code }
 * - Anything else -> 500 + { error: 'internal' } (details logged server-side only)
 */
export function toMobileErrorResponse(err: unknown): NextResponse {
  if (isKnownMobileError(err)) {
    return NextResponse.json(
      { error: err.code },
      {
        status: err.status,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }

  // Unknown error — log server-side, never leak to client.
  console.error('[mobile-api] unhandled error', err)
  return NextResponse.json(
    { error: 'internal' },
    {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
