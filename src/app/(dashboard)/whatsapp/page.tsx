import { InboxLayout } from './components/inbox-layout'
import { getConversationsPage, getConversationStats, findConversationByPhone } from '@/app/actions/conversations'
import { getClientActivationSettings } from '@/app/actions/client-activation'
import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getIsSuperUser } from '@/lib/auth/super-user'
import { getIsInboxV2Enabled } from '@/lib/auth/inbox-v2'
import { getIsEditorialV3Enabled } from '@/lib/auth/editorial-v3'

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

  // Fetch the FIRST conversation page (50 rows — F-1/D-02, no more 1000-row
  // SSR payload), true topbar counts (count:'exact' — D-04, never .length of
  // the loaded array), client config, super-user flag, inbox-v2 flag, and
  // editorial-v3 flag in parallel. editorial-v3 (standalone
  // ui-redesign-editorial-core) gates the verbatim editorial port; it fails
  // closed to false (Regla 6) and is independent of inbox-v2.
  const [initialPage, stats, clientConfig, isSuperUser, isInboxV2, isEditorialV3] = await Promise.all([
    getConversationsPage({ status: 'active', sortBy: 'last_customer_message' }, null),
    getConversationStats(),
    getClientActivationSettings(),
    getIsSuperUser(),
    getIsInboxV2Enabled(workspaceId),
    getIsEditorialV3Enabled(workspaceId),
  ])

  const initialConversations = initialPage.conversations

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
      initialCursor={initialPage.nextCursor}
      initialHasMore={initialPage.hasMore}
      totalCount={stats.total}
      unreadCount={stats.unread}
      initialSelectedId={initialSelectedId}
      clientConfig={clientConfig}
      isSuperUser={isSuperUser}
      v2={isInboxV2}
      v3={isEditorialV3}
    />
  )
}
