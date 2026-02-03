'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { MessageCircle, ExternalLink, Inbox } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TagBadge } from '@/components/contacts/tag-badge'
import { getContactConversations, type ContactConversationSummary } from '@/app/actions/contacts'

interface WhatsAppSectionProps {
  contactId: string
}

/**
 * WhatsApp conversation summary section for CRM contact detail page.
 * Shows linked conversations with their tags and last message info.
 */
export function WhatsAppSection({ contactId }: WhatsAppSectionProps) {
  const [conversations, setConversations] = useState<ContactConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchConversations() {
      setIsLoading(true)
      try {
        const data = await getContactConversations(contactId)
        setConversations(data)
      } catch (error) {
        console.error('Error fetching conversations:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchConversations()
  }, [contactId])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (conversations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Sin conversaciones de WhatsApp
            </p>
            <Button variant="outline" size="sm" className="mt-3" asChild>
              <Link href="/whatsapp">
                Ir a WhatsApp
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
          {conversations.some(c => c.unread_count > 0) && (
            <Badge variant="default" className="ml-auto">
              {conversations.reduce((sum, c) => sum + c.unread_count, 0)} sin leer
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {conversations.map((conv, index) => (
          <div key={conv.id}>
            {index > 0 && <Separator className="my-3" />}
            <div className="space-y-2">
              {/* Conversation header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{conv.phone}</span>
                  {conv.unread_count > 0 && (
                    <Badge variant="secondary" className="h-5">
                      {conv.unread_count}
                    </Badge>
                  )}
                  {conv.status === 'archived' && (
                    <Badge variant="outline" className="text-xs">
                      Archivado
                    </Badge>
                  )}
                </div>
                <Link
                  href={`/whatsapp?conversation=${conv.id}`}
                  className="text-primary hover:underline text-sm flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver chat
                </Link>
              </div>

              {/* Last message preview */}
              {conv.last_message_preview && (
                <div className="text-sm text-muted-foreground">
                  <span className="line-clamp-1">{conv.last_message_preview}</span>
                  {conv.last_message_at && (
                    <span className="text-xs ml-2">
                      {formatDistanceToNow(new Date(conv.last_message_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </span>
                  )}
                </div>
              )}

              {/* Conversation tags */}
              {conv.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-muted-foreground mr-1">Etiquetas de chat:</span>
                  {conv.tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} size="sm" />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* View all in WhatsApp link */}
        <div className="pt-2">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/whatsapp">
              Ver todas las conversaciones
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
