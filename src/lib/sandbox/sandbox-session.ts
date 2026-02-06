/**
 * Sandbox Session Persistence
 * Phase 15: Agent Sandbox
 *
 * localStorage utilities for saving/loading sandbox sessions.
 */

import type { SavedSandboxSession } from './types'

const SESSIONS_KEY = 'morfx:sandbox:sessions'
const LAST_AGENT_KEY = 'morfx:sandbox:last-agent'
const MAX_SESSIONS = 20 // Prevent localStorage quota issues

/**
 * Load all saved sandbox sessions from localStorage.
 */
export function loadSandboxSessions(): SavedSandboxSession[] {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(SESSIONS_KEY)
    if (!data) return []
    return JSON.parse(data) as SavedSandboxSession[]
  } catch {
    return []
  }
}

/**
 * Save a sandbox session to localStorage.
 * Prunes old sessions if over MAX_SESSIONS limit.
 */
export function saveSandboxSession(session: SavedSandboxSession): void {
  try {
    const sessions = loadSandboxSessions()

    // Check if updating existing session
    const existingIndex = sessions.findIndex(s => s.id === session.id)
    if (existingIndex >= 0) {
      sessions[existingIndex] = { ...session, updatedAt: new Date().toISOString() }
    } else {
      sessions.unshift(session) // Add to beginning (most recent first)
    }

    // Prune old sessions
    const prunedSessions = sessions.slice(0, MAX_SESSIONS)

    localStorage.setItem(SESSIONS_KEY, JSON.stringify(prunedSessions))
  } catch (error) {
    // localStorage quota exceeded or private browsing
    console.warn('Failed to save sandbox session:', error)
  }
}

/**
 * Delete a sandbox session from localStorage.
 */
export function deleteSandboxSession(sessionId: string): void {
  try {
    const sessions = loadSandboxSessions()
    const filtered = sessions.filter(s => s.id !== sessionId)
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(filtered))
  } catch {
    // Ignore errors
  }
}

/**
 * Get the last used agent ID.
 */
export function getLastAgentId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(LAST_AGENT_KEY)
  } catch {
    return null
  }
}

/**
 * Save the last used agent ID.
 */
export function setLastAgentId(agentId: string): void {
  try {
    localStorage.setItem(LAST_AGENT_KEY, agentId)
  } catch {
    // Ignore errors
  }
}

/**
 * Generate a unique session ID.
 */
export function generateSessionId(): string {
  return `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}
