---
phase: 260611-cfg-config-ui-back-navigation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/layout/config-back-link.tsx
  - src/app/(dashboard)/configuracion/integraciones/page.tsx
  - src/app/(dashboard)/configuracion/tareas/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/nuevo/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/[id]/components/template-detail.tsx
  - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx
  - src/app/(dashboard)/settings/logistica/page.tsx
  - src/app/(dashboard)/settings/activacion-cliente/page.tsx
  - src/app/(dashboard)/settings/workspace/members/members-content.tsx
  - src/app/(dashboard)/settings/workspace/roles/page.tsx
  - src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx
autonomous: true
requirements:
  - CFG-NAV-01  # ConfigBackLink shared component (server-safe Link, shadcn-neutral tokens)
  - CFG-NAV-02  # Consistent "back to parent" on every Configuración subsection
  - CFG-NAV-03  # Hub pulido pertinente (v2 branch hover + neutral consistency)

must_haves:
  truths:
    - "Cada subsección de Configuración tiene un link 'volver' visible arriba del título que apunta a su sección padre canónica"
    - "El back link se ve consistente (mismo markup/tokens neutrales) en UI legacy, v2 y v3 sin clases editorial-only"
    - "Las páginas que ya tenían un 'Volver' propio ad-hoc usan ahora el componente compartido (o un href normalizado al padre correcto)"
    - "No se rompen tabs/breadcrumbs existentes (integraciones tabs, CRM, builder header)"
    - "tsc --noEmit pasa con 0 errores"
  artifacts:
    - path: "src/components/layout/config-back-link.tsx"
      provides: "Componente compartido ConfigBackLink (server-safe, sin hooks)"
      min_lines: 15
      exports: ["ConfigBackLink"]
  key_links:
    - from: "src/app/(dashboard)/configuracion/**/page.tsx"
      to: "src/components/layout/config-back-link.tsx"
      via: "import + render arriba del título"
      pattern: "ConfigBackLink"
    - from: "src/app/(dashboard)/settings/{logistica,activacion-cliente,workspace}/**"
      to: "/configuracion"
      via: "href del back link (grupo Workspace del hub)"
      pattern: "href=.*/configuracion"
---

<objective>
Añadir navegación "volver atrás" consistente en TODAS las secciones del módulo Configuración mediante un componente compartido `ConfigBackLink`, y aplicar pulido mínimo y seguro al hub `/configuracion`.

Purpose: Hoy el árbol de Configuración tiene back links inconsistentes — algunas páginas tienen "Volver" propio (equipos, builder, template-detail), otras enlazan a destinos del CRM (pipelines→/crm/pedidos), y la mayoría (integraciones, tareas, whatsapp hub, quick-replies, costos, templates, nuevo, logistica, activacion-cliente, members, roles, estados-pedido) no tienen ninguno. El usuario navega entrando por el hub `/configuracion` (índice del sidebar v3) y se queda sin forma clara de volver al padre.

Output: Un componente `ConfigBackLink` server-safe con tokens neutrales shadcn (funciona en legacy/v2/v3) + su aplicación consistente en cada subsección de Configuración, respetando la jerarquía canónica.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/standalone/ui-v3-parity-audit/AUDIT.md

<interfaces>
<!-- Jerarquía canónica de "atrás" (href → destino padre). El executor usa esta tabla literal. -->
<!-- Páginas COMPARTIDAS legacy/v2/v3 (sin branch de flag salvo el hub). -->

Mapa back-link (página → label → href padre):

- /configuracion/integraciones              → "Volver a Configuración"        → /configuracion
- /configuracion/tareas                      → "Volver a Configuración"        → /configuracion
- /configuracion/whatsapp (hub)              → "Volver a Configuración"        → /configuracion
- /configuracion/whatsapp/templates          → "Volver a WhatsApp"             → /configuracion/whatsapp
- /configuracion/whatsapp/templates/nuevo    → "Volver a Templates"           → /configuracion/whatsapp/templates
- /configuracion/whatsapp/templates/[id]     → "Volver a Templates"           → /configuracion/whatsapp/templates  (YA TIENE link a este destino — normalizar)
- /configuracion/whatsapp/templates/builder  → "Volver a Templates"           → /configuracion/whatsapp/templates  (YA TIENE link a este destino — normalizar)
- /configuracion/whatsapp/equipos            → "Volver a WhatsApp"             → /configuracion/whatsapp  (YA TIENE "Volver" propio — reemplazar por componente)
- /configuracion/whatsapp/quick-replies      → "Volver a WhatsApp"             → /configuracion/whatsapp
- /configuracion/whatsapp/costos             → "Volver a WhatsApp"             → /configuracion/whatsapp  (CLIENT component 'use client')
- /settings/logistica                        → "Volver a Configuración"        → /configuracion
- /settings/activacion-cliente               → "Volver a Configuración"        → /configuracion
- /settings/workspace/members                → "Volver a Configuración"        → /configuracion  (header vive en members-content.tsx, CLIENT component)
- /settings/workspace/roles                  → "Volver a Configuración"        → /configuracion
- /crm/configuracion/estados-pedido          → "Volver a Configuración"        → /configuracion  (única CRM-config SIN back link hoy)

