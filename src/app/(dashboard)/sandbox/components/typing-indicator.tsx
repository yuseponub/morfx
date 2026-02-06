'use client'

/**
 * Typing Indicator Component
 * Phase 15: Agent Sandbox
 *
 * Animated "typing..." dots that appear when agent is processing.
 * Uses CSS keyframes for smooth animation without React re-renders.
 */

import './typing-indicator.css'

interface TypingIndicatorProps {
  /** Optional className for positioning */
  className?: string
}

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <div className={`typing-indicator ${className ?? ''}`} role="status" aria-label="Agent is typing">
      <span />
      <span />
      <span />
    </div>
  )
}
