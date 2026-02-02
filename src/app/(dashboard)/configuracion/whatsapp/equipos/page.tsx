import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { getTeams } from '@/app/actions/teams'
import { Button } from '@/components/ui/button'
import { TeamList } from './components/team-list'

export default async function TeamsPage() {
  const teams = await getTeams()

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6 max-w-4xl space-y-6">
        {/* Back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/configuracion/whatsapp">
              <ArrowLeftIcon className="mr-2 h-4 w-4" />
              Volver
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Equipos</h1>
            <p className="text-muted-foreground">
              Organiza agentes en equipos para asignar conversaciones
            </p>
          </div>
        </div>

        {/* Team list with member management */}
        <TeamList teams={teams} />
      </div>
    </div>
  )
}
