/**
 * Sanitiza paths de redirect controlados por el usuario (C-2 / H-9, AUDIT auth-hardening).
 *
 * Solo acepta paths internos relativos al origen: deben empezar con un único "/"
 * (se rechaza "//host" — protocol-relative — y "/\host", que los browsers
 * normalizan a "//host"). Cualquier URL absoluta, esquema (https:, javascript:)
 * o valor vacío cae al fallback.
 */
const INTERNAL_PATH = /^\/(?![/\\])/

export function safeRedirectPath(
  value: string | null | undefined,
  fallback: string = '/crm'
): string {
  if (!value || !INTERNAL_PATH.test(value)) return fallback
  return value
}
