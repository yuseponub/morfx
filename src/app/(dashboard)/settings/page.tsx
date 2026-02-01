import Link from 'next/link'
import { Users, Shield, Building2, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const settingsLinks = [
  {
    href: '/settings/workspace/members',
    title: 'Miembros del equipo',
    description: 'Gestiona los miembros de tu workspace e invita nuevos colaboradores',
    icon: Users,
  },
  {
    href: '/settings/workspace/roles',
    title: 'Roles y permisos',
    description: 'Consulta los permisos disponibles para cada rol',
    icon: Shield,
  },
  {
    href: '/configuracion/whatsapp',
    title: 'WhatsApp',
    description: 'Templates, equipos, respuestas rapidas y costos de mensajeria',
    icon: MessageSquare,
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Configuracion</h1>
        <p className="text-muted-foreground">
          Gestiona tu workspace y preferencias de cuenta
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsLinks.map((item) => {
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}>
              <Card className="h-full hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{item.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-lg">Configuracion del workspace</CardTitle>
              <CardDescription>Proximamente</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aqui podras modificar el nombre, slug y tipo de negocio de tu workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
