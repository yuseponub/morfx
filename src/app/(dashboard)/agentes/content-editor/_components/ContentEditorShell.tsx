'use client'

// ============================================================================
// ContentEditorShell — client wrapper holding the selected agent + sub-tab
// state, rendering the AgentSelector and the Templates / Conocimiento panels.
//
// Standalone: ui-agent-content-editor — Plan 06 (Wave 4).
//
// Selected agent is reflected in the URL (?agent=) via history.replaceState
// (project URL-state convention — MEMORY: NOT router.replace, avoids re-render
// churn). Default agent = somnio-sales-v4 (the only editable one — D-02).
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  AgentSelector,
  CONTENT_EDITOR_AGENTS,
  EDITABLE_AGENT_ID,
} from './AgentSelector'
import { TemplatesPanel } from './TemplatesPanel'
import { KnowledgePanel } from './KnowledgePanel'

type SubTab = 'templates' | 'knowledge'

const DEFAULT_AGENT = EDITABLE_AGENT_ID

function readAgentFromUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_AGENT
  const param = new URLSearchParams(window.location.search).get('agent')
  if (param && CONTENT_EDITOR_AGENTS.some((a) => a.id === param)) return param
  return DEFAULT_AGENT
}

export function ContentEditorShell() {
  const [agentId, setAgentId] = useState<string>(DEFAULT_AGENT)
  const [subTab, setSubTab] = useState<SubTab>('templates')

  // Hydrate from URL after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setAgentId(readAgentFromUrl())
  }, [])

  const onChangeAgent = useCallback((next: string) => {
    setAgentId(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('agent', next)
      window.history.replaceState(null, '', url.toString())
    }
  }, [])

  const editable = agentId === EDITABLE_AGENT_ID

  return (
    <div className="flex flex-col gap-6">
      <AgentSelector selectedAgentId={agentId} onChange={onChangeAgent} />

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {(
          [
            { id: 'templates' as const, label: 'Templates' },
            { id: 'knowledge' as const, label: 'Conocimiento' },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              subTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'templates' ? (
        <TemplatesPanel agentId={agentId} editable={editable} />
      ) : (
        <KnowledgePanel agentId={agentId} editable={editable} />
      )}
    </div>
  )
}
