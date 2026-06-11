---
phase: 260611-cfg-config-ui-back-navigation
plan: 01
subsystem: ui-config-navigation
tags: [ui, navigation, configuracion, shadcn, shared-component]
requires: []
provides:
  - ConfigBackLink shared component (server-safe Link, shadcn-neutral tokens)
  - Consistent "back to parent" navigation across every Configuración subsection
affects:
  - src/app/(dashboard)/configuracion/**
  - src/app/(dashboard)/settings/{logistica,activacion-cliente,workspace}/**
  - src/app/(dashboard)/crm/configuracion/estados-pedido/**
tech-stack:
  added: []
  patterns:
    - "Server-safe shared <Link> component renderizable dentro de client components (sin hooks, sin 'use client')"
    - "Tokens neutrales shadcn (text-muted-foreground/hover:text-foreground) que se remapean en .theme-editorial-v3"
key-files:
  created:
    - src/components/layout/config-back-link.tsx
  modified:
    - src/app/(dashboard)/configuracion/page.tsx
    - src/app/(dashboard)/configuracion/integraciones/page.tsx
    - src/app/(dashboard)/configuracion/tareas/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/nuevo/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/quick-replies/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/costos/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/equipos/page.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/[id]/components/template-detail.tsx
    - src/app/(dashboard)/configuracion/whatsapp/templates/builder/components/template-builder-layout.tsx
    - src/app/(dashboard)/settings/logistica/page.tsx
    - src/app/(dashboard)/settings/activacion-cliente/page.tsx
    - src/app/(dashboard)/settings/workspace/members/members-content.tsx
    - src/app/(dashboard)/settings/workspace/roles/page.tsx
    - src/app/(dashboard)/crm/configuracion/estados-pedido/page.tsx
decisions:
  - "El componente NO lleva 'use client': es un Server Component que solo renderiza un Link declarativo, por lo que también funciona embebido en client components (costos, members, template-detail, builder)."
  - "Los 3 back links ad-hoc (equipos, template-detail, builder) se reemplazaron por el componente compartido; pipelines/campos-custom se dejaron intactos por tener navegación propia válida al CRM."
  - "Hub raíz /configuracion NO lleva back link (es el índice). Pulido v2 = solo hover:underline en los items, sin tocar el branching del flag."
metrics:
  duration: ~10min
  completed: 2026-06-11
  tasks: 3
  files: 17
---

# Phase 260611-cfg Plan 01: Config UI Back Navigation Summary

Navegación "volver atrás" consistente en todo el módulo Configuración vía un componente compartido `ConfigBackLink` (server-safe, tokens neutrales shadcn), aplicado en las 15 subsecciones + pulido mínimo del hub.

## What Was Built

- **Task 1 — `ConfigBackLink`** (`src/components/layout/config-back-link.tsx`): `<Link>` declarativo de next/link con icono `ArrowLeft` de lucide-react y label. Sin hooks, sin `'use client'`. Tokens neutrales `inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground` (se remapean bien en legacy/v2/v3, sin clases editorial-only). Props `{ href, label, className? }`.
- **Task 2 — aplicación en 15 páginas** según la jerarquía canónica del mapa back-link:
  - "Volver a Configuración" → `/configuracion`: integraciones, tareas, whatsapp hub, logistica, activacion-cliente, roles, members (client), estados-pedido.
  - "Volver a WhatsApp" → `/configuracion/whatsapp`: templates, quick-replies, costos (client), equipos.
  - "Volver a Templates" → `/configuracion/whatsapp/templates`: nuevo, template-detail (client), builder (client).
  - **Reemplazos de back links ad-hoc**: equipos (Button+Link+ArrowLeftIcon → componente, imports limpiados), template-detail (Link+ArrowLeft → componente, imports limpiados, Button conservado por uso adicional), builder (Link+ArrowLeft → componente, imports limpiados).
- **Task 3 — pulido del hub** (`/configuracion/page.tsx`): añadido `hover:underline` a los `<Link>` de la rama v2 (tabla `.dict`) que no tenían feedback hover. Rama legacy intacta (ya tenía hover). Hub raíz sin back link.

## Deviations from Plan

None - plan ejecutado exactamente como fue escrito.

## Verification

- `tsc --noEmit -p tsconfig.json` → 0 errores (verificado tras Task 2 y tras Task 3, usando el binario del checkout principal contra el tsconfig del worktree).
- Grep gates del plan:
  - 15 páginas listadas con `ConfigBackLink` (incluye los 3 client/ad-hoc).
  - `pipelines/page.tsx` y `campos-custom/page.tsx` NO contienen `ConfigBackLink` (anti-regresión OK).
  - `config-back-link.tsx` no contiene `var(--ink`, `.eye` ni `.dict` (anti-editorial OK).
  - Hub raíz `/configuracion/page.tsx` no contiene `ConfigBackLink` (es el índice).
- Manual pendiente (operador, post-push a Vercel): navegar el árbol Configuración con flag v3 ON y OFF; confirmar que tabs de integraciones y header del builder siguen funcionando.

## Commits

- `9272ec22` feat(260611-cfg): componente compartido ConfigBackLink
- `4c11b507` feat(260611-cfg): aplicar ConfigBackLink en subsecciones de Configuración
- `b74fb9b2` feat(260611-cfg): pulido mínimo del hub /configuracion (hover v2)

## Self-Check: PASSED

- FOUND: src/components/layout/config-back-link.tsx
- FOUND commit: 9272ec22
- FOUND commit: 4c11b507
- FOUND commit: b74fb9b2
