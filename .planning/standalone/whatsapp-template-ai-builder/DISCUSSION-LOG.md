# WhatsApp Template AI Builder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisiones canónicas están en `CONTEXT.md` — este log preserva las alternativas consideradas.

**Date:** 2026-04-20
**Project:** whatsapp-template-ai-builder (standalone)
**Areas discussed:** UX del builder, Detección de variables, Mapping, Alcance de componentes, Categorías e idiomas, Upload de imagen, Ubicación UI, Estado del bug de imágenes

---

## UX del builder

### Q1 — ¿Chat puro o form híbrido?

| Option | Description | Selected |
|--------|-------------|----------|
| Chat puro conversacional tipo sandbox | Usuario describe y la IA arma todo; sin campos editables visibles | |
| Form híbrido — campos a la izquierda + chat a la derecha | División visual clásica para estructuras fijas | |
| Form híbrido — chat a la izquierda + preview visual WhatsApp + campos a la derecha | Chat explicativo; preview live de burbuja + campos editables | ✓ |

**User's choice:** "b. a la derecha visual de como se veria en el chat+opcion de llenar los campos y a la izquierda explicativo"
**Notes:** Claude recomendó form híbrido. Usuario refinó la disposición: el chat queda a la IZQUIERDA (rol educativo/explicativo) y el panel DERECHO combina preview visual de la burbuja WhatsApp con campos editables. Decisión registrada como D-01.

---

## Detección de variables

### Q2 — ¿Usuario escribe `{{1}}` o la IA detecta lenguaje natural?

| Option | Description | Selected |
|--------|-------------|----------|
| Usuario escribe `{{1}}`, `{{2}}` manual y la IA explica qué son | Modelo mental Meta explícito desde el input | |
| Usuario escribe natural y la IA convierte a `{{N}}` | "Hola [nombre]" o "Hola ()" → IA lo vuelve `{{1}}` | ✓ |

**User's choice:** "b eso de [[]] no lo entiende la mayoria de persona, la ia le tiene que ayudar a entender las variables, puede aceptar cosas como 'hola x' o 'hola ()' cmo el usuario lo escriba, la ia lo guia"
**Notes:** Usuario enfático en que la sintaxis Meta (`{{}}`) es barrera cognitiva. Decisión: la IA acepta cualquier notación que el usuario use ("()", "[nombre]", "x", descripción en el chat) y traduce a formato Meta en el preview final. Registrado como D-03.

---

## Mapping de variables

### Q3 — ¿Se captura el mapping en el builder o después?

| Option | Description | Selected |
|--------|-------------|----------|
| Se captura al crear en el builder | IA ya entendió la semántica; la mapea ahí mismo a `contact.name` etc. | ✓ |
| Se deja vacío y se configura al enviar | Template neutro; mapping se elige por automation/contexto | |

**User's choice:** "A"
**Notes:** Ninguna. Registrado como D-04.

---

## Alcance de componentes

### Q4 — ¿Qué componentes entran en el standalone?

| Option | Description | Selected |
|--------|-------------|----------|
| TEXT header + IMAGE header + Body + Footer + Buttons + VIDEO/DOCUMENT | Scope máximo | |
| TEXT header + IMAGE header + Body + Footer + Buttons | Scope sin video/documento | |
| TEXT header + IMAGE header + Body + Footer (sin botones, sin video/documento) | Scope mínimo viable; botones luego | ✓ |

**User's choice:** "4 ok sollo image y botones luego"
**Notes:** Solo IMAGE (más TEXT por defecto). Botones quedan para un standalone posterior. VIDEO/DOCUMENT fuera de alcance. Registrado como D-05, D-06, D-07.

---

## Categorías e idiomas

### Q5 — ¿Cuántas categorías e idiomas soportar?

| Option | Description | Selected |
|--------|-------------|----------|
| Las 3 categorías (MARKETING/UTILITY/AUTHENTICATION) + idiomas actuales `es`/`en_US` | Scope actual sin cambios | |
| Las 3 categorías + agregar `es_CO` + IA ayuda a identificar la pertinente | Completo + soporte regional Colombia + guía IA | ✓ |

