/**
 * Global singleton store for BOLD payment link generation.
 *
 * Keeps in-flight requests alive even when the React component unmounts
 * (user navigates to another conversation). Results persist in localStorage
 * so they survive page refreshes too.
 *
 * Usage:
 *   boldLinkStore.generate(conversationId, amount, description)  // fire & forget
 *   boldLinkStore.getState(conversationId)                       // read current state
 *   boldLinkStore.clear(conversationId)                          // reset for "crear otro"
 *   window.addEventListener('bold-link-update', handler)         // react to changes
 */

import { createPaymentLinkAction } from '@/app/actions/bold'

// ============================================================================
// Types
// ============================================================================

export type BoldLinkState =
  | { status: 'pending'; amount: number; description: string; imageUrl?: string; startedAt: number }
  | { status: 'completed'; amount: number; description: string; imageUrl?: string; url: string }
  | { status: 'error'; amount: number; description: string; imageUrl?: string; error: string }

// ============================================================================
// Storage helpers
// ============================================================================

const STORAGE_PREFIX = 'bold-link-'

function storageKey(conversationId: string): string {
  return `${STORAGE_PREFIX}${conversationId}`
}

function saveToStorage(conversationId: string, state: BoldLinkState): void {
  try {
    localStorage.setItem(storageKey(conversationId), JSON.stringify(state))
  } catch {
    // localStorage full or unavailable — non-critical
  }
}

function readFromStorage(conversationId: string): BoldLinkState | null {
  try {
    const raw = localStorage.getItem(storageKey(conversationId))
    if (!raw) return null
    return JSON.parse(raw) as BoldLinkState
  } catch {
    return null
  }
}

function removeFromStorage(conversationId: string): void {
  try {
    localStorage.removeItem(storageKey(conversationId))
  } catch {
    // noop
  }
}

// ============================================================================
// In-memory state (survives component unmount, not page refresh)
// ============================================================================

const pendingRequests = new Map<string, Promise<void>>()

// ============================================================================
// Notify listeners
// ============================================================================

function notify(conversationId: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bold-link-update', { detail: { conversationId } })
    )
  }
}

// ============================================================================
// Public API
// ============================================================================

export const boldLinkStore = {
  /**
   * Start generating a payment link. The request runs in a detached promise
   * that survives component unmounts. Results are written to localStorage.
   */
  generate(conversationId: string, amount: number, description: string, imageUrl?: string): void {
    // Don't start duplicate requests
    if (pendingRequests.has(conversationId)) return

    // Fire the request FIRST — register the promise in-memory BEFORE
    // saving to localStorage and notifying, so getState() sees the
    // in-memory promise and doesn't wrongly mark it as "interrupted".
    const promise = createPaymentLinkAction({ amount, description, imageUrl })
      .then((result) => {
        if (result.success && result.url) {
          saveToStorage(conversationId, {
            status: 'completed',
            amount,
            description,
            imageUrl,
            url: result.url,
          })
        } else {
          saveToStorage(conversationId, {
            status: 'error',
            amount,
            description,
            imageUrl,
            error: result.error || 'Error desconocido',
          })
        }
      })
      .catch((err) => {
        saveToStorage(conversationId, {
          status: 'error',
          amount,
          description,
          imageUrl,
          error: err instanceof Error ? err.message : 'Error de red',
        })
      })
      .finally(() => {
        pendingRequests.delete(conversationId)
        notify(conversationId)
      })

    // Register in-memory BEFORE notify so getState() finds it
    pendingRequests.set(conversationId, promise)

    const state: BoldLinkState = {
      status: 'pending',
      amount,
      description,
      imageUrl,
      startedAt: Date.now(),
    }
    saveToStorage(conversationId, state)
    notify(conversationId)
  },

  /**
   * Get the current state for a conversation.
   * Checks in-memory pending map first, then localStorage.
   */
  getState(conversationId: string): BoldLinkState | null {
    const stored = readFromStorage(conversationId)
    if (!stored) return null

    // If stored says 'pending' but there's no in-memory promise,
    // the page was refreshed mid-request — mark as error
    if (stored.status === 'pending' && !pendingRequests.has(conversationId)) {
      const expired: BoldLinkState = {
        status: 'error',
        amount: stored.amount,
        description: stored.description,
        error: 'La generacion se interrumpio. Intenta de nuevo.',
      }
      saveToStorage(conversationId, expired)
      return expired
    }

    return stored
  },

  /**
   * Clear state for a conversation (used for "Crear otro" or dismiss).
   */
  clear(conversationId: string): void {
    pendingRequests.delete(conversationId)
    removeFromStorage(conversationId)
    notify(conversationId)
  },

  /**
   * Check if there's an active request for any conversation.
   */
  hasPending(): boolean {
    return pendingRequests.size > 0
  },
}
