import { InboxLayout } from './components/inbox-layout'
import { getConversations, findConversationByPhone } from '@/app/actions/conversations'
import { getClientActivationSettings } from '@/app/actions/client-activation'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getIsSuperUser } from '@/lib/auth/super-user'

interface WhatsAppPageProps {
  searchParams: Promise<{ phone?: string; c?: string }>
}

export default async function WhatsAppPage({ searchParams }: WhatsAppPageProps) {
  const { phone, c } = await searchParams

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

  // Fetch initial conversations, client config, and super-user flag in parallel
  const [initialConversations, clientConfig, isSuperUser] = await Promise.all([
    getConversations({ status: 'active', sortBy: 'last_customer_message' }),
    getClientActivationSettings(),
    getIsSuperUser(),
  ])

  // Find conversation by ID or phone if provided
  let initialSelectedId: string | undefined = c || undefined

  if (!initialSelectedId && phone) {
    // Try matching in already-loaded conversations first
    const localMatch = initialConversations.find(
      conv => conv.phone.includes(phone) || conv.contact?.phone?.includes(phone)
    )
    if (localMatch) {
      initialSelectedId = localMatch.id
    } else {
      // Fallback: search DB directly (covers conversations not in initial list,
      // e.g., outbound-only where customer hasn't replied yet)
      const dbMatch = await findConversationByPhone(phone)
      if (dbMatch) initialSelectedId = dbMatch
    }
  }

  return (
    <InboxLayout
      workspaceId={workspaceId}
      initialConversations={initialConversations}
      initialSelectedId={initialSelectedId}
      clientConfig={clientConfig}
      isSuperUser={isSuperUser}
    />
  )
}
