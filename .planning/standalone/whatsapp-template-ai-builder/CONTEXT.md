# WhatsApp Template AI Builder - Context

**Gathered:** 2026-04-20
**Status:** Ready for research/planning
**Type:** Standalone (no phase number)

<domain>
## Phase Boundary

Construir un **builder guiado por IA** para crear plantillas de WhatsApp y someterlas a 360 Dialog (y de ahí a Meta) como si se crearan manualmente desde el portal. El builder vive dentro del módulo de configuración del workspace y está pensado para extenderse eventualmente a otras configuraciones, pero en este standalone el único generador implementado es el de plantillas de WhatsApp.

Alcance fijo:

1. **UI nueva** en `/configuracion/whatsapp/templates/builder` (o ruta equivalente) con layout híbrido: panel izquierdo = chat conversacional con IA explicativa; panel derecho = preview visual tipo burbuja WhatsApp + campos editables del template.
2. **Punto de entrada rápido** desde la pantalla principal de `/configuracion` (botón/CTA superior) para acceder al builder sin navegar por el submenú de WhatsApp.
3. **Detección natural de variables**: el usuario escribe el cuerpo en lenguaje natural (ej: `"Hola (), tu pedido X llega mañana"` o `"Hola nombre"`) y la IA lo transforma a sintaxis `{{1}}`, `{{2}}`, etc., explicando cada variable en el chat y capturando su mapping (`{{1}}` → `contact.name`, `{{2}}` → `order.number`, etc.) como parte del flujo.
4. **Soporte completo de header IMAGE** (el gap que impedía crear templates con imagen desde la UI):
   - Upload del archivo al endpoint correcto de 360 Dialog (a confirmar en research: `/v1/uploads` resumable API vs `/v1/media`) y obtención del handle permanente.
   - Persistencia del handle en `components[].example.header_handle[0]` al crear el template.
   - Preview de la imagen en la burbuja derecha para el usuario.
5. **Recomendaciones de IA durante el flujo**: la IA identifica y sugiere la **categoría** más apropiada (MARKETING / UTILITY / AUTHENTICATION) según el contenido, el **idioma** correcto (incluyendo `es_CO` además de `es` y `en_US`), y flaggea posibles razones de rechazo de Meta antes del submit.
6. **Submit a 360 Dialog** via `createTemplate360()` existente (`src/lib/whatsapp/templates-api.ts:47`) con el componente HEADER IMAGE correctamente poblado. Estado inicial `PENDING` + `submitted_at` se guarda en `whatsapp_templates`.
7. **Reutilización del patrón del Automation Builder**: base técnica en `src/app/(dashboard)/automatizaciones/builder/` — AI SDK v6 `useChat` + `DefaultChatTransport`, endpoint `/api/builder/chat`. Se crea un endpoint equivalente `/api/config-builder/templates/chat` (o similar) con su propio system prompt y tools.

**Fuera de alcance (deferred):**
- Botones (QUICK_REPLY / URL / PHONE_NUMBER) — quedan para un standalone futuro
- Headers tipo VIDEO y DOCUMENT — solo IMAGE en este entregable
- Extensión del builder a otras configuraciones del workspace (tags, pipelines, etapas, etc.) — el layout y endpoint se dejan preparados para crecer, pero solo se implementa el generador de templates
- Migración/re-subida de templates legacy que fueron creados manualmente en el portal de 360 Dialog (los viejos que ya tienen URLs en vez de handles se dejan tal cual; el envío ya funciona para ellos desde el fix `acffa6e`)
- Edición post-submit de un template ya enviado a Meta (limitación de 360 Dialog/Meta: solo se puede eliminar y recrear)
- Deprecación del form manual actual en `/configuracion/whatsapp/templates/nuevo` — coexiste con el builder mientras se valida; se elimina en un standalone posterior

</domain>

<decisions>
## Implementation Decisions

### UX del Builder
- **D-01:** Layout híbrido **dos paneles**: izquierdo = chat conversacional con IA (explicativo, educativo sobre variables y decisiones); derecho = **preview visual tipo burbuja WhatsApp en tiempo real** + campos editables (nombre, categoría, idioma, body, footer, header image). El preview se actualiza en cada mensaje/cambio. Justificación: templates son estructurados — form puro pierde guía; chat puro no muestra el resultado visual.
- **D-02:** Punto de entrada: **botón/CTA en la parte superior de `/configuracion`** (pantalla hub de configuración) que lleva al builder. Adicionalmente queda accesible desde `/configuracion/whatsapp/templates` (lista) con un botón "Crear con IA" junto al botón existente de "Crear manual". El builder coexiste con el form manual actual durante este standalone.

### Detección de Variables
- **D-03:** **IA acepta lenguaje natural** y transforma a sintaxis Meta. El usuario puede escribir `{{1}}`, `()`, `[nombre]`, o simplemente describir el campo en el chat; la IA normaliza al formato `{{N}}` en el preview/template final. **No se le pide al usuario que escriba `{{}}`** — la IA le explica en el chat qué es una variable, por qué existe, y cómo se rellena al enviar.
- **D-04:** **Mapping de variables se captura dentro del builder.** Cuando la IA detecta "nombre del cliente", pregunta o infiere si corresponde a `contact.name`, `contact.first_name`, etc., y guarda el mapping en `variable_mapping` JSONB de `whatsapp_templates` al momento de crear. Justificación: si la IA ya entendió la semántica del campo, redundante pedir al usuario mapearlo después.