NO TOCAR (CRM-config con back link propio válido al CRM — NO forzar, per requirements "si ya tienen navegación propia clara, no forzar"):
- /crm/configuracion/pipelines     (ya: "Volver a pedidos" → /crm/pedidos)
- /crm/configuracion/campos-custom (ya: "Volver a contactos" → /crm/contactos)

Patrón de markup actual del título en cada página (el back link va JUSTO ARRIBA del bloque del título, dentro del mismo contenedor):
- integraciones: `<div className="container mx-auto py-6 space-y-6">` → primer hijo es `<div><h1>Integraciones</h1>...`
- tareas:        `<div className="container py-6 space-y-8 max-w-4xl">` → primer hijo `<div><h1>Configuracion de Tareas</h1>`
- whatsapp hub:  `<div className="container py-6 px-6"><h1 className="text-2xl font-bold mb-6">Configuracion de WhatsApp</h1>`
- templates:     `<div className="container py-6 px-6"><div className="flex items-center justify-between mb-6">...`
- nuevo:         `<div className="container py-6 max-w-3xl mx-auto px-6"><div className="mb-6"><h1>Nuevo Template</h1>`
- quick-replies: `<div className="container py-6 px-6"><div className="flex items-center justify-between mb-6">...`
- costos:        `<div className="container py-6 px-6"><div className="flex items-center justify-between mb-6">...` (return final, no el loading state)
- equipos:       ya tiene `<div className="flex items-center gap-4"><Button variant="ghost" ...><Link href="/configuracion/whatsapp"><ArrowLeftIcon/>Volver</Link></Button></div>` → REEMPLAZAR ese bloque entero por `<ConfigBackLink href="/configuracion/whatsapp" label="Volver a WhatsApp" />`
- logistica:     `<div className="max-w-2xl mx-auto py-8 px-4 space-y-6"><div><h1>Logistica</h1>`
- activacion:    `<div className="max-w-2xl mx-auto py-8 px-4 space-y-6"><div><h1>Badge de Cliente</h1>`
- roles:         `<div className="space-y-6"><div><h1>Roles y permisos</h1>`
- estados-pedido:`<div className="container max-w-3xl py-8"><div className="mb-8"><h1>Estados de Pedido</h1>`
- members-content.tsx: CLIENT component — buscar el `<h1>`/header principal del workspace y poner el back link arriba (es 'use client', el componente ConfigBackLink es solo un <Link>, seguro de usar en client también).
- template-detail.tsx: ya tiene `<Link href="/configuracion/whatsapp/templates">` con `<ArrowLeft/>` → reemplazar por `<ConfigBackLink href="/configuracion/whatsapp/templates" label="Volver a Templates" />` (client component, OK).
- template-builder-layout.tsx: ya tiene `href="/configuracion/whatsapp/templates"` con `<ArrowLeft/>` → reemplazar por ConfigBackLink (client component, OK).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Crear componente compartido ConfigBackLink</name>
  <files>src/components/layout/config-back-link.tsx</files>
  <behavior>
    - Renderiza un `<Link>` de next/link con un icono ArrowLeft de lucide-react y un label.
    - Server-safe: SIN hooks, SIN 'use client', SIN useRouter — solo un Link declarativo (también usable dentro de client components).
    - Tokens neutrales shadcn/Tailwind: `text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5` — NO clases editorial-only (`.eye`, `var(--ink-*)`, etc.).
    - Props: `{ href: string; label: string; className?: string }`. `label` ya incluye el texto completo (ej. "Volver a WhatsApp").
  </behavior>
  <action>
    Crear `src/components/layout/config-back-link.tsx` (NO marcar 'use client' — debe ser un Server Component reutilizable que también funciona embebido en client components porque solo renderiza un Link declarativo sin hooks).

    Implementación exacta:
    ```tsx
    import Link from 'next/link'
    import { ArrowLeft } from 'lucide-react'

    export function ConfigBackLink({
      href,
      label,
      className,
    }: {
      href: string
      label: string
      className?: string
    }) {
      return (
        <Link
          href={href}
          className={`inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${className ?? ''}`}
        >
          <ArrowLeft className="h-4 w-4" />
          {label}
        </Link>
      )
    }
    ```

    Razón de tokens neutrales: estas páginas son COMPARTIDAS entre legacy/v2/v3 (constraint del plan). `text-muted-foreground`/`hover:text-foreground` se remapean dentro de `.theme-editorial-v3` y se ven bien en los tres mundos. NO usar clases editorial (`.eye`, `var(--ink-*)`).
  </action>
  <verify>
    <automated>node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -c "config-back-link" | grep -q "^0$" && echo "OK no errors in component"</automated>
  </verify>
  <done>El archivo existe, exporta `ConfigBackLink`, no usa hooks ni 'use client', y tsc no reporta errores sobre él.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Aplicar ConfigBackLink en todas las subsecciones de Configuración</name>
  <files>src/app/(dashboard)/configuracion/integraciones/page.tsx, src/app/(dashboard)/configuracion/tareas/page.tsx, src/app/(dashboard)/configuracion/whatsapp/page.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/nuevo/page.tsx, src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx, src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx, src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/[id]/components/template-detail.tsx, src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx, src/app/(dashboard)/settings/logistica/page.tsx, src/app/(dashboard)/settings/activacion-cliente/page.tsx, src/app/(dashboard)/settings/workspace/members/members-content.tsx, src/app/(dashboard)/settings/workspace/roles/page.tsx, src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx</files>
  <action>
    Aplicar el componente `ConfigBackLink` en cada página según el mapa back-link en `<interfaces>`. En CADA página:

    1. Importar: `import { ConfigBackLink } from '@/components/layout/config-back-link'`
    2. Renderizar `<ConfigBackLink href="<padre>" label="<label>" />` JUSTO ARRIBA del bloque del título (`<h1>`), dentro del mismo contenedor raíz de la página. Añadir un pequeño espaciado: envolver en `<div className="mb-4"><ConfigBackLink ... /></div>` cuando el contenedor no tenga ya `space-y-*` que lo maneje; si el contenedor usa `space-y-6`/`space-y-8`, el back link puede ser el primer hijo directo sin wrapper extra.

    Mapa exacto (href → label):
    - integraciones → `/configuracion` / "Volver a Configuración"
    - tareas → `/configuracion` / "Volver a Configuración"
    - whatsapp/page.tsx (hub) → `/configuracion` / "Volver a Configuración"
    - whatsapp/templates → `/configuracion/whatsapp` / "Volver a WhatsApp"
    - whatsapp/templates/nuevo → `/configuracion/whatsapp/templates` / "Volver a Templates"
    - whatsapp/quick-replies → `/configuracion/whatsapp` / "Volver a WhatsApp"
    - whatsapp/costos → `/configuracion/whatsapp` / "Volver a WhatsApp" (ponerlo en el return FINAL, no en el `if (loading)` early-return)
    - settings/logistica → `/configuracion` / "Volver a Configuración"
    - settings/activacion-cliente → `/configuracion` / "Volver a Configuración"
    - settings/workspace/roles → `/configuracion` / "Volver a Configuración"
    - crm/configuracion/estados-pedido → `/configuracion` / "Volver a Configuración"
    - settings/workspace/members/members-content.tsx (CLIENT) → `/configuracion` / "Volver a Configuración" (ponerlo arriba del header principal del workspace)

    REEMPLAZOS de back links ad-hoc existentes (quitar el markup viejo, poner ConfigBackLink):
    - whatsapp/equipos: borrar el bloque `<div className="flex items-center gap-4"><Button variant="ghost" size="sm" asChild><Link href="/configuracion/whatsapp">...Volver...</Link></Button></div>` y su import `ArrowLeftIcon` si queda sin usar → `<ConfigBackLink href="/configuracion/whatsapp" label="Volver a WhatsApp" />`. Verificar que `Link`/`Button` sigan importados solo si se usan en otro lugar del archivo.
    - whatsapp/templates/[id]/components/template-detail.tsx: reemplazar el `<Link href="/configuracion/whatsapp/templates">` con `<ArrowLeft/>` por `<ConfigBackLink href="/configuracion/whatsapp/templates" label="Volver a Templates" />`. Limpiar imports `ArrowLeft`/`Link` SOLO si quedan sin usar (este archivo usa varios iconos lucide — verificar antes de borrar).
    - whatsapp/templates/builder/components/template-builder-layout.tsx: reemplazar el `<Link href="/configuracion/whatsapp/templates">` con `<ArrowLeft/>` por `<ConfigBackLink href="/configuracion/whatsapp/templates" label="Volver a Templates" />`. Limpiar import `ArrowLeft` SOLO si queda sin usar (el archivo importa varios iconos — verificar).

    NO TOCAR: `/crm/configuracion/pipelines` y `/crm/configuracion/campos-custom` (back links propios al CRM válidos, per requirements).
    NO romper tabs existentes: en integraciones el `<Tabs>` va DESPUÉS del header — el back link va arriba del `<h1>Integraciones</h1>`, sin tocar `<TabsList>`. En el builder, no tocar el resto del layout, solo el link de retorno.

    Para los CLIENT components (costos, members-content, template-detail, template-builder-layout): ConfigBackLink es un Server Component que solo renderiza un Link declarativo, es seguro importarlo y usarlo dentro de un componente 'use client' (Next.js permite Server Components hijos solo si no reciben children no serializables; aquí se renderiza directo en el JSX del client, lo cual fuerza a Next a tratarlo como parte del client bundle — funciona porque no tiene hooks ni APIs server-only). Si tsc o el linter se queja, NO añadir 'use client' al componente; simplemente se renderiza inline sin problema porque es markup puro.
  </action>
  <verify>
    <automated>node node_modules/typescript/bin/tsc --noEmit 2>&1 | tail -5; node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -cE "error TS" | grep -q "^0$" && echo "TSC CLEAN"</automated>
  </verify>
  <done>Cada subsección listada renderiza `<ConfigBackLink>` con el href/label correcto del mapa; los back links ad-hoc (equipos, template-detail, builder) fueron reemplazados; pipelines/campos-custom intactos; tabs de integraciones intactos; `tsc --noEmit` retorna 0 errores.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Pulido mínimo del hub /configuracion (rama v2 hover + consistencia)</name>
  <files>src/app/(dashboard)/configuracion/page.tsx</files>
  <action>
    Pulido mínimo y SEGURO del hub (sin reescribir layout, per constraint):

    1. Rama v2 (la tabla `.dict`): hoy los `<Link>` de cada item NO tienen feedback hover. Añadir un hover sutil al `<tr>` o al `<Link>` usando tokens que existan en el theme editorial: añadir `className="config-hub-row"` al `<tr>` y un hover de opacidad/subrayado al Link, O más simple y seguro: añadir al estilo inline del Link un hover via className `hover:underline` (Tailwind, neutral, se ve bien en editorial). Mantener el `style` inline existente; solo agregar `className="hover:underline"` al `<Link>` de la rama v2. NO cambiar la estructura de la tabla.

    2. Rama legacy (flag OFF, grid de cards): ya tiene hover (`hover:border-foreground/20 hover:shadow-sm`). Dejar intacta — está bien.

    3. Consistencia de descripciones: revisar que las 10 descripciones del array `SECTIONS` sean coherentes en tono (frases cortas, terminan en punto). Hoy ya están razonables — solo corregir si alguna desentona claramente. Cambio opcional y mínimo; NO inventar copy nuevo extenso.

    El hub raíz `/configuracion` NO lleva back link (es el índice) — confirmar que NO se añade ConfigBackLink aquí.

    NO tocar la lógica del flag `getIsDashboardV2Enabled` ni el branching v2/legacy. Cambios deben ser puramente cosméticos y reversibles.
  </action>
  <verify>
    <automated>node node_modules/typescript/bin/tsc --noEmit 2>&1 | grep -cE "error TS" | grep -q "^0$" && echo "TSC CLEAN"</automated>
  </verify>
  <done>La rama v2 del hub tiene feedback hover en los items; la rama legacy queda intacta; el hub raíz NO tiene back link; `tsc --noEmit` retorna 0 errores.</done>
