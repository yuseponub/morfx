'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Check, ExternalLink, PanelRightOpen, Pencil } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { WindowIndicator } from './window-indicator'
import { AssignDropdown } from './assign-dropdown'
import { ConversationTagInput } from './conversation-tag-input'
import { markAsRead, archiveConversation, unarchiveConversation, updateProfileName } from '@/app/actions/conversations'
import { toast } from 'sonner'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

interface ChatHeaderProps {
  conversation: ConversationWithDetails
  onTogglePanel: () => void
}

/**
 * Chat header with contact name, window indicator, tags, and actions.
 * Actions: Mark as read, Archive, Open in CRM, Edit name.
 */
export function ChatHeader({ conversation, onTogglePanel }: ChatHeaderProps) {
  const router = useRouter()
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [localAssignee, setLocalAssignee] = useState<{ id: string; name: string } | null>(
    conversation.assigned_to
      ? { id: conversation.assigned_to, name: conversation.assigned_name || 'Agente' }
      : null
  )

  const handleTagsChange = () => {
    router.refresh()
  }

  const displayName = conversation.contact?.name || conversation.profile_name || conversation.phone
  const canEditName = !conversation.contact // Solo editable si no tiene contacto vinculado

  const handleOpenEditName = () => {
    setEditName(conversation.profile_name || '')
    setIsEditingName(true)
  }

  const handleSaveName = async () => {
    setIsSaving(true)
    const result = await updateProfileName(conversation.id, editName.trim() || null)
    setIsSaving(false)

    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Nombre actualizado')
      setIsEditingName(false)
    }
  }

  const handleMarkAsRead = async () => {
    const result = await markAsRead(conversation.id)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Marcado como leido')
    }
  }

  const handleArchive = async () => {
    const result = await archiveConversation(conversation.id)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Conversacion archivada')
    }
  }

  const handleUnarchive = async () => {
    const result = await unarchiveConversation(conversation.id)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Conversacion desarchivada')
    }
  }

  const isArchived = conversation.status === 'archived'

  return (
    <div className="flex-shrink-0 border-b bg-background">
      {/* Main header row */}
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {/* Contact avatar placeholder */}
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-primary">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Contact info */}
          <div className="min-w-0">
            {canEditName ? (
              <button
                onClick={handleOpenEditName}
                className="flex items-center gap-1.5 group hover:text-primary transition-colors"
              >
                <span className="font-medium truncate">{displayName}</span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ) : (
              <p className="font-medium truncate">{displayName}</p>
            )}
            {(conversation.contact || conversation.profile_name) && (
              <p className="text-xs text-muted-foreground truncate">
                {conversation.phone}
              </p>
            )}
          </div>

          {/* Tag management - inline in header */}
          <div className="flex items-center gap-2 ml-2">
            <ConversationTagInput
              conversationId={conversation.id}
              currentTags={conversation.tags || []}
              onTagsChange={handleTagsChange}
              compact
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Assignment dropdown */}
          <AssignDropdown
            conversationId={conversation.id}
            currentAssignee={localAssignee}
            onAssign={setLocalAssignee}
          />

          {/* Mark as read */}
          {!conversation.is_read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleMarkAsRead}
              title="Marcar como leido"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}

          {/* Archive / Unarchive */}
          {isArchived ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleUnarchive}
              title="Desarchivar"
            >
              <ArchiveRestore className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleArchive}
              title="Archivar"
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}

          {/* Open in CRM */}
          {conversation.contact_id && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              asChild
              title="Ver en CRM"
            >
              <Link href={`/crm/contactos/${conversation.contact_id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          )}

          {/* Toggle panel */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onTogglePanel}
            title="Panel de contacto"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Window indicator (only shows when <2h remaining or closed) */}
      <WindowIndicator lastCustomerMessageAt={conversation.last_customer_message_at} />

      {/* Edit name dialog */}
      <Dialog open={isEditingName} onOpenChange={setIsEditingName}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar nombre</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Telefono: {conversation.phone}
              </p>
              <Input
                placeholder="Nombre para esta conversacion"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSaving) {
                    handleSaveName()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingName(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveName} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
