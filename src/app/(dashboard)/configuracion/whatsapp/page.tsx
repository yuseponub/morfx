import Link from 'next/link'
import { cookies } from 'next/headers'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Users, MessageSquare, DollarSign } from 'lucide-react'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'

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

export default async function WhatsAppSettingsPage() {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

  if (v2) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
        {/* Editorial topbar */}
        <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
              Datos
            </div>
            <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              WhatsApp
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — numero, agente y mensajes automaticos
              </em>
            </h1>
          </div>
        </div>

        <div className="px-8 py-6 max-w-[680px]">
          <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] p-2">
            {settings.map((setting) => (
              <Link
                key={setting.href}
                href={setting.href}
                className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-[var(--radius-2)] text-[13px] font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)] transition-colors"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <setting.icon className="h-[15px] w-[15px] flex-shrink-0" />
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold text-[var(--ink-1)]">{setting.title}</span>
                  <span className="block text-[11px] text-[var(--ink-3)] mt-0.5">{setting.description}</span>
                </span>
                <span className="text-[10px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>›</span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-[var(--ink-3)] leading-[1.6]" style={{ fontFamily: 'var(--font-sans)' }}>
            Selecciona una seccion para configurar tu integracion de WhatsApp.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
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
    </div>
  )
}
