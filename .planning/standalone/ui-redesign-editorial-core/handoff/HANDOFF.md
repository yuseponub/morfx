# Handoff a Claude Code — morfx (estilo editorial)

Objetivo: que la implementación en el código real (Next.js + Tailwind + shadcn) quede
**idéntica** a los mocks que validamos. Estos mocks son la **fuente de verdad visual**.

## 1. Archivos de referencia (adjuntar TODOS al prompt)

| Vista | Archivo mock | Componente/ruta real destino |
|---|---|---|
| Sistema (tokens + clases) | `ui_kits/crm/crm-editorial.html` (bloque `<style>` con `.theme-editorial`) | `src/app/globals.css` |
| CRM · Contactos | `ui_kits/crm/crm-editorial.html` | `app/(dashboard)/crm/contactos` |
| Pedidos · Tabla + Kanban | `ui_kits/pedidos/pedidos-editorial.html` | `app/(dashboard)/crm/pedidos` |
| WhatsApp · Conversaciones | `ui_kits/conversaciones/index.html` | `app/(dashboard)/whatsapp` |
| Logo | `ui_kits/crm/logo-morfx.png` | `public/logo-morfx.png` |

## 2. Regla de oro para Claude Code

> Usa EXCLUSIVAMENTE los tokens (`--ink-*`, `--paper-*`, `--rubric-*`, `--space-*`, `--fs-*`)
> y las clases (`.sb`, `.btn`, `.tg`, `table.dict`, `.mx-*`, `.chip`, `.tabs`, etc.) tal como
> están definidos en el bloque `.theme-editorial`. No inventes colores ni tamaños fuera de la
> escala. El HTML semántico de cada mock se traduce 1:1 a JSX conservando las clases idénticas.

## 3. Pasos concretos

1. **Tokens:** copiar el bloque `.theme-editorial { … }` (variables + utilidades `.mx-*` +
   componentes `.sb/.btn/.tg/table.dict/.tabs/.chip/.search/.toolbar`) a `globals.css`.
   Incluir el override de **modo oscuro** `.theme-editorial.dark { … }` y la regla del logo
   `.theme-editorial.dark .wm img{mix-blend-mode:screen;filter:invert(1) hue-rotate(180deg)}`.
2. **Layout estándar (no cambiar):**
   - Sidebar continuo, mismo fondo que la app (sin barra separadora).
   - `.brand{height:84.6px}` → estándar: centra el selector de workspaces con la banda de
     cabecera de cada módulo. Mantener en TODAS las vistas.
   - Logo como `<img src="/logo-morfx.png">` 120px, `mix-blend-mode:multiply` en claro.
   - Selector de workspaces (`.ws`) 51px, justo bajo el logo.
   - Las dos líneas divisorias (header + tabs) se centran con el selector de workspaces.
3. **Sidebar real (orden y titulares):**
   `Operación`: CRM · WhatsApp · Pedidos · Tareas · Confirmaciones · SMS
   `Automatización`: Automatizaciones · Agentes · Comandos
   `Análisis`: Analytics
   `Admin`: Sandbox · Equipo · Configuración
   Cada titular `.cat` lleva bullet rojo (`--rubric-2`) y font-size 11.2px.
4. **Por vista:** reproducir el JSX desde el HTML del mock respectivo (tablas `dict`, kanban con
   líneas entre stages —sin cajas—, inbox de 3 columnas, burbujas con `font-family:'Helvetica Neue'`,
   card de pedido como card, etc.). Conectar a datos reales sin tocar las clases.
5. **Modo oscuro:** togglear `dark` en el contenedor raíz (`.theme-editorial`) — ya lo controla
   `next-themes`; mapear `theme==='dark'` → clase `dark`.

## 4. Qué pedirle a Claude Code (prompt sugerido)

> "Adjunto los mocks HTML de morfx (carpeta `ui_kits/`) que son la fuente de verdad visual.
> Migra `globals.css` con el bloque `.theme-editorial` (claro + `.dark`) verbatim, y reescribe
> los componentes de CRM/Contactos, CRM/Pedidos (tabla + kanban) y WhatsApp/Conversaciones para
> que rendericen EXACTAMENTE como los mocks, usando las MISMAS clases. No inventes colores ni
> tamaños fuera de la escala de tokens. Mantén el estándar de altura del selector de workspaces
> (`.brand height:84.6px`) y el sidebar con la estructura indicada."

## 5. Checklist de verificación (pídele que confirme cada uno)
- [ ] Fondo blanco-papel neutro (no beige) con grano sutil; sidebar continuo.
- [ ] Logo correcto en claro (punto rojo) y en oscuro (letra blanca, punto rojo, sin caja).
- [ ] Selector de workspaces a la altura estándar en todas las vistas.
- [ ] Líneas header/tabs centradas con el selector.
- [ ] Tags (`.tg`, AGENTE, P/W, RECO, C) alineados y con los colores de la escala.
- [ ] Kanban: líneas entre stages, sin cajas; cards sueltas; "Sin pedidos" en vacías.
- [ ] Burbujas de chat en Helvetica Neue; card de pedido es card.
- [ ] Scrollbars finos, sin flechas; sin scroll horizontal indebido.
- [ ] Modo oscuro charcoal cálido con toggle persistente.
