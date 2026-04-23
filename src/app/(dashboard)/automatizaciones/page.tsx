import { getAutomations, getFolders } from '@/app/actions/automations'
import { AutomationList } from './components/automation-list'

export default async function AutomatizacionesPage() {
  const [automations, folders] = await Promise.all([
    getAutomations(),
    getFolders(),
  ])

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <AutomationList initialAutomations={automations} initialFolders={folders} />
    </div></div>
  )
}