### Alcance de Componentes
- **D-05:** **Header soportado: TEXT e IMAGE.** VIDEO y DOCUMENT quedan fuera de este standalone.
- **D-06:** **Body, Footer: soportados.** Body es obligatorio (validación Meta); footer opcional.
- **D-07:** **Botones: NO en este standalone.** Quedan para un standalone dedicado posterior. El schema JSONB ya los soporta, pero ni la UI ni el flujo del builder los manejan.

### Categorías e Idiomas
- **D-08:** **Las 3 categorías disponibles**: MARKETING, UTILITY, AUTHENTICATION. La IA **recomienda la categoría** según el contenido (ej: promo → MARKETING, confirmación pedido → UTILITY, OTP → AUTHENTICATION). Usuario puede sobrescribir la recomendación.
- **D-09:** **Idiomas**: `es`, `en_US` (actuales) + **agregar `es_CO`**. La IA recomienda idioma según el texto (español de Colombia si detecta colombianismos; `es` genérico en otro caso). Usuario puede sobrescribir.

### Upload de Imagen a 360 Dialog
- **D-10:** **Endpoint de upload: a confirmar en research-phase.** Hipótesis: `/v1/uploads` (resumable upload API) porque genera un handle **permanente** que Meta acepta como referencia durante la aprobación del template. `/v1/media` usa IDs temporales válidos solo para envío de mensajes, NO para creación de templates. Research confirma esto contra docs oficiales de 360 Dialog antes de planear.
- **D-11:** **Flujo del upload:** usuario selecciona archivo en el panel derecho → se sube a Supabase Storage (staging, para preview inmediato y recuperación en caso de retry) → al momento de submit del template, se re-sube (o reutiliza vía fetch) a 360 Dialog `/v1/uploads` → handle devuelto se escribe en `components[].example.header_handle[0]` → `createTemplate360()` se llama con payload completo.
- **D-12:** **Validaciones del archivo**: formato (jpg/png), tamaño máximo (límite 360 Dialog a confirmar en research, típicamente 5 MB para IMAGE), dimensiones mínimas recomendadas. La IA explica errores al usuario en el chat.

### Base Técnica
- **D-13:** **Reutilización del Automation Builder** como base arquitectónica. Se clona el patrón de `src/app/(dashboard)/automatizaciones/builder/` (AI SDK v6 `useChat`, `DefaultChatTransport`, endpoint POST `/api/builder/chat` con `sessionId`) a un endpoint nuevo para templates. Ubicación sugerida: `/api/config-builder/templates/chat` (deja espacio para futuros `/api/config-builder/<tipo>/chat`). System prompt dedicado al dominio de templates + tools específicas (`capture_template_info`, `generate_template_preview`, `suggest_category`, `upload_header_image`, `submit_template`). Nombres finales los define Claude en planning.
- **D-14:** **Domain layer**: toda mutación de `whatsapp_templates` pasa por un nuevo módulo `src/lib/domain/whatsapp-templates.ts` (Regla 3 del proyecto). El server action / tool handler llama al domain, que a su vez llama a `createTemplate360()` + inserta en DB. La action actual `createTemplate` (`src/app/actions/templates.ts:129`) se refactoriza para llamar al nuevo domain (el form manual sigue funcionando pero va por el mismo camino).
- **D-15:** **Agente scope**: el AI del builder es un asistente conversacional, NO un agente con acceso a herramientas destructivas. Solo puede crear templates (no editar, no eliminar, no tocar otras configuraciones del workspace). Se registra en `.claude/rules/agent-scope.md` como `config-builder-whatsapp-templates` con el scope apropiado.

### Bug de Imágenes en Templates
- **D-16:** **Estado real documentado:**
  - ✅ **SEND** de templates con header IMAGE ya funciona (fix commit `acffa6e` del 2026-04-12 en `src/app/actions/messages.ts:465`).
  - ❌ **CREATE** de templates con header IMAGE **nunca se implementó en el código**: la UI actual (`template-form.tsx`) solo captura TEXT; la action `createTemplate` no sube media ni escribe `header_handle`; los templates con imagen que existen hoy fueron creados manualmente desde el portal de 360 Dialog.
- **D-17:** **Este standalone cierra la brecha de CREATE** implementando el flujo completo de upload + `header_handle` + `createTemplate360()`. No se toca el flujo de SEND (ya funciona). No se migran templates legacy.

### Claude's Discretion
- Nombre final de la ruta del builder (`/configuracion/whatsapp/templates/builder` vs otro)
- Nombre final del endpoint de chat (`/api/config-builder/templates/chat` vs otro)
- Nombres de tools del agente IA
- Estrategia de upload intermedio (Supabase Storage obligatorio vs opcional)
- Sistema de errores/reintentos al hablar con 360 Dialog
- Orden de commits durante execute-phase
- Validación de límites de caracteres por componente (Meta impone 60 char en header TEXT, 1024 en body, 60 en footer) — implementación concreta

</decisions>
