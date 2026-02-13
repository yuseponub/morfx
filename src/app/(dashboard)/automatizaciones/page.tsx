import { getAutomations } from '@/app/actions/automations'
import { AutomationList } from './components/automation-list'

export default async function AutomatizacionesPage() {
  const automations = await getAutomations()

  return (
    <div className="flex-1 overflow-y-auto"><div className="container py-6 space-y-6">
      <AutomationList initialAutomations={automations} />
    </div></div>
  )
}