</task>

</tasks>

<verification>
- `node node_modules/typescript/bin/tsc --noEmit` retorna 0 errores (constraint del plan).
- grep de consistencia: `grep -rl "ConfigBackLink" src/app/\(dashboard\)/configuracion src/app/\(dashboard\)/settings/{logistica,activacion-cliente,workspace} src/app/\(dashboard\)/crm/configuracion/estados-pedido` lista todas las páginas esperadas.
- grep anti-regresión: `/crm/configuracion/pipelines` y `/crm/configuracion/campos-custom` NO contienen `ConfigBackLink` (conservan su back link propio al CRM).
- grep anti-editorial: el componente `config-back-link.tsx` NO contiene `var(--ink` ni clases `.eye`/`.dict` (solo tokens shadcn neutrales).
- Manual (operador, post-push a Vercel): navegar el árbol Configuración en v3 ON y OFF — cada subsección muestra "← Volver a {padre}" y el link lleva al padre correcto; tabs de integraciones y header del builder siguen funcionando.
</verification>

<success_criteria>
- Componente `ConfigBackLink` server-safe creado con tokens neutrales shadcn.
- Las 15 páginas del mapa (incluyendo reemplazos de back links ad-hoc) renderizan el componente con href/label correcto según la jerarquía canónica.
- CRM-config con navegación propia válida (pipelines, campos-custom) intactos; estados-pedido (que no tenía) ahora cubierto.
- Hub `/configuracion` con pulido mínimo (hover v2) sin reescribir layout y sin back link en la raíz.
- `tsc --noEmit` = 0 errores.
</success_criteria>

<output>
After completion, create `.planning/quick/260611-cfg-config-ui-back-navigation/260611-cfg-01-SUMMARY.md`
</output>
