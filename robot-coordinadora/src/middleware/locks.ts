// ============================================================================
// Robot Coordinadora - In-Memory Locking Primitives
// Workspace-level mutex and per-order skip-if-processing locks.
//
// In-memory is acceptable because this is a single-instance service.
// Locks reset on container restart, which is fine -- a restart means
// no batch is actively running.
// ============================================================================

// ---------------------------------------------------------------------------
// Workspace Lock (Mutex)
// Only one batch job per workspace can run at a time.
// ---------------------------------------------------------------------------

const workspaceLocks = new Map<string, Promise<void>>()

/**
 * Execute `fn` while holding an exclusive lock for `workspaceId`.
 * If another batch is already running for this workspace, waits
 * for it to finish before acquiring the lock.
 */
export async function withWorkspaceLock<T>(
  workspaceId: string,
  fn: () => Promise<T>,
): Promise<T> {
  // Wait for any existing lock to complete
  while (workspaceLocks.has(workspaceId)) {
    await workspaceLocks.get(workspaceId)
  }

  let resolve!: () => void
  const lockPromise = new Promise<void>((r) => {
    resolve = r
  })
  workspaceLocks.set(workspaceId, lockPromise)

  try {
    return await fn()
  } finally {
    workspaceLocks.delete(workspaceId)
    resolve()
  }
}

/**
 * Check if a workspace currently has an active batch lock.
 * Used by the endpoint to reject immediately with 409.
 */
export function isWorkspaceLocked(workspaceId: string): boolean {
  return workspaceLocks.has(workspaceId)
}

// ---------------------------------------------------------------------------
// Per-Order Lock (Skip If Processing)
// Orders already being processed are skipped rather than blocking.
// ---------------------------------------------------------------------------

const processingOrders = new Set<string>()

/**
 * Attempt to lock an order for processing.
 * Returns `true` if the lock was acquired (order was not being processed).
 * Returns `false` if the order is already being processed (skip it).
 */
export function tryLockOrder(orderId: string): boolean {
  if (processingOrders.has(orderId)) return false
  processingOrders.add(orderId)
  return true
}

/**
 * Release the lock for an order after processing completes.
 */
export function unlockOrder(orderId: string): void {
  processingOrders.delete(orderId)
}
