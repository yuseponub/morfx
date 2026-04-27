import Link from 'next/link'
import { cookies } from 'next/headers'
import { getIsDashboardV2Enabled } from '@/lib/auth/dashboard-v2'
import {
  Plug,
  CheckSquare,
  MessageSquare,
  Workflow,
  Tags,
  ListChecks,
  Users,
  Truck,
  UserCheck,
} from 'lucide-react'

type ConfigSection = {
  href: string
  label: string
  description: string
  Icon: typeof Plug
  group: 'Plataforma' | 'CRM' | 'Workspace'
}

const SECTIONS: ConfigSection[] = [
  {
    href: '/configuracion/integraciones',
    label: 'Integraciones',
    description: 'Shopify, transportadoras, webhooks y APIs externas.',
    Icon: Plug,
    group: 'Plataforma',
  },
  {
    href: '/configuracion/tareas',
    label: 'Tareas',
    description: 'Tipos de tarea, plantillas y reglas de asignación.',
    Icon: CheckSquare,
    group: 'Plataforma',
  },
  {
    href: '/configuracion/whatsapp',
    label: 'WhatsApp',
    description: 'Templates aprobados, quick replies, equipos y costos.',
    Icon: MessageSquare,
    group: 'Plataforma',
  },
  {
    href: '/crm/configuracion/pipelines',
    label: 'Pipelines',
    description: 'Etapas del kanban de pedidos y reglas WIP por etapa.',
    Icon: Workflow,
    group: 'CRM',
  },
  {
    href: '/crm/configuracion/estados-pedido',
    label: 'Estados de pedido',
    description: 'Catálogo de estados auxiliares para órdenes.',
    Icon: ListChecks,
    group: 'CRM',
  },
  {
    href: '/crm/configuracion/campos-custom',
    label: 'Campos personalizados',
    description: 'Custom fields adicionales por contacto y por orden.',
    Icon: Tags,
    group: 'CRM',
  },
  {
    href: '/settings/workspace/members',
    label: 'Equipo',
    description: 'Miembros del workspace, roles y permisos.',
    Icon: Users,
    group: 'Workspace',
  },
  {
    href: '/settings/logistica',
    label: 'Logística',
    description: 'Configuración general de transportadoras y guías.',
    Icon: Truck,
    group: 'Workspace',
  },
  {
    href: '/settings/activacion-cliente',
    label: 'Activación de clientes',
    description: 'Reglas y plantillas para reactivación de contactos.',
    Icon: UserCheck,
    group: 'Workspace',
  },
]

const GROUP_ORDER: ConfigSection['group'][] = ['Plataforma', 'CRM', 'Workspace']

export default async function ConfiguracionHubPage() {
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  const v2 = workspaceId ? await getIsDashboardV2Enabled(workspaceId) : false

  if (v2) {
    return (
      <>
        <header className="topbar">
          <div>
            <div className="eye">Módulo · configuración</div>
            <h1>
              Configuración <em>— centro de ajustes</em>
            </h1>
          </div>
        </header>

        <section className="page">
          {GROUP_ORDER.map((group) => {
            const items = SECTIONS.filter((s) => s.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} style={{ marginBottom: 28 }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    marginBottom: 10,
                  }}
                >
                  {group}
                </h2>
                <table className="dict">
                  <tbody>
                    {items.map(({ href, label, description, Icon }) => (
                      <tr key={href}>
                        <td style={{ width: 36 }}>
                          <Icon width={16} height={16} aria-hidden="true" />
                        </td>
                        <td className="entry">
                          <Link
                            href={href}
                            style={{
                              color: 'var(--ink-1)',
                              textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            {label}
                          </Link>
                          <span className="def">{description}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </section>
      </>
    )
  }

  // Legacy (flag OFF) — shadcn-friendly markup, no editorial classes.
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground mt-2">
          Centro de ajustes de tu workspace MorfX.
        </p>
      </header>

      {GROUP_ORDER.map((group) => {
        const items = SECTIONS.filter((s) => s.group === group)
        if (items.length === 0) return null
        return (
          <section key={group} className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              {group}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map(({ href, label, description, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-start gap-3 rounded-lg border bg-card p-4 hover:border-foreground/20 hover:shadow-sm transition-all"
                >
                  <Icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    <div className="font-semibold text-sm">{label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {description}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
