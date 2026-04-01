// ============================================================================
// Meta Token Encryption (AES-256-GCM)
// Encrypt access tokens before storing in DB, decrypt on read.
// Format: base64(iv || authTag || ciphertext) — single TEXT column
// ============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits — NIST recommended for GCM
const AUTH_TAG_LENGTH = 16 // 128 bits

// ----------------------------------------------------------------------------
// Key management
// ----------------------------------------------------------------------------

function getEncryptionKey(): Buffer {
  const key = process.env.META_TOKEN_ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'META_TOKEN_ENCRYPTION_KEY is not set. Generate with: openssl rand -base64 32'
    )
  }
  const decoded = Buffer.from(key, 'base64')
  if (decoded.length !== 32) {
    throw new Error(
      `META_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${decoded.length}). Generate with: openssl rand -base64 32`
    )
  }
  return decoded
}

// ----------------------------------------------------------------------------
// Encrypt / Decrypt
// ----------------------------------------------------------------------------

/**
 * Encrypt an access token for storage.
 * Each call uses a unique random IV — never deterministic.
 *
 * @param token - Plaintext access token
 * @returns Base64-encoded packed string: iv (12) + authTag (16) + ciphertext
 */
export function encryptToken(token: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  // Pack: iv (12 bytes) + authTag (16 bytes) + ciphertext (variable)
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

/**
 * Decrypt an access token from storage.
 * Verifies auth tag to detect tampering.
 *
 * @param packed - Base64-encoded packed string from encryptToken
 * @returns Plaintext access token
 * @throws Error if auth tag verification fails (tampered data)
 */
export function decryptToken(packed: string): string {
  const key = getEncryptionKey()
  const data = Buffer.from(packed, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8'
  )
}
