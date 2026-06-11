---
status: complete
---

# Quick fixes 260611-f1b + f2c — Rutas huérfanas de navegación en UI v3

Fixes inline (gsd-fast, triviales y aditivos) derivados de la segunda pasada de la auditoría de paridad (`.planning/standalone/ui-v3-parity-audit/AUDIT.md`).

- `30b773df` — Builder IA de templates: botón "Crear con IA" en `/configuracion/whatsapp/templates` + card "Crear Template con IA" en hub `/configuracion/whatsapp`. (PUSHEADO)
- `9c5da1fa` — "Roles y permisos" añadido a SECTIONS de `/configuracion` (grupo Workspace) + tab "Productos" en CRM tabs. (push diferido: commits varixcenter de otra sesión en main local con type-error transitorio — pushear cuando esa sesión cierre verde)

Causa raíz común: la página `/settings` (sidebar legacy) era el único inbound link de esas rutas; el sidebar v3 lleva a `/configuracion`.
Verificación: rutas destino existen; tsc limpio salvo error preexistente de varixcenter (otra sesión, archivo por llegar).
