# Phase 1: Foundation & Auth - Context

**Discussed:** 2026-01-26
**Status:** Ready to plan

## Decisions

### Auth UI Design

| Decision | Value |
|----------|-------|
| Style | Minimalista centrado (card centrada, fondo sólido/gradiente sutil) |
| Registro | Progresivo: email + contraseña primero, luego wizard 2-3 pasos |
| Tema | Dark/Light mode con toggle (usuario elige) |
| Colores | Escala de grises base + acentos básicos (rojo, azul, verde) |

**Nota sobre marca:** MorfX = morfología + f(x). Tema matemático. Colores básicos solo para resaltar elementos importantes.

### Application Shell Layout

| Decision | Value |
|----------|-------|
| Navegación | Sidebar izquierdo fijo (siempre visible) |
| Organización | Tabs principales: CRM \| WhatsApp \| Settings |
| Header | Contexto actual + acción principal + búsqueda global + menú usuario |
| Mobile (responsive) | Sidebar como drawer (hamburger menu → desliza desde izquierda) |

### Onboarding / Landing

| Decision | Value |
|----------|-------|
| Post-registro | Wizard obligatorio: Nombre workspace → Invitar equipo (opcional) → Dashboard |
| Landing page | Solo app por ahora. Ruta `/` redirige a `/login`. Landing marketing en fase posterior. |

### Stack Setup

| Decision | Value |
|----------|-------|
| Supabase | Proyecto existente, vacío, listo para configurar |
| Next.js | App Router (Next.js 14+) |
| Package manager | pnpm |
| UI Generation | v0.dev (cuenta activa) |

## Requirements Covered

- AUTH-01: Usuario puede registrarse con email y contraseña
- AUTH-02: Usuario puede hacer login y mantener sesión
- AUTH-03: Usuario puede hacer logout
- AUTH-04: Sistema soporta verificación de email (toggle, off para testing)
- AUTH-05: Sistema soporta reset de contraseña (toggle, off para testing)
- UIUX-01: Interfaz desarrollada con v0 + Next.js + Tailwind
- UIUX-02: Diseño responsive (funciona en móvil)
- UIUX-03: Interfaz en español
- UIUX-04: Navegación clara entre módulos (CRM, WhatsApp, Settings)

## Implementation Notes

### v0 Usage Strategy

1. Generar componentes base en v0.dev con prompts específicos
2. Copiar código generado al proyecto Next.js
3. Ajustar estilos para consistencia con tema matemático
4. Integrar con Supabase Auth

### Supabase Auth Configuration

- Email + password authentication
- Email verification: configurable toggle (off for dev/testing)
- Password reset: configurable toggle (off for dev/testing)
- Custom JWT claims para workspace_id y role (preparación para Phase 2)

### Theming Approach

- CSS variables para colores base (grises)
- Tailwind dark mode con `class` strategy
- Acentos:
  - Azul para acciones primarias/info
  - Verde para éxito/confirmación
  - Rojo para errores/destructivo
  - Gris para elementos neutros

---
*Context gathered: 2026-01-26*
