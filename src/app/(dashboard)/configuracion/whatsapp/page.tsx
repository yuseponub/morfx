import Link from 'next/link'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Users, MessageSquare, DollarSign } from 'lucide-react'

const settings = [
  {
    title: 'Templates',
    description: 'Gestionar plantillas de mensajes para WhatsApp',
    href: '/configuracion/whatsapp/templates',
    icon: FileText,
  },
  {
    title: 'Equipos',
    description: 'Configurar equipos y asignacion de agentes',
    href: '/configuracion/whatsapp/equipos',
    icon: Users,
  },
  {
    title: 'Respuestas Rapidas',
    description: 'Crear respuestas predefinidas con atajos',
    href: '/configuracion/whatsapp/quick-replies',
    icon: MessageSquare,
  },
  {
    title: 'Costos y Uso',
    description: 'Ver estadisticas de mensajes y costos',
    href: '/configuracion/whatsapp/costos',
    icon: DollarSign,
  },
]

export default function WhatsAppSettingsPage() {
  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">Configuracion de WhatsApp</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {settings.map((setting) => (
          <Link key={setting.href} href={setting.href}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-4">
                <setting.icon className="h-8 w-8 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">{setting.title}</CardTitle>
                  <CardDescription>{setting.description}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
