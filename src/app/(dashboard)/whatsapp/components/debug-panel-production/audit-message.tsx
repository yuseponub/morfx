'use client'

/**
 * AuditMessage — sub-componente para AuditorTab v2 (Plan 05).
 *
 * Renderiza un mensaje individual:
 *  - role='user'     → bubble derecha, texto plano (whitespace-pre-wrap).
 *  - role='assistant' → bubble izquierda, ReactMarkdown + remarkGfm + prose styles.
 *
 * Pitfall 4 (Plan 04): react-markdown sin rehype-raw ni dangerouslySetInnerHTML
 * (safe-by-default contra XSS via HTML tags en el output del LLM).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface AuditMessageProps {
  role: 'user' | 'assistant'
  text: string
  isStreaming?: boolean
}

export function AuditMessage({ role, text, isStreaming }: AuditMessageProps) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start mb-3">
      <div
        className={cn(
          'max-w-[95%] rounded-lg bg-muted/50 px-3 py-2',
          'prose prose-sm dark:prose-invert max-w-none',
          isStreaming && 'opacity-90',
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  )
}
