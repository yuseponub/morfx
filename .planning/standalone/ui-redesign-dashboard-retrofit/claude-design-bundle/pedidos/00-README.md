# Bundle para Claude Design — Módulo Pedidos (morfx)

**Cómo usar este bundle:** arrastra esta carpeta entera (o los 7 archivos) a una conversación nueva con Claude Design. Luego pégale el contenido de `01-BRIEF.md` como primer mensaje.

## Archivos en este bundle

| # | Archivo | Para qué |
|---|---------|----------|
| 00 | `00-README.md` | Este archivo (instrucciones para el usuario humano — NO para Claude Design) |
| 01 | `01-BRIEF.md` | **Prompt principal** a pegar en Claude Design. Lo que debe hacer con los otros archivos. |
| 02 | `02-pedidos-baseline.html` | El mock Pedidos anterior de Claude Design (425 líneas). Punto de partida para refinar. |
| 03 | `03-crm-validated.html` | Mock CRM Contactos ya validado + implementado en prod con 89% coverage. Patrón hermano — heredar clases CSS de acá. |
| 04 | `04-colors_and_type.css` | Tokens editorial v2.1 (colors + typography). Única paleta permitida. |
| 05 | `05-theme-editorial-current.css` | El bloque `.theme-editorial` CURRENT en morfx/globals.css (692 líneas). Qué clases ya existen — evitar duplicados. |
| 06 | `06-schema-pedidos.sql` | Tablas Supabase relevantes (`orders`, `pipelines`, etc.). Data model real. |
| LOG | `ITERATION-LOG.md` | Track de cada vuelta del loop. Actualizar aquí después de cada entrega de Claude Design. |

## Workflow recomendado

1. **Primera vez:** arrastra todo a Claude Design + pega BRIEF. Pídele v1 del mock refinado.
2. **Cada vuelta:**
   - Guardar el HTML refinado reemplazando `.planning/standalone/ui-redesign-landing/reference/design_handoff_morfx_v2.1/mocks/pedidos.html`
   - Volver acá a Claude Code (morfx repo): "revisa el nuevo `pedidos.html` y dime si hay conflictos técnicos"
   - Si hay: volver a Claude Design con feedback. Si no: approved, arrancar `/gsd-discuss-phase ui-redesign-dashboard-retrofit` para Plan 02.
3. **Actualizar `ITERATION-LOG.md`** después de cada entrega.

## Tips para Claude Design

- **Claude Design NO conoce el codebase morfx** — los archivos del bundle son todo su contexto. Sé específico en el BRIEF si tienes requests adicionales.
- **Pedirle iteraciones pequeñas** (1-2 secciones por vuelta) produce mejor fidelidad que pedirle todo de una.
- **Reutilizar clases CSS del CRM hermano** es clave para coherencia. Si Claude Design agrega clases nuevas, tiene que justificar por qué no bastaba con las existentes.
- Si Claude Design rompe una constraint técnica (ej. usa shadcn, usa Tailwind arbitrary, usa color fuera paleta), pégale el BRIEF otra vez y señala el bullet específico.

---

**Bundle generado 2026-04-24 — Plan 02 Pedidos retrofit prep.**
