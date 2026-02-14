'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Chat (placeholder)
// Temporary stub — full implementation in Task 2.
// ============================================================================

interface BuilderChatProps {
  sessionId: string | null
  onSessionCreated: (id: string) => void
}

export function BuilderChat({ sessionId, onSessionCreated }: BuilderChatProps) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      Chat loading...
    </div>
  )
}
