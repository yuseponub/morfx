import { InboxLayout } from './components/inbox-layout'
import { getConversations } from '@/app/actions/conversations'
import { getClientActivationSettings } from '@/app/actions/client-activation'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

interface WhatsAppPageProps {
  searchParams: Promise<{ phone?: string }>
}

export default async function WhatsAppPage({ searchParams }: WhatsAppPageProps) {
  const { phone } = await searchParams

  // Get workspace from cookie or DB fallback (for new users without cookie)
  const workspaceId = await getActiveWorkspaceId()

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No hay workspace seleccionado</p>
          <p className="text-sm">Selecciona un workspace para ver las conversaciones</p>
        </div>
      </div>
    )
  }

  // Fetch initial conversations and client config in parallel
  const [initialConversations, clientConfig] = await Promise.all([
    getConversations({ status: 'active', sortBy: 'last_customer_message' }),
    getClientActivationSettings(),
  ])

  // Find conversation by phone if provided
  const initialSelectedId = phone
    ? initialConversations.find(c => c.phone.includes(phone) || c.contact?.phone.includes(phone))?.id
    : undefined

  return (
    <InboxLayout
      workspaceId={workspaceId}
      initialConversations={initialConversations}
      initialSelectedId={initialSelectedId}
      clientConfig={clientConfig}
    />
  )
}
