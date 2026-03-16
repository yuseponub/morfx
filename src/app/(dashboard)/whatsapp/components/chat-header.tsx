'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Bot, CalendarCheck, Check, ExternalLink, Loader2, PanelRightOpen, Pencil, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
import { toggleConversationAgent, getConversationAgentStatus } from '@/app/actions/agent-config'
import { confirmAppointment, getAppointmentForContact } from '@/app/actions/godentist'
import { toast } from 'sonner'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

const GODENTIST_WORKSPACE_ID = '36a74890-aad6-4804-838c-57904b1c9328'

interface ChatHeaderProps {
  conversation: ConversationWithDetails
  onTogglePanel: () => void
  onOpenAgentConfig?: () => void
}

/**
 * Chat header with contact name, window indicator, tags, agent toggles, and actions.
 * Actions: Mark as read, Archive, Open in CRM, Edit name.
 */
export function ChatHeader({ conversation, onTogglePanel, onOpenAgentConfig }: ChatHeaderProps) {
  const router = useRouter()
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [localAssignee, setLocalAssignee] = useState<{ id: string; name: string } | null>(
    conversation.assigned_to
      ? { id: conversation.assigned_to, name: conversation.assigned_name || 'Agente' }
      : null
  )

  // Agent toggle states (null = loading, boolean = resolved)
  const [agentConversational, setAgentConversational] = useState<boolean | null>(null)
  const [agentCrm, setAgentCrm] = useState<boolean | null>(null)

  // GoDentist appointment confirmation
  const [appointmentInfo, setAppointmentInfo] = useState<{
    nombre: string; hora: string; sucursal: string; estado: string; scraped_date: string
  } | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [appointmentLoading, setAppointmentLoading] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  // Load agent status when conversation changes
  useEffect(() => {
    let cancelled = false
    setAgentConversational(null)
    setAgentCrm(null)

    getConversationAgentStatus(conversation.id).then((result) => {
      if (cancelled) return
      if ('success' in result) {
        setAgentConversational(result.data.conversationalEnabled)
        setAgentCrm(result.data.crmEnabled)
      }
    })

    return () => { cancelled = true }
  }, [conversation.id])

  // Load GoDentist appointment info
  useEffect(() => {
    if (conversation.workspace_id !== GODENTIST_WORKSPACE_ID) return
    const phone = conversation.contact?.phone || conversation.phone
    if (!phone) return
    setAppointmentLoading(true)
    setAppointmentInfo(null)
    getAppointmentForContact(phone).then(result => {
      if ('data' in result && result.data) setAppointmentInfo(result.data)
      else setAppointmentInfo(null)
      setAppointmentLoading(false)
    })
  }, [conversation.id, conversation.workspace_id])

  // Toggle agent with optimistic update + error rollback
  const handleToggleAgent = async (type: 'conversational' | 'crm', newValue: boolean) => {
    const prev = type === 'conversational' ? agentConversational : agentCrm
    const setter = type === 'conversational' ? setAgentConversational : setAgentCrm

    // Optimistic update
    setter(newValue)

    const result = await toggleConversationAgent(conversation.id, type, newValue)
    if ('error' in result) {
      // Rollback
      setter(prev)
      toast.error(result.error)
    }
  }

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

  const handleConfirmAppointment = () => {
    const phone = conversation.contact?.phone || conversation.phone
    const name = conversation.contact?.name || conversation.profile_name || ''
    if (!phone || !name) return
    setShowConfirmDialog(false)
    setIsConfirming(true)
    setAppointmentInfo(prev => prev ? { ...prev, estado: 'Confirmada' } : null)

    const patientName = appointmentInfo?.nombre || name
    confirmAppointment(phone, name)
      .then(result => {
        if (result.success) {
          toast.success(`Cita de ${patientName} confirmada en el portal`)
        } else {
          toast.error(result.error || 'Error al confirmar cita')
        }
      })
      .catch(() => {
        toast.error(`Error al confirmar cita de ${patientName}`)
      })
      .finally(() => {
        setIsConfirming(false)
      })
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
            <div className="flex items-center gap-1.5">
              {(conversation.contact || conversation.profile_name) && (
                <p className="text-xs text-muted-foreground truncate">
                  {conversation.phone}
                </p>
              )}
              {conversation.channel === 'facebook' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium flex-shrink-0">FB</span>
              )}
              {conversation.channel === 'instagram' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-700 font-medium flex-shrink-0">IG</span>
              )}
            </div>
          </div>

          {/* Tag management - inline in header */}
          <div className="flex items-center gap-2 ml-2">
            <ConversationTagInput
              conversationId={conversation.id}
              contactId={conversation.contact_id}
              currentTags={conversation.tags || []}
              onTagsChange={handleTagsChange}
              compact
            />
          </div>
        </div>

        {/* Agent toggles + Actions */}
        <div className="flex items-center gap-1">
          {/* Agent toggles */}
          {agentConversational !== null && (
            <div className="flex items-center gap-2 pr-2 border-r mr-1">
              {/* Conversational agent toggle */}
              <div className="flex items-center gap-1" title="Agente conversacional">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                <Switch
                  size="sm"
                  checked={agentConversational}
                  onCheckedChange={(v) => handleToggleAgent('conversational', v)}
                />
              </div>
              {/* CRM agent toggle */}
              <div className="flex items-center gap-1" title="Agentes CRM">
                <span className="text-[10px] font-medium text-muted-foreground">CRM</span>
                <Switch
                  size="sm"
                  checked={agentCrm ?? false}
                  onCheckedChange={(v) => handleToggleAgent('crm', v)}
                />
              </div>
            </div>
          )}

          {/* GoDentist: Confirm appointment button */}
          {conversation.workspace_id === GODENTIST_WORKSPACE_ID && !appointmentLoading && appointmentInfo && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={isConfirming || appointmentInfo.estado.toLowerCase().includes('confirmada')}
              onClick={() => setShowConfirmDialog(true)}
              title={`Confirmar cita: ${appointmentInfo.nombre} - ${appointmentInfo.hora} - ${appointmentInfo.sucursal}`}
            >
              {isConfirming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CalendarCheck className="h-3.5 w-3.5" />
              )}
              {isConfirming
                ? 'Confirmando...'
                : appointmentInfo.estado.toLowerCase().includes('confirmada')
                  ? 'Confirmada'
                  : 'Confirmar cita'
              }
            </Button>
          )}

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

          {/* Agent config slider */}
          {onOpenAgentConfig && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onOpenAgentConfig}
              title="Configuracion de agente"
            >
              <SlidersHorizontal className="h-4 w-4" />
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

      {/* Confirm appointment dialog */}
      {appointmentInfo && (
        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirmar cita</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <p className="text-sm">
                ¿Deseas confirmar la cita en el portal de GoDentist?
              </p>
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <p><span className="font-medium">Paciente:</span> {appointmentInfo.nombre}</p>
                <p><span className="font-medium">Hora:</span> {appointmentInfo.hora}</p>
                <p><span className="font-medium">Sucursal:</span> {appointmentInfo.sucursal}</p>
                <p><span className="font-medium">Estado actual:</span> {appointmentInfo.estado}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmAppointment}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
