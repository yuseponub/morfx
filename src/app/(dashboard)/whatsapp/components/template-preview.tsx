'use client'

import { Template } from '@/lib/whatsapp/types'
import { Card, CardContent } from '@/components/ui/card'

interface TemplatePreviewProps {
  template: Template
  variableValues: Record<string, string>
}

/**
 * Template preview component that shows the message with substituted variables.
 * Styled to look like a WhatsApp outgoing message bubble.
 */
export function TemplatePreview({ template, variableValues }: TemplatePreviewProps) {
  const bodyComponent = template.components.find(c => c.type === 'BODY')
  const headerComponent = template.components.find(c => c.type === 'HEADER')
  const footerComponent = template.components.find(c => c.type === 'FOOTER')

  // Replace variables with actual values
  const renderText = (text: string | undefined) => {
    if (!text) return null
    let rendered = text
    Object.entries(variableValues).forEach(([num, value]) => {
      rendered = rendered.replace(new RegExp(`\\{\\{${num}\\}\\}`, 'g'), value || `{{${num}}}`)
    })
    return rendered
  }

  return (
    <Card className="bg-[#dcf8c6] dark:bg-emerald-900/40 max-w-xs ml-auto shadow-sm">
      <CardContent className="p-3">
        {headerComponent?.text && (
          <p className="font-medium text-sm mb-1">
            {renderText(headerComponent.text)}
          </p>
        )}

        {bodyComponent?.text && (
          <p className="text-sm whitespace-pre-wrap">
            {renderText(bodyComponent.text)}
          </p>
        )}

        {footerComponent?.text && (
          <p className="text-xs text-muted-foreground mt-2">
            {renderText(footerComponent.text)}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
