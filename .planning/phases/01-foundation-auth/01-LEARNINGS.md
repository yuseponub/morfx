# Phase 1: Foundation & Auth - Learnings

**Fecha:** 2026-01-27
**Duración:** ~45 minutos
**Plans ejecutados:** 3

---

## Bugs Encontrados

| Bug | Causa | Fix | Prevención |
|-----|-------|-----|------------|
| `pnpm: command not found` en bash de Claude | pnpm no está instalado en el entorno de ejecución de Claude | Usar `npm run dev` o que el usuario corra pnpm directamente | Verificar disponibilidad de package managers antes de ejecutar |
| Puerto 3000 ocupado | Usuario tenía otras apps corriendo | Configurar puerto fijo 3020 en package.json | Siempre preguntar/configurar puerto al inicio del proyecto |
| `EADDRINUSE: address already in use :::3020` | Múltiples intentos de iniciar servidor | `pkill` procesos anteriores antes de reiniciar | Verificar si el puerto está en uso antes de iniciar |
| Nombre "MorfX" con mayúsculas | Generado automáticamente sin consultar branding | Reemplazar con `sed` en todos los archivos | Preguntar formato exacto del nombre de marca al inicio |

## Decisiones Técnicas

| Decisión | Alternativas Descartadas | Razón |
|----------|-------------------------|-------|
| Next.js 16.1.5 + React 19 | Next.js 15, Next.js 14 | Versión más reciente estable disponible |
| Puerto 3020 fijo | Puerto 3000 (default) | Evitar conflictos con otros proyectos del usuario |
| `@supabase/ssr` v0.8.0 | `@supabase/auth-helpers` (deprecated) | auth-helpers está deprecado, ssr es el reemplazo oficial |
| shadcn/ui estilo new-york | Estilo default | Más limpio, mejor para tema matemático |
| Tema grayscale + acentos básicos | Colores de marca específicos | Usuario definió tema matemático f(x) |
| Sidebar fijo 240px | Sidebar colapsable | Simplicidad inicial, colapsable puede agregarse después |

## Problemas de Integración

| Componente A | Componente B | Problema | Solución |
|--------------|--------------|----------|----------|
| next-themes | Next.js App Router | Hydration mismatch en SSR | `suppressHydrationWarning` en html element |
| Supabase cookies | Next.js 15 async APIs | `cookies()` ahora es async | Usar `await cookies()` en server client |
| Middleware | Rutas públicas | Redirect loop en /login | Lista explícita de `publicPaths` en middleware |

## Tips para Futuros Agentes

### Lo que funcionó bien
- shadcn/ui init interactivo configura todo automáticamente
- Separar clientes Supabase (browser/server/middleware) desde el inicio
- Route groups `(auth)` y `(dashboard)` para layouts diferentes
- Usar `getUser()` en lugar de `getSession()` para seguridad

### Lo que NO hacer
- NO usar `@supabase/auth-helpers` - está deprecado
- NO olvidar `suppressHydrationWarning` con next-themes
- NO hardcodear URLs - usar `window.location.origin`
- NO usar `getSession()` en server-side - no valida JWT

### Patrones a seguir
- Server actions para logout (no API routes)
- Zod + react-hook-form para validación de formularios
- Middleware para protección de rutas (no en cada página)
- CSS variables para theming (shadcn lo configura)

### Comandos útiles
```bash
# Agregar componentes shadcn
pnpm dlx shadcn@latest add button input card

# Verificar build
pnpm build

# Correr en puerto específico
pnpm dev -p 3020
```

## Deuda Técnica Identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Email templates de Supabase usan `token_hash` no `code` | Media | Antes de producción |
| Onboarding wizard es solo redirect | Alta | Fase 2 (workspace creation) |
| Páginas CRM/WhatsApp/Settings son placeholders | Alta | Fases 4-8 |
| No hay tests automatizados | Media | Considerar en fase posterior |

## Notas para el Módulo Auth

Información específica para agente de documentación del módulo de autenticación:

- El flujo de auth usa PKCE (Proof Key for Code Exchange) por defecto en Supabase
- Los callbacks tienen dos rutas: `/auth/callback` (code exchange) y `/auth/confirm` (email verification)
- El middleware refresca tokens automáticamente en cada request
- La sesión se mantiene en cookies HTTP-only (manejado por @supabase/ssr)
- Para testing sin email verification: desactivar "Confirm email" en Supabase Dashboard > Authentication > Providers > Email

---
*Generado al completar la fase. Input para entrenamiento de agentes de documentación.*
