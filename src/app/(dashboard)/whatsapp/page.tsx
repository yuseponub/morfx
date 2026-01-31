import { cookies } from 'next/headers'
import { InboxLayout } from './components/inbox-layout'
import { getConversations } from '@/app/actions/conversations'

export default async function WhatsAppPage() {
  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value

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

  // Fetch initial conversations (active, sorted by recency)
  const initialConversations = await getConversations({ status: 'active' })

  return (
    <InboxLayout
      workspaceId={workspaceId}
      initialConversations={initialConversations}
    />
  )
}
