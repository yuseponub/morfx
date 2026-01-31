'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { OrderForm } from '@/app/(dashboard)/crm/pedidos/components/order-form'
import { getPipelines, getOrCreateDefaultPipeline } from '@/app/actions/orders'
import { getActiveProducts } from '@/app/actions/products'
import { getContacts } from '@/app/actions/contacts'
import { linkContactToConversation } from '@/app/actions/conversations'
import type { PipelineWithStages, Product } from '@/lib/orders/types'
import type { ContactWithTags } from '@/lib/types/database'

interface CreateOrderSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultContactId?: string
  /** Pre-fill phone when creating new contact inline */
  defaultPhone?: string
  /** Conversation ID to auto-link contacts created inline */
  conversationId?: string
  onSuccess?: () => void
}

/**
 * Sheet for creating orders from WhatsApp module.
 * Loads required data (pipelines, products, contacts) when opened.
 */
export function CreateOrderSheet({
  open,
  onOpenChange,
  defaultContactId,
  defaultPhone,
  conversationId,
  onSuccess,
}: CreateOrderSheetProps) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [pipelines, setPipelines] = React.useState<PipelineWithStages[]>([])
  const [products, setProducts] = React.useState<Product[]>([])
  const [contacts, setContacts] = React.useState<ContactWithTags[]>([])
  const [defaultPipelineId, setDefaultPipelineId] = React.useState<string>()
  const [defaultStageId, setDefaultStageId] = React.useState<string>()
  const [dataLoaded, setDataLoaded] = React.useState(false)

  // Load data when sheet opens
  React.useEffect(() => {
    if (!open || dataLoaded) return

    async function loadData() {
      setIsLoading(true)
      setLoadError(null)
      try {
        console.log('[CreateOrderSheet] Loading data...')
        const [defaultPipeline, pipelinesData, productsData, contactsData] = await Promise.all([
          getOrCreateDefaultPipeline(),
          getPipelines(),
          getActiveProducts(),
          getContacts(),
        ])
        console.log('[CreateOrderSheet] Data loaded:', {
          pipelines: pipelinesData.length,
          products: productsData.length,
          contacts: contactsData.length
        })

        setPipelines(pipelinesData)
        setProducts(productsData)
        setContacts(contactsData)
        setDefaultPipelineId(defaultPipeline?.id)
        setDefaultStageId(defaultPipeline?.stages[0]?.id)
        setDataLoaded(true)
      } catch (error) {
        console.error('[CreateOrderSheet] Error loading data:', error)
        setLoadError('Error al cargar datos. Por favor intenta de nuevo.')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [open, dataLoaded])

  const handleSuccess = () => {
    onOpenChange(false)
    onSuccess?.()
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  // Auto-link new contacts to the conversation
  const handleContactCreated = React.useCallback(async (contact: ContactWithTags) => {
    if (conversationId) {
      await linkContactToConversation(conversationId, contact.id)
    }
  }, [conversationId])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px] p-0 flex flex-col h-full max-h-screen overflow-hidden">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Nuevo pedido</SheetTitle>
          <SheetDescription>
            Crea un nuevo pedido para este contacto
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
            <p className="text-sm text-destructive text-center">{loadError}</p>
            <button
              onClick={() => setDataLoaded(false)}
              className="text-sm text-primary hover:underline"
            >
              Reintentar
            </button>
          </div>
        ) : !dataLoaded ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <OrderForm
            mode="create"
            pipelines={pipelines}
            products={products}
            contacts={contacts}
            defaultPipelineId={defaultPipelineId}
            defaultStageId={defaultStageId}
            defaultContactId={defaultContactId}
            defaultPhone={defaultPhone}
            onContactCreated={handleContactCreated}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
