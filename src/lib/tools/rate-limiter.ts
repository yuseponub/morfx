/**
 * Tool Rate Limiter
 * Phase 12: Action DSL Real - Plan 01
 *
 * In-memory sliding window rate limiter for tool executions.
 * Enforces per-workspace per-module limits to prevent agent loops
 * and protect external APIs (360dialog).
 *
 * Key format: {workspaceId}:{module}
 * Default limits:
 *   - CRM: 120 calls / 60 seconds
 *   - WhatsApp: 30 calls / 60 seconds (360dialog has its own limits)
 *   - System: 60 calls / 60 seconds
 */

import type { ToolModule } from './types'

// ============================================================================
// Configuration
// ============================================================================

interface RateLimitConfig {
  /** Maximum number of calls allowed in the window */
  limit: number
  /** Window size in milliseconds */
  windowMs: number
}

const DEFAULTS: Record<ToolModule, RateLimitConfig> = {
  crm: { limit: 120, windowMs: 60_000 },
  whatsapp: { limit: 30, windowMs: 60_000 },
  system: { limit: 60, windowMs: 60_000 },
}

// ============================================================================
// Rate Limiter
// ============================================================================

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean
  /** Remaining requests in the current window */
  remaining: number
  /** Milliseconds until the window resets */
  resetMs: number
}

export class ToolRateLimiter {
  private windows: Map<string, number[]> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Periodic cleanup every 5 minutes to prevent memory leaks
    // Guard for edge runtime compatibility
    if (typeof setInterval !== 'undefined') {
      this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000)
      // Allow Node.js to exit without waiting for the timer
      if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
        this.cleanupTimer.unref()
      }
    }
  }

  /**
   * Check if a request is allowed under the rate limit.
   * If allowed, records the timestamp (consuming a slot).
   *
   * @param workspaceId - The workspace making the request
   * @param module - The tool module ('crm' | 'whatsapp' | 'system')
   * @returns Rate limit check result with allowed, remaining, resetMs
   */
  check(workspaceId: string, module: ToolModule): RateLimitResult {
    const config = DEFAULTS[module] || DEFAULTS.system
    const key = `${workspaceId}:${module}`
    const now = Date.now()

    // Get existing timestamps within the current window
    const timestamps = (this.windows.get(key) || []).filter(
      (t) => now - t < config.windowMs
    )

    if (timestamps.length >= config.limit) {
      // Rate limit exceeded
      const oldest = timestamps[0]
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldest + config.windowMs - now,
      }
    }

    // Request allowed - record timestamp
    timestamps.push(now)
    this.windows.set(key, timestamps)

    return {
      allowed: true,
      remaining: config.limit - timestamps.length,
      resetMs: config.windowMs,
    }
  }

  /**
   * Remove expired entries to prevent memory leaks.
   * Called automatically every 5 minutes.
   */
  private cleanup(): void {
    const now = Date.now()
    // Use the maximum window size for cleanup threshold
    const maxWindow = Math.max(...Object.values(DEFAULTS).map((c) => c.windowMs))

    for (const [key, timestamps] of this.windows) {
      const valid = timestamps.filter((t) => now - t < maxWindow)
      if (valid.length === 0) {
        this.windows.delete(key)
      } else {
        this.windows.set(key, valid)
      }
    }
  }

  /**
   * Dispose the rate limiter (clear the cleanup timer).
   * Call this during graceful shutdown or in tests.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}

/** Singleton rate limiter instance */
export const rateLimiter = new ToolRateLimiter()