**User's choice:** "todas, que la ia le ayude a identificar cual es la pertinente"
**Notes:** Usuario eligió todas las categorías explícitamente. Claude incluyó también agregar `es_CO` dado el contexto Colombia del proyecto. Registrado como D-08, D-09.

---

## Upload de imagen

### Q6 — ¿Qué endpoint de 360 Dialog usar para subir la imagen del template?

| Option | Description | Selected |
|--------|-------------|----------|
| `/v1/media` (temporal) | ID temporal, usado para envío de mensajes | |
| `/v1/uploads` (resumable upload, handle permanente) | Handle permanente aceptado por Meta para aprobación de template | Claude a confirmar |
| Tú decides durante research | Claude investiga docs oficiales y decide | ✓ |

**User's choice:** "decide tu lo mas pertinente"
**Notes:** Usuario delegó. Claude confirmará en research-phase contra docs oficiales de 360 Dialog. Hipótesis de trabajo: `/v1/uploads` (resumable) es el correcto porque los handles deben ser permanentes para el proceso de aprobación de Meta. Registrado como D-10, D-11, D-12 (con la hipótesis marcada explícitamente para confirmar).

---

## Ubicación UI

### Q7 — ¿Dónde vive el builder en la navegación?

| Option | Description | Selected |
|--------|-------------|----------|
| Nueva ruta `/configuracion/whatsapp/templates/builder` — coexiste con form viejo | Ruta específica del dominio template | |
| Reemplaza el form manual actual en `/nuevo` | Único camino de creación | |
| Botón en la parte superior de `/configuracion` (hub) para acceso rápido + coexiste con form viejo | CTA destacado; eventualmente builder genérico de configs | ✓ |

**User's choice:** "el builder debe ir en /configuracion un boton en la parte superior, eventualmente la idea es que sirva para todas las configuraciones pero actualmente solo esta creada la funcion de templates(ponerlo ahi por acceo rapido)"
**Notes:** Decisión arquitectónica relevante: el builder no es solo para templates en la visión del usuario, sino que debe ser el germen de un **builder genérico de configuraciones** del workspace. En este standalone se implementa únicamente el generador de plantillas de WhatsApp, pero la UI se ubica en la raíz de `/configuracion` (botón/CTA superior) preparando el terreno para que en el futuro ofrezca más tipos (tags, pipelines, etc.). Registrado como D-02.

---

## Estado del bug de imágenes en templates

### Q8 — ¿Hay que arreglar el bug o ya funciona?

| Option | Description | Selected |
|--------|-------------|----------|
| Ya funciona, solo construimos el builder encima | No hay gap técnico pendiente | |
| El bug sigue existiendo, hay que arreglarlo como parte del standalone | Gap real en el CREATE | ✓ (tras investigación) |
| Solo funciona en producción por fix directo en 360 Dialog portal | Sin código que cubra el CREATE | |

**User's choice:** "ya estan arreglados, revisa porque ya se envian con imagen pero mira bien (no recuerdo cual fue el fix, quizas fue directo en 360 dialog)"
**Notes:** Usuario pidió verificación. Claude investigó git log + código actual y confirmó:
- ✅ **SEND** de templates con header IMAGE sí fue arreglado en código (commit `acffa6e` del 2026-04-12 — `src/app/actions/messages.ts:465` ahora incluye el componente HEADER en el payload a Meta).
- ❌ **CREATE** de templates con header IMAGE **no existe en código** — la UI actual solo tiene inputs TEXT, la action `createTemplate` no sube media ni escribe `header_handle`. Los templates con imagen activos hoy fueron creados en el portal 360 Dialog manualmente.
- ➡️ Este standalone implementa lo faltante: upload del archivo + persistencia del handle + `createTemplate360()` con header IMAGE bien formado. Registrado como D-16, D-17.

---

## Decisiones puestas a discreción de Claude

- **Endpoint exacto de upload** a 360 Dialog (`/v1/uploads` vs `/v1/media`) — confirmar en research contra docs oficiales (D-10)
- **Naming interno**: ruta del builder, endpoint de chat, nombres de tools del agente IA (D-13, Claude's discretion en CONTEXT)
- **Validaciones y límites de archivo**: tamaño máximo, formato, dimensiones (D-12)
- **Estrategia de retries / errores** al hablar con 360 Dialog
- **Orden de commits atómicos** durante execute-phase
