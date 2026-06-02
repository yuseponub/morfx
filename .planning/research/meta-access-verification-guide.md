# Meta App Review / Access Verification — Bible Operativa MorfX

**Fecha:** 2026-05-07
**Caso de uso:** MorfX SaaS multi-tenant (CRM + WhatsApp + agentes AI) que necesita recibir/responder FB Messenger + Instagram DM de las páginas/cuentas de sus clientes B2B.
**Estado actual:** Meta App + dominio + webhook infra funcionando para WhatsApp Cloud API. **Sin BV. Sin Access Verification.**
**Permisos objetivo:**
- `pages_messaging`, `pages_messaging_subscriptions`
- `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`
- `instagram_basic`, `instagram_manage_messages`
- `business_management`

---

## TL;DR ejecutivo

1. **Multi-tenant = Advanced Access obligatorio** (renombrado **"Full Access"** desde 2026-05-04 en la UI). Standard Access solo permite operar contra páginas/cuentas que TÚ administras directamente, no las de tus clientes.
2. **Advanced Access tiene 2 gates en serie**: (a) **Business Verification** (1-14 días, depende de auto/manual), (b) **App Review por permiso** (1-3 semanas por ciclo, suele rebotar 1-2 veces antes de aprobar).
3. **El video screencast es lo que más rechazan.** Cada permiso necesita su propio screencast mostrando el flujo end-to-end: login → consent → uso → resultado. Sin audio, en inglés (o subtítulos), 1080p, mouse grande.
4. **Para multi-tenant: usar Facebook Login for Business + System Users.** El usuario final del cliente le da consent a TU app sobre SU página/IG; tú almacenas un **page access token** + **system user token** por workspace.
5. **No existe "Embedded Signup" para FB Pages/IG igual que WhatsApp** — usas **Facebook Login for Business** con configuración guardada en Meta. Es similar pero un setup diferente.
6. **Documentos legales NO negociables antes de submit:** Privacy Policy URL pública (carga rápido), Data Deletion Callback URL **o** Data Deletion Instructions URL, Terms of Service, ícono 1024×1024 sin trademarks.
7. **Test users**: Meta dejó de usar test users dedicados (sept 2023). Ahora usan cuentas dummy con 2FA. Tienes que proveerles credenciales de una cuenta dummy que sea admin de la página/IG de prueba.
8. **Paralelismo:** **NO se puede submittear App Review sin BV completa** para los permisos avanzados — son secuenciales, no paralelos. Por eso BV se arranca **HOY**.
9. **Ciclos típicos de rechazo:** P50 = 1 rechazo + resubmit, P90 = 2-3 rechazos. Cada rechazo añade 3-7 días.
10. **No hay costos directos** del App Review. Sí los hay del notarizado/traducción de docs si BV pide traducción al inglés.

---

## 1. Arquitectura del proceso (orden secuencial obligatorio)

```
[Meta Business Account] → [Business Verification (BV)] → [Data Use Checkup] → [App Settings completos] → [Permissions seleccionados] → [App Review submission por permiso] → [Aprobación] → [Switch app a Live Mode]
```

**Nota crítica:** BV es **prerequisito** para Advanced Access desde feb 2022. Sin BV, no puedes ni siquiera _solicitar_ permisos avanzados — el botón "Request Advanced Access" estará deshabilitado.

### 1.1 Tiers de acceso (terminología 2026)

| Tier | Renombre 2026-05-04 | Quién puede usarlo | BV requerida | App Review requerida |
|---|---|---|---|---|
| **Standard Access** | Standard Access | Solo usuarios con rol en la app (admins, devs, testers) | No | No |
| **Advanced Access** | **Full Access** (UI nueva) | Cualquier usuario externo (clientes reales) | Sí | Sí (por permiso) |

[Source: developers.meta.com/blog/updates-to-ads-management-standard-access-feature](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)

> "Standard Access grants access to assets and data that a developer's business or anyone with a role on their app owns. Advanced Access allows access to data owned by other businesses or people."

Para MorfX (multi-tenant B2B): **Advanced Access / Full Access es OBLIGATORIO** en TODOS los permisos. No hay atajo.

---

## 2. Business Verification (BV) — Gate 1

### 2.1 Documentos requeridos (al menos UNO de cada categoría)

**Categoría A — Existencia legal del negocio** (al menos uno):
- Certificado de existencia y representación legal (Cámara de Comercio)
- RUT (Registro Único Tributario) — DIAN
- Licencia comercial o estatutos sociales

**Categoría B — Dirección/teléfono comercial** (al menos uno con tu nombre legal coincidente):
- Recibo de servicios públicos a nombre de la empresa (≤90 días)
- Estado de cuenta bancario corporativo
- Factura de proveedor con dirección

**Pitfall crítico (Colombia):**
- El nombre legal del documento debe coincidir EXACTAMENTE con el "Legal business name" en Meta Business Manager. **Cualquier variación (puntuación, "S.A.S." vs "SAS", tildes) puede causar rechazo automático.** El revisor automatizado busca string match exacto.
- Si los documentos están en español, Meta puede aceptarlos sin traducción, pero algunos revisores piden traducción jurada al inglés. **Prepara traducciones por si acaso.**

### 2.2 Timeline real de BV

| Vía | Tiempo | Probabilidad |
|---|---|---|
| Auto-aprobación | ~10 minutos | Si tus docs hacen match perfecto y tu negocio ya existe en datasets de Meta |
| Manual (rápido) | 3-7 días hábiles | Caso típico cuando docs limpios |
| Manual (lento) | 7-14 días hábiles | Si hay clarification requests |
| Múltiples ciclos | 2-4 semanas | Si rebotan 1-2 veces |

[Source: agrowth.io/blogs/facebook-ads/how-to-verify-your-business-on-meta](https://agrowth.io/blogs/facebook-ads/how-to-verify-your-business-on-meta)

### 2.3 Pasos para arrancar BV HOY

1. Ir a **business.facebook.com → Business Settings → Business Info → Verify**
2. Completar perfil: legal business name, address, phone, website
3. Subir documentos categoría A + B
4. Verificar email/teléfono de la empresa
5. Esperar veredicto

**Truco anti-rechazo:** Si tienes opción "verify by phone call" o "verify by email", úsala. Es más rápida y deja un trail digital limpio.

---

## 3. Data Use Checkup (DUC) — Gate 1.5

Una vez BV aprobada, **antes** de pedir Advanced Access, completas el DUC. Es un cuestionario sobre cómo manejas data.

> "Developers will need to renew their certification on an annual basis." — [docs actualizadas 2026-01-02](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/data-use-checkup/tutorial/)

**Qué pregunta:**
- ¿Compartes data con terceros? (con quiénes, propósito)
- ¿Cómo proteges la data? (encryption at rest/in transit)
- ¿Cuánto tiempo retienes data? (justificación)
- ¿Qué haces cuando un usuario solicita borrado?
- ¿Qué pasa con la data si el usuario desinstala?

**Pitfall MorfX:** Si tu Privacy Policy dice algo y tu DUC responde otra cosa, te rechazan ambos. **Sincroniza Privacy Policy ↔ DUC ↔ Data Deletion Instructions verbatim antes de submittear.**

---

## 4. App Settings completos — Pre-submit checklist

Antes de poder submittear App Review, **TODO** esto debe estar configurado en **App Dashboard → Settings → Basic**:

### 4.1 Branding & metadata

- [ ] **App icon**: PNG 1024×1024, sin trademarks, sin logos de Meta
- [ ] **App display name**: descriptivo, sin "Meta" / "Facebook" / "Instagram" en el nombre
- [ ] **App namespace**: short, lowercase, único
- [ ] **Category**: para MorfX → **"Business and Pages"** o **"Communication"**
- [ ] **Subcategory**: "CRM" o "Customer Support"
- [ ] **App description**: 200-500 palabras explicando que MorfX es CRM B2B con automatizaciones AI, multi-canal, multi-tenant

### 4.2 URLs públicas (TODAS deben cargar <3s, sin login, sin paywall)

- [ ] **Privacy Policy URL**: ej. `https://morfx.app/privacy` (debe mencionar específicamente FB/IG data, retention, deletion)
- [ ] **Terms of Service URL**: ej. `https://morfx.app/terms`
- [ ] **Data Deletion Callback URL** *(recomendado)*: webhook `POST` que Meta llama cuando user solicita borrado. Devuelve `{ url: "...", confirmation_code: "..." }`. Implementación: ver §11.2.
  - **Alternativa más simple:** **Data Deletion Instructions URL** — página estática que explica cómo el usuario solicita deletion (ej. email a privacy@morfx.app). Requiere endpoint humano que cumpla en <30 días.
- [ ] **App Domains**: `morfx.app` (debe coincidir con domain verification de WhatsApp ya hecho)
- [ ] **User Support Email**: monitored, no autorespond
- [ ] **Marketing URL** (opcional pero recomendado): landing page de FB/IG integration

### 4.3 Platform configuration

- [ ] **Website**: añadir `morfx.app` con la URL de la app
- [ ] **Site URL** del Login: ej. `https://morfx.app/integrations/meta`
- [ ] **Valid OAuth Redirect URIs**: lista exhaustiva (preview deployments NO van aquí)

### 4.4 Webhook subscriptions

- [ ] **Messenger Platform** webhook configurado: `messages`, `messaging_postbacks`, `messaging_optins`, `messaging_referrals`
- [ ] **Instagram** webhook configurado: `messages`, `messaging_optins`, `messaging_postbacks`, `messaging_reactions`, `messaging_referrals`, `messaging_seen`
- [ ] Webhook responde **200 OK en <20s** (Meta hard timeout) — usa `inngest.send` await pattern como WhatsApp
- [ ] Verify token configurado y testeado

### 4.5 Roles

- [ ] App admin = tu cuenta personal
- [ ] **Cuenta dummy** creada con 2FA (ver §10) y agregada como tester o developer
- [ ] La dummy admin a un FB Page de prueba + IG Business account de prueba

[Source: developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)

---

## 5. Permisos requeridos — Detalle por permiso

| Permiso | Necesario para | Review | Notas críticas |
|---|---|---|---|
| `pages_show_list` | Listar páginas que el cliente administra durante OAuth | **Sí** Advanced | Justify: "to display Pages user can connect to MorfX" |
| `pages_manage_metadata` | Suscribir webhook + leer config de la página | **Sí** Advanced | Justify: "subscribe to messaging webhooks for connected Pages" |
| `pages_read_engagement` | Leer perfil del cliente final que envió mensaje | **Sí** Advanced | Justify: "fetch sender profile (name, profile pic) for CRM contact creation" |
| `pages_messaging` | **Recibir + enviar mensajes en Messenger** | **Sí** Advanced | El permiso clave. Ver §6.1 para descripción modelo |
| `pages_messaging_subscriptions` | Mensajes proactivos fuera del 24h window con tags permitidos | **Sí** Advanced **+ extra justification** | Solo necesario si vas a hacer notificaciones outbound. Si no, **no lo pidas** (over-permissioning rechaza) |
| `instagram_basic` | Conectar IG Business account | **Sí** Advanced | Bundled con `pages_show_list` típicamente |
| `instagram_manage_messages` | **Recibir + enviar DMs Instagram** | **Sí** Advanced | El permiso clave de IG. Notar: depende de Facebook Login (si usas Instagram Login API directo, el permiso se llama `instagram_business_manage_messages`) |
| `business_management` | Operar como Tech Provider para múltiples businesses | **Sí** Advanced | Justify: "manage assets on behalf of customer businesses (multi-tenant SaaS)" |

[Source: developers.facebook.com/docs/permissions/](https://developers.facebook.com/docs/permissions/)

### 5.1 Permisos opcionales que probablemente NO necesitas (no los pidas)

- `human_agent` — para responder fuera de 24h con humano (7-day window). Solo si tu UI tiene operadores humanos respondiendo manualmente fuera del window. **AI bot != human agent.** Si MorfX solo usa AI, NO pidas esto, te rechazan.
- `pages_manage_engagement` — para reaccionar/comentar posts. No aplica.
- `pages_manage_posts` — para publicar posts. No aplica al caso CRM.

> "Apps were rejected with the message: 'We have determined that your app's use case for the requested permission is invalid or is not needed to support its core functionality.'" — [Storrito Instagram API 2026](https://storrito.com/resources/Instagram-API-2026/)

---

## 6. App Review submission — descripciones por permiso

Meta exige **descripción única por permiso**. **No copy-paste.** Cada descripción responde 4 preguntas:

1. ¿Cómo ayuda al usuario final (cliente B2B de MorfX)?
2. ¿Por qué la app la necesita?
3. ¿Cómo usa la app la data accedida?
4. ¿Por qué sería menos útil sin ella?

### 6.1 Plantilla para `pages_messaging`

```
MorfX is a multi-tenant CRM SaaS used by businesses (our customers) to manage
their end-customer conversations across WhatsApp, Facebook Messenger, and
Instagram Direct. Our customers are small/medium businesses (e.g. dental
clinics, e-commerce stores, sleep-product retailers) who connect their
existing Facebook Page to MorfX during onboarding via Facebook Login for
Business.

We need pages_messaging because the core functionality of MorfX is to:
1. Receive inbound Messenger messages from end-customers via webhook
2. Display the message in the connected business's CRM inbox
3. Allow either an AI agent (configured by the business) or a human operator
   to reply to the conversation within the 24-hour standard messaging window
4. Persist message history scoped to the business's workspace for analytics
   and follow-up

Without pages_messaging, our customers cannot consolidate their Messenger
conversations into MorfX's unified CRM inbox, defeating the core value
proposition of the product. The end-customer initiating the conversation
gives implicit consent by messaging the Page; only the connected business
(via OAuth consent during page connection) authorizes MorfX to access
their Page's conversations.

We do not use pages_messaging for marketing/promotional outreach, broadcast
messages, or any prohibited message types. All replies happen within the
24-hour customer service window initiated by the end-customer.
```

### 6.2 Plantilla para `instagram_manage_messages`

```
MorfX customers connect their Instagram Business account (linked to their
connected Facebook Page) during onboarding. We use instagram_manage_messages
to:
1. Receive inbound Instagram Direct messages from end-customers via webhook
2. Render them in the same unified CRM inbox alongside Messenger and WhatsApp
3. Enable AI-agent or human-operator replies within the 24-hour Instagram
   messaging window
4. Persist conversation history scoped to the business's workspace

Identical use case to pages_messaging but for Instagram Direct. Without this
permission, MorfX cannot serve businesses whose customers contact them
primarily on Instagram (e.g. e-commerce, beauty, dental clinics) — they
would have to operate two separate inboxes, breaking the multi-channel
value proposition.

We comply with the 24-hour window rule. We do not use this permission for
proactive outreach, marketing broadcasts, or any prohibited content. The
end-customer initiates the conversation; the business authorizes MorfX
via OAuth consent.
```

### 6.3 Plantilla para `business_management`

```
MorfX is a Tech Provider/Solution Partner SaaS that operates messaging on
behalf of multiple customer businesses (multi-tenant). We have ~[N]
customer businesses on our platform today, each with their own connected
Facebook Page and Instagram Business account.

We need business_management to:
1. Programmatically read which Pages and IG accounts a customer's Business
   Manager has granted us access to during the Facebook Login for Business
   flow
2. Verify that the connected assets are still authorized when our background
   workers run (e.g. when an inbound webhook arrives 30 days after initial
   OAuth)
3. Display the connected business's name and logo in the MorfX UI so
   operators understand which workspace they are operating in

Without business_management, we cannot operate as a multi-tenant SaaS — we
would be limited to operating only on assets owned by MorfX itself, which
is incompatible with our B2B model where customers connect their own assets.
```

### 6.4 Plantillas más cortas para los demás

**`pages_show_list`**: "During onboarding, after Facebook Login for Business, we display the list of Pages the user manages so they can pick which Page to connect to MorfX. We do not store the list beyond the connection step."

**`pages_manage_metadata`**: "After page connection, we subscribe the connected Page to messaging webhooks (`messages`, `messaging_postbacks`) so MorfX receives inbound messages in real-time. No metadata is modified."

**`pages_read_engagement`**: "When an inbound message arrives, we fetch the sender's public profile (name, profile picture, PSID) to create or update the corresponding contact in the connected business's CRM. Only sender-of-the-message profiles are read; we do not bulk-fetch followers."

**`instagram_basic`**: "Required for Facebook Login for Business to access the Instagram Business account linked to the connected Facebook Page. We read username and IG account ID for connection display purposes."

[Source: developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission](https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission) (template tomado del sample para WhatsApp Solution Provider; mismo principio aplica a FB/IG)

---

## 7. Screencasts (videos demo) — sección crítica

> "Most rejections in 2026 stem from incomplete screencasts. Each permission needs its own clear visual proof. If the reviewer cannot replicate your steps using the provided test account, they will deny access." — [getphyllo.com](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)

### 7.1 Especificaciones técnicas del video

| Parámetro | Requisito | Notas |
|---|---|---|
| **Resolución** | 1080p mínimo (Meta dice "ideally 1080 or higher") | 1440p también vale |
| **Ancho monitor durante grabación** | ≤1440px | Si grabas en 4K, el revisor puede no ver bien |
| **Duración** | No hay max oficial. P50 = 2-5min por permiso. | Más corto = mejor, mientras muestres TODO |
| **Audio** | **Omitir.** Reviewers no escuchan. | Si hablas, hazlo en inglés con tu voz NO en el archivo final |
| **Idioma UI** | Inglés ideal. Si no, **subtítulos** en inglés explicando cada acción | App de MorfX está en español → subtitula |
| **Cursor** | Mouse grande, visible. Usa mouse, no keyboard | Macros opcionales para resaltar clicks |
| **Formato** | MP4 H.264. Bajo 1GB típicamente. | OBS/Loom default OK |
| **Login flow** | **Mostrar SIEMPRE de logged-out a logged-in completo.** Incluye OAuth popup de Meta. | Si no muestras el OAuth popup, te rechazan |

[Source: developers.facebook.com/docs/app-review/submission-guide/screen-recordings/](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/)

### 7.2 Estructura del video por permiso (template)

**Duración total ~3-5min. Sin audio. Subtítulos sobreimpresos.**

```
[0:00-0:15]  Subtítulo: "MorfX is a multi-tenant CRM SaaS. This video
             demonstrates how a customer business connects their Facebook
             Page and uses [PERMISSION] for [USE CASE]."

[0:15-0:45]  Logout completo. Mostrar landing morfx.app.
             Click "Sign up" or "Login as customer".
             Subtítulo: "Customer business begins onboarding."

[0:45-1:30]  Click "Connect Facebook Page". Mostrar:
             - Facebook Login for Business popup
             - Lista de Pages que el dummy account administra
             - Selección de page
             - Lista de permisos solicitados (HIGHLIGHT el permiso de este video)
             - Click "Continue / Authorize"
             Subtítulo: "User grants [PERMISSION] to MorfX."

[1:30-2:30]  Volver a MorfX UI. Mostrar:
             - Page conectada visible en /integrations
             - Inbox empty state
             - Cambiar a otra ventana: simular envío de mensaje desde un
               cliente final (segundo dummy account o emulador)
             - Volver a MorfX inbox: mensaje aparece
             Subtítulo: "Inbound message arrives via webhook using [PERMISSION]."

[2:30-3:30]  Operador responde:
             - Click conversación
             - Type reply
             - Send
             - Verify reply visible en Messenger del cliente final
             Subtítulo: "Operator replies within 24-hour window."

[3:30-4:00]  Mostrar:
             - Contact creado en CRM con nombre/foto del cliente final
             - Mensaje persistido en historial
             Subtítulo: "Conversation persisted in CRM workspace."

[4:00-4:30]  (Solo si permiso lo amerita) Mostrar:
             - Disconnection / data deletion flow
             Subtítulo: "User can disconnect Page anytime."
```

### 7.3 Tooling recomendado

| Tool | Free? | Pros | Cons |
|---|---|---|---|
| **Loom** | Free tier OK | Más fácil, share por URL, anota cursor | Watermark en free |
| **OBS Studio** | Free | Pro, sin watermark, edita en post | Curva aprendizaje |
| **Camtasia** | $300 one-time | Pro tier, fácil edición | Caro |
| **QuickTime** (macOS) | Free | Built-in macOS | Sin edición |
| **Snagit** | $50 | Anotaciones excelentes | Solo Win/macOS |

**Recomendación MorfX:** Loom para grabar (cursor zoom + click highlight built-in), CapCut/iMovie para post-edición de subtítulos. URL de Loom acepta directo en el upload de Meta.

[Source: medium.com/@chriscouture/how-to-get-your-meta-facebook-app-approved-in-2023](https://medium.com/@chriscouture/how-to-get-your-meta-facebook-app-approved-in-2023-tips-code-snippets-for-navigating-reviews-c1305da5f929)

### 7.4 Errores comunes en screencast (lista de rejection-killers)

1. **No mostrar logout antes de login** → "we couldn't see the OAuth grant"
2. **Saltarse el popup de Meta** → "we can't verify users grant the permission"
3. **UI en español sin subtítulos** → "reviewer couldn't follow"
4. **Mostrar mock data** → "this looks like a prototype, not a real integration"
5. **No mostrar el resultado del API call** → "we don't see the data being used"
6. **Combinar 3 permisos en un video** → "split per permission for clarity"
7. **Cursor invisible o keyboard navigation** → "couldn't track what you clicked"
8. **No mostrar el caso multi-tenant** → "we don't see why business_management is needed"

---

## 8. Submit flow — paso a paso

### 8.1 Orden de operaciones (Meta UI 2026)

1. **App Dashboard → App Review → Permissions and Features**
2. Search por cada permiso → click **"Request Advanced Access"** (o **"Request Full Access"** según cómo aparece tras update 2026-05-04)
3. Para cada permiso seleccionado: aparece form con:
   - Campo "How is your app using this permission?" → pegar plantilla de §6
   - Campo "Upload screencast" → URL de Loom o upload MP4
   - Optional: link a docs públicos (recomendado: link a `morfx.app/docs/integrations/meta`)
4. **Business Verification status** (si no completada → te bloquea aquí)
5. **Data Use Checkup**: responde data handling questions (~30 seg para evaluar respuesta)
6. **App Verification details**: describe cómo el revisor accede a la app
   - Provee URL de login (`morfx.app/login`)
   - Credenciales del dummy account (email + password + cómo obtener 2FA)
   - País desde donde testear (ej. "Test from US or Colombia — works globally")
7. **Submit**

> "Click Submit for Review and accept the Platform Onboarding Terms. You should receive the decision within one week." — [Meta submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)

### 8.2 ¿Qué pasa después del submit?

- App Dashboard muestra status: **"In Review"**
- Reviewers prueban tu app usando las credenciales y screencasts
- Recibes email cuando termina (decision en 5-14 días típicamente)

**Resultados posibles:**
- ✅ **Approved** — permiso pasa a Live mode
- ❌ **Rejected** — feedback en email + dashboard. Tienes 30 días para resubmit
- ⚠️ **More Info Requested** — clarification sin rechazo formal. Mejor caso

### 8.3 Si te rechazan

1. Lee feedback en App Dashboard (no solo el email)
2. NO uses el botón "Appeal" si el feedback es claro — es para casos de error de Meta. Mejor **"Resubmit"** después de fix.
3. Modifica screencast / descripción / setting según feedback
4. Resubmit. Cada ciclo añade 3-7 días.

> "You have 30 días from receiving an additional information request to resolve issues and resubmit, with the 30-day period not restarting with each resubmission during that window." — [Meta App Review FAQs](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/AR-FAQs/)

---

## 9. Multi-tenant / Tech Provider considerations específicas MorfX

### 9.1 ¿Necesitas registrarte formalmente como "Tech Provider"?

**Para FB Messenger / Instagram: NO existe un programa formal de "Tech Provider" como sí existe para WhatsApp.** El Tech Provider Program es **WhatsApp-specific**. Para FB/IG, simplemente:

- Tu app pide `business_management` permission
- Justificas que sirves múltiples businesses
- Cada cliente B2B usa **Facebook Login for Business** para connectar SUS assets
- Almacenas un **page access token** (nunca expira) o **system user token** por workspace de cliente

[Source: developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions/](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions/) (este sí es WhatsApp; para FB/IG es más simple)

### 9.2 Facebook Login for Business — el equivalente multi-tenant

Reemplaza al viejo "Facebook Login". Ventajas:

- **Configurations**: tú defines en App Dashboard qué permisos pides + qué asset types (Pages, IG)
- **Persistence**: una vez el cliente conecta, el token vive sin re-auth (a menos que el cliente revoke)
- **Reusable across customers**: una sola configuration, N clientes pueden usarla

Setup:
1. App Dashboard → Use Cases → **"Facebook Login for Business"** → Customize
2. Crear configuration: ej. "MorfX Page + IG Connection"
3. Add permissions: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_messages`, `business_management`
4. Add asset types: Pages, Instagram accounts
5. Generate config_id → usar en frontend con `FB.login({ config_id: '...' })`

### 9.3 System Users (para operaciones backend largas)

Para webhooks que llegan días/semanas después del OAuth original, no quieres usar el page access token directo (puede caducar si el user revoca). Mejor:

1. El cliente otorga `business_management` durante OAuth
2. Tu backend crea un **System User** dentro del Business del cliente
3. System User token nunca expira (a menos que se elimine)
4. Lo usas para webhook processing background

[Source: support.infosum.com/hc/en-us/articles/21987155916306-Obtaining-a-System-User-Access-Token-in-Meta](https://support.infosum.com/hc/en-us/articles/21987155916306-Obtaining-a-System-User-Access-Token-in-Meta)

**Nota:** System Users requiere `business_management` aprobado. Otra razón para no skipearlo del submission.

---

## 10. Test users / dummy accounts (esto cambió en 2023)

> "As of September 2023, Meta has discontinued the use of test users for the app review process, and developers are advised to use a dummy Facebook account as a workaround."

### 10.1 Setup recomendado para MorfX

**Cuenta dummy 1 (admin):**
- Crear FB account nuevo: `morfx.review@your-domain.com`
- Activar 2FA via TOTP (Google Authenticator)
- Crear FB Page: "MorfX Test Business"
- Crear IG Business account linked to that Page
- Marcar como admin de la app en App Dashboard → Roles

**Cuenta dummy 2 (cliente final):**
- Crear segundo FB account: `morfx.customer.review@your-domain.com`
- 2FA opcional pero recomendado
- Esta cuenta envía mensajes a la Page del dummy 1 durante tests

### 10.2 Cómo entregar credenciales a Meta

En App Verification Details, escribir:

```
Test access:
- App URL: https://morfx.app/login
- Email: morfx.review@your-domain.com
- Password: [strong password]
- 2FA: TOTP. To get current code, visit https://morfx.app/review/2fa

The dummy account is admin of:
- Facebook Page: "MorfX Test Business" (Page ID: ...)
- Instagram Business account: @morfx_test

To test inbound messaging:
1. Login with credentials above
2. Navigate to /integrations → connect FB Page → "MorfX Test Business"
3. From a separate browser/incognito, send a message to the Page from
   any Facebook account
4. Observe inbound message in MorfX inbox at /inbox
```

### 10.3 Endpoint TOTP-as-a-service para reviewers

[Chris Couture pattern](https://medium.com/@chriscouture/how-to-get-your-meta-facebook-app-approved-in-2023-tips-code-snippets-for-navigating-reviews-c1305da5f929) — reviewers necesitan login durante review pero no controlas el TOTP. Solución: endpoint público que devuelve el current TOTP del dummy:

```typescript
// app/review/2fa/route.ts (Next.js)
import { authenticator } from 'otplib';

export async function GET() {
  const secret = process.env.META_REVIEW_DUMMY_TOTP_SECRET;
  const code = authenticator.generate(secret);
  return Response.json({ code, expires_in: 30 });
}
```

⚠️ **Disable este endpoint inmediatamente cuando tu app pase review.** Es un side-channel inseguro.

---

## 11. Documentos legales — endpoints y URLs

### 11.1 Privacy Policy URL

Debe mencionar **explícitamente**:
- Que recibes data de Facebook/Meta APIs (Messenger, Instagram)
- Qué data específica: mensajes, metadata del sender, page_id, page_access_token
- Cómo la usas: customer service, CRM, AI agent responses
- Cuánto la retienes: ej. "indefinidamente mientras la cuenta esté activa, 30 días post-deletion"
- Con quién la compartes: terceros (OpenAI, Anthropic para AI processing) — **MUST DECLARE**
- Cómo el end-user solicita borrado

**Pitfall:** Si tu Privacy Policy menciona OpenAI/Anthropic pero tu DUC no, te rechazan ambos.

### 11.2 Data Deletion Callback (recomendado vs Instructions URL)

**Callback** (más profesional, gana puntos):

```typescript
// app/api/meta/data-deletion/route.ts
import crypto from 'crypto';

export async function POST(req: Request) {
  const body = await req.formData();
  const signedRequest = body.get('signed_request') as string;
  const [encodedSig, payload] = signedRequest.split('.');

  // Verify signature with app secret
  const expectedSig = crypto
    .createHmac('sha256', process.env.META_APP_SECRET!)
    .update(payload)
    .digest('base64url');

  if (encodedSig !== expectedSig) return new Response('invalid', { status: 401 });

  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  const userId = data.user_id;

  // Trigger async deletion job (Inngest)
  const confirmationCode = crypto.randomUUID();
  await inngest.send({
    name: 'meta/data-deletion-requested',
    data: { userId, confirmationCode }
  });

  return Response.json({
    url: `https://morfx.app/data-deletion-status?code=${confirmationCode}`,
    confirmation_code: confirmationCode
  });
}
```

[Source: developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)

**Instructions URL** (más fácil, vale lo mismo formal): página estática `/data-deletion` con instrucciones para email a `privacy@morfx.app`.

### 11.3 Terms of Service

No tienen requisitos específicos de Meta, pero deben:
- Estar publicly accesible
- Mencionar que usuarios pueden integrar FB/IG
- Limitations of liability razonables

---

## 12. Timelines reales 2026 — datos agregados

### 12.1 Por etapa

| Etapa | P50 | P90 | Notas |
|---|---|---|---|
| **Business Verification** | 3-5 días | 14 días | Auto-aprobaciones en 10min posibles si docs match perfecto |
| **Data Use Checkup** | <1 hora | 1-2 días | Suele ser instantáneo si respuestas ≠ flags |
| **App Review primer ciclo** | 5-7 días | 14 días | Para messaging permissions |
| **Resubmit por rechazo** | 3-5 días adicionales | 7 días | Por cada ciclo |
| **End-to-end (1 rechazo asumido)** | 3-4 semanas | 6-8 semanas | Realista para MorfX |

[Source: saurabhdhar.com/blog/meta-app-approval-guide](https://www.saurabhdhar.com/blog/meta-app-approval-guide)

### 12.2 Distribución de ciclos de rechazo

Datos anecdóticos de foros (Chatbots Magazine, GitHub issues, Medium):
- ~30% aprobados en primer submit
- ~50% rechazados 1 vez, aprobados en segundo
- ~15% rechazados 2 veces
- ~5% pasa por 3+ ciclos

**Implicación MorfX:** Plan realista = **4-6 semanas desde BV hasta Live Mode**. Si BV demora 2 semanas + 1 rechazo de App Review, son 6-8 semanas. **Empezar BV YA.**

---

## 13. Costos asociados

| Item | Costo | Necesario? |
|---|---|---|
| Meta App | $0 | Sí |
| Business Verification | $0 | Sí |
| App Review submission | $0 | Sí |
| Loom Pro (mejor calidad screencast) | $15/mes | Opcional |
| Camtasia (alternativa) | $300 one-time | Opcional |
| Traducción jurada de docs Cámara Comercio | ~50.000-200.000 COP | Solo si Meta pide |
| Notarización docs | ~30.000 COP | Raramente necesario |
| Privacy Policy generator (iubenda, Termly) | $30-100/año | Opcional, mejor escribir custom |

**Total típico: $0-400 USD.** Costo principal es **tiempo** (10-30 horas across 4-6 semanas).

---

## 14. Pitfalls específicos MorfX (B2B multi-tenant CRM)

### 14.1 Cómo describir el use case

**EVITA decir:**
- "We're a chatbot platform" → asociado a spam/marketing
- "We send promotional messages" → tag rojo automático
- "We help businesses do marketing on Messenger" → rechazo casi seguro

**USA en su lugar:**
- "We are a multi-tenant CRM platform that consolidates customer service conversations across multiple channels"
- "Businesses use MorfX to respond to inbound customer inquiries within Meta's 24-hour customer service window"
- "AI agents trained on the business's product catalog handle initial responses; human operators take over for complex cases"

### 14.2 24-hour window discipline

- **Toda respuesta DEBE caer dentro del 24-hour window iniciado por el end-user.**
- Si tu agente AI responde en >24h, te baneas reviewer manual cuando le toque ver el log.
- **No solicites `pages_messaging_subscriptions`** a menos que tengas un caso de uso ironclad para mensajes outbound (ej. confirmaciones de orden) — y aún así, te van a interrogar duro.

### 14.3 AI agent ≠ human agent

- Si tu screencast muestra "AI bot responding", **NO digas "human agent"** en ninguna descripción.
- Si pides `human_agent` permission con AI bot, **rechazo automático**.
- Marca claramente AI vs operador humano en cada UI capturada.

### 14.4 Workspace isolation visible en screencast

Reviewers querrán ver que multi-tenant está bien implementado:
- Mostrar workspace switcher
- Mostrar 2 workspaces distintos con data aislada
- Mencionar en descripción: "Each business operates in an isolated workspace; messages from Business A's customers never appear in Business B's inbox."

### 14.5 No prometas funcionalidad que no tienes

- Si tu screencast muestra "auto-tagging by AI" pero el feature no existe en producción, mentira detectada → ban temporal de la app.
- Submitea solo features completos.

---

## 15. Checklist final ordenado — ejecuta en este orden

### Semana -2 (preparación, antes de BV)

- [ ] Privacy Policy actualizada con FB/IG specifics + OpenAI/Anthropic mention
- [ ] Terms of Service publicada
- [ ] `morfx.app/data-deletion` instructions page **o** callback endpoint implementado
- [ ] App icon 1024×1024 finalizado
- [ ] Decidir Privacy Policy & TOS URL definitivos (no cambiar después)

### Semana -1: Arrancar BV

- [ ] Reunir docs Cámara Comercio + RUT + recibo servicios
- [ ] Verificar que "Legal business name" en Meta Business Manager match exacto con doc
- [ ] Submit BV via business.facebook.com → Verify
- [ ] Mientras esperas BV, preparar dummy accounts + Pages/IG de prueba

### Día 0 (BV aprobada)

- [ ] Completar Data Use Checkup
- [ ] Configurar app settings completos (§4)
- [ ] Crear configuration de Facebook Login for Business (§9.2)
- [ ] Implementar TOTP-as-a-service endpoint dummy (§10.3)
- [ ] Hacer al menos 1 API call exitoso por permiso (Meta requiere para submit)

### Semana 1: Grabar screencasts

- [ ] Script + storyboard por permiso (§7.2)
- [ ] Grabar con Loom 1080p, dummy accounts ya configurados
- [ ] Editar subtítulos en inglés
- [ ] Subir a Loom o S3 (URLs persistentes, no Google Drive con expiración)

### Semana 2: Submit App Review

- [ ] Para cada permiso: pegar descripción única (§6) + URL del screencast
- [ ] Verificar test access instructions completas (§10.2)
- [ ] Submit
- [ ] Bloquear esa cuenta de cualquier cambio mientras review está activo

### Semana 2-4: Espera + iteración

- [ ] Monitor app dashboard daily
- [ ] Si rechazo: leer feedback, fix ese ítem específico, resubmit en <30 días
- [ ] Si approve: switch app a Live Mode
- [ ] Disable TOTP-as-a-service endpoint
- [ ] Documentar lessons learned

---

## 16. Foros / experiencias reales (referencias)

### Casos documentados de rechazo + resolución

- **Chatwoot — Instagram permissions rejected** ([GitHub #8434](https://github.com/chatwoot/chatwoot/issues/8434)): rejection por improper handling of media CDN URLs. Solución: cachear/copiar media files en lugar de servirlos desde URLs CDN de Meta directamente.

- **Chatwoot — improper CDN handling** ([GitHub #8498](https://github.com/chatwoot/chatwoot/issues/8498)): mismo issue persistente, requiere cambio arquitectónico en cómo se sirven imágenes inbound.

- **3CX Forums — Messenger app review not approved** ([3cx.com/community](https://www.3cx.com/community/threads/app-review-for-messenger-not-approved.133075/)): rechazo por descripción ambigua del use case.

- **Chatbots Magazine — "Tell-all: How we got through Facebook App Review"** ([Medium](https://chatbotsmagazine.com/tell-all-how-we-got-through-facebook-app-review-b4394840759a)): doc histórico (2018) pero principios siguen aplicando — calidad del screencast > todo.

- **Saurabh Dhar Meta App Approval Guide 2025** ([blog](https://www.saurabhdhar.com/blog/meta-app-approval-guide)): timeline data + rejection reasons agregados.

### Tutoriales paso-a-paso recomendados

- [Meta official: How to Produce a Screencast for App Review](https://developers.facebook.com/videos/2021/developing-for-success-how-to-produce-a-screencast-for-app-review/) — video oficial de Meta, must-watch
- [Dancer's Code blog: Navigating the Facebook App Review Process](https://dancerscode.com/posts/navigating-the-facebook-app-review-process/) — práctico
- [Chris Couture Medium 2023](https://medium.com/@chriscouture/how-to-get-your-meta-facebook-app-approved-in-2023-tips-code-snippets-for-navigating-reviews-c1305da5f929) — TOTP workaround + dummy account pattern
- [Kevit Technologies Medium](https://medium.com/kevit-technologies/how-to-get-your-facebook-app-reviewed-5db98c4e604c) — flow general

### Videos demo screencast (para inspiración)

- [Instagram API Video Screencast (YouTube)](https://www.youtube.com/watch?v=WLUUBzcem0k)
- [Instagram Screencast Example (YouTube)](https://www.youtube.com/watch?v=5naneshIEfo)
- [Screencast for Instagram app approval (YouTube)](https://www.youtube.com/watch?v=cps5CQhGuN4)
- [Instagram video screencast (YouTube)](https://www.youtube.com/watch?v=fuKxCQf6YN0)

### Documentación oficial Meta (bookmarks obligatorios)

- [App Review Submission Guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [Screen Recordings Guide](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/)
- [Permissions Reference](https://developers.facebook.com/docs/permissions/)
- [Messenger Platform App Review](https://developers.facebook.com/docs/messenger-platform/app-review/)
- [Instagram Platform App Review](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Access Levels](https://developers.facebook.com/docs/graph-api/overview/access-levels/)
- [App Review FAQs](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/AR-FAQs/)
- [Data Use Checkup tutorial](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/data-use-checkup/tutorial/)
- [Data Deletion Callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/)
- [Use Case Permission Mapping](https://developers.facebook.com/docs/development/create-an-app/use-cases-permission-mapping/)
- [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)
- [Instagram Messaging API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/)
- [WhatsApp Solution Provider sample submission](https://developers.facebook.com/docs/whatsapp/solution-providers/app-review/sample-submission) (template approach reusable)

---

## 17. Riesgos / blockers identificados para MorfX

### 17.1 ALTO: Justificar `pages_messaging_subscriptions`
Si MorfX necesita enviar mensajes outbound proactivos (notificaciones de orden, follow-ups, recompra) **fuera del 24-hour window**, este permiso es muy peleado. El use case AI bot empuja hacia mensajes proactivos que Meta tradicionalmente rechaza. **Sugerencia:** en V1, NO solicitarlo. Operar 100% reactivo dentro del 24h window. Cuando esté Live, evaluar si V2 necesita outbound real.

### 17.2 ALTO: AI agent vs Human agent ambiguity
MorfX tiene agentes AI **+** operadores humanos (pattern crm-mutation-tools dejado claro). Reviewers pueden confundirse entre los dos. **Sugerencia:** describir AI como "first-line auto-response based on business's training" y humano como "fallback for complex cases". Ser explícito en cada descripción.

### 17.3 MEDIO: Data sharing con OpenAI/Anthropic
Mensajes inbound pasan por LLMs externos para AI processing. **Esto debe estar EXPLÍCITO en Privacy Policy + Data Use Checkup + descripción de cada permiso.** Si lo escondes y reviewer lo descubre via inspección de respuestas, ban.

### 17.4 MEDIO: Latencia del webhook (<20s)
Tu webhook actual de WhatsApp ya cumple. El de Messenger/IG tendrá la misma exigencia. **Verificar que el dispatch a Inngest/queue es await** (memo MorfX ya documenta este pitfall — Inngest fire-and-forget breakage).

### 17.5 MEDIO: BV documentos en español
Cámara de Comercio y RUT están en español. Riesgo de rechazo automático por mismatch de string. **Mitigación:** crear el "Legal business name" en Meta Business Manager copiando carácter por carácter del cert de Cámara de Comercio. Tildes, espacios, "S.A.S." — todo idéntico.

### 17.6 BAJO: GoDentist FB/IG sibling agent ya existe en CLAUDE.md
La memoria de MorfX referencia un agente `godentist-fb-ig` ya shipped 2026-05-05 — implica que ya hay tráfico FB/IG entrando vía ManyChat al workspace `f0241182-...`. **Cuando migremos a Meta directo, hay que coexistir con el agente actual sin breakage.** Plan: feature flag por workspace que decide si webhooks vienen de ManyChat o Meta directo. Aplicar Regla 6 estricta.

### 17.7 BAJO: Live Mode switch implications
Una vez la app entra Live Mode, **modificar settings básicos requiere otra ronda de review**. Decidir TODO antes (URLs, naming, branding) y no tocar.

---

## 18. Decisiones pendientes de discutir con el usuario

Antes de submittear, MorfX debe decidir:

1. **¿Submittear los 8 permisos en una sola pasada o por bloques?**
   - Opción A: todos juntos (1 ciclo). Más rápido si pasa, peor si rechazan.
   - Opción B: bloque mínimo (`pages_show_list`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `business_management`) primero, resto después. Más seguro.

2. **¿`pages_messaging_subscriptions` ahora o después?** Recomendación: después (V2 standalone).

3. **¿Implementar Data Deletion Callback completo o solo Instructions URL?** Recomendación: Callback (más profesional, ~4 horas implementarlo).

4. **¿En qué workspace de prueba grabar los screencasts?** Recomendación: crear "MorfX Demo Workspace" nuevo, no usar Somnio/GoDentist reales (PII risk).

5. **¿Crear configuration única de Facebook Login for Business o varias?** Recomendación: una sola con todos los permisos juntos.

6. **¿Mantener ManyChat operativo durante el rollout?** Recomendación: sí, feature flag por workspace + cutover gradual cuando Meta directo esté Live + estable.

---

## 19. Próximos pasos sugeridos (no parte de este research, para discusión)

1. Crear standalone `meta-bv-app-review-prep` en `.planning/standalone/` con checklist trackeable
2. Asignar tasks: BV (admin), Privacy Policy update (legal), screencasts (Jose), Data Deletion endpoint (dev)
3. Sincronizar con el WhatsApp BV state (ya completo? gating shared?)
4. Establecer review semanal del estado del proceso

---

## 20. Tactical playbook práctico — sintetizado de práctica real (anexo 2026-05-08)

> **Fuente:** dos posts long-form firmados por **Saurabh Dhar** (Meta API consultant — 239 proyectos completados, 500+ permisos aprobados según self-reporting). Contenido reposteado en r/FacebookAds y r/SaaS. Disclaimer: el autor cierra ambos posts ofreciendo sus servicios pagos en Upwork — el contenido es self-promotion-flavored pero la sustancia técnica está respaldada por su track record visible y coincide con docs oficiales de Meta donde la cruzo.
>
> **Cómo usar este anexo:** las §6-§16 cubren el "qué" del proceso. Esta §20 cubre el "cómo evitar rejection" desde la perspectiva de alguien que pasa apps a través del review constantemente. Si los dos chocan, prioriza esta §20 (son lecciones empíricas).

### 20.1 Las 5 razones principales de rechazo (según práctica)

Reproducidas verbatim del post + comentario MorfX:

1. **Screencast no demuestra realmente el permiso en uso.**
   Reviewer necesita ver el permiso *en acción*, no solo el app homepage. Generic walkthrough = rejection automático. Aplica a MorfX: cada permiso (`pages_messaging`, `instagram_manage_messages`, etc.) necesita su propio segmento del screencast donde se ve el flujo real (mensaje inbound → bot procesa → respuesta sale).

2. **Pedir permisos que el app no necesita.**
   Si pedís `ads_management` y tu app no toca ads, rejection. Aplica a MorfX: NO pedir `human_agent`, NO pedir `pages_messaging_subscriptions` en V1, NO pedir `instagram_content_publish` (cubierto en §5.1 — "permisos que probablemente NO necesitas").

3. **App no accesible públicamente para testing.**
   Reviewer va a *intentar* abrir tu app y usarla. Si está detrás de auth sin credenciales válidas → rejection. Si es localhost → rejection. Aplica a MorfX: el dummy account en `morfx.app` con TOTP (cubierto en §10) tiene que funcionar — testealo desde un browser limpio sin ninguna cookie días antes del submit.

4. **Privacy policy / Data Deletion rotos o incompletos.**
   Caso real reportado: app con screencast perfecto rejected porque privacy policy URL daba 404. Aplica a MorfX: tras la página `/data-deletion` que vamos a construir, abrir las 3 URLs (Privacy, Terms, Data Deletion) en incógnito desde dispositivos distintos antes de submit. Una sola que dé 404 = rejection del paquete entero.

5. **🆕 Sin API calls exitosos en los últimos 30 días.**
   Esto NO estaba en §4-§7 de este Bible y es **crítico**: antes de submit, necesitas haber hecho al menos **1 API call exitoso por cada permiso** que pides, dentro de los últimos 30 días. Está en docs oficiales de Meta pero la mayoría de devs lo pasa por alto. Aplica a MorfX:
   - Hacer `GET /me/accounts` con un token de prueba antes del submit (`pages_show_list`)
   - Hacer `GET /<page-id>/conversations` (`pages_messaging`)
   - Hacer `GET /<ig-account-id>/conversations` con un access token IG (`instagram_manage_messages`)
   - Cada llamada queda registrada en App Dashboard → Analytics. Reviewer chequea que la métrica diga >0 calls last 30 days.
   - **Acción concreta:** 7-10 días antes del submit, hacer un "warmup script" que llame todos los endpoints con tokens válidos. Documentar request/response en un log.

### 20.2 Anatomía de un screencast aprobable (extiende §7)

Lo que §7.1-§7.4 ya cubre + lo que el post añade:

| Aspecto | Bible §7 dice | Post añade |
|---|---|---|
| Resolución | 1080p mínimo | Mismo — confirma 1080p o superior |
| Audio | Sin audio o subtítulos en inglés | Mismo; pero **narración voz-over en inglés** funciona si el reviewer entiende |
| Velocidad | Normal, sin acelerar | **Sin jumpcuts** (cortes abruptos disparan suspicion) |
| Duración | ~3-5 min por permiso | <5 min total preferido — reviewers ven cientos al día |
| Estructura | logout → login → OAuth → uso → data persiste | + **mostrar request HTTP en DevTools Network tab** = remueve toda duda |
| Annotations | No mencionado | **🆕 Texto overlay nombrando el permiso** en cada momento ("`pages_messaging` in use here") |
| Una grabación por permiso | Recomendado | + cada permiso "visiblemente demostrado" — combinar es OK pero cada uno tiene que ser identificable |

**Acción MorfX (cuando grabemos):**
- Abrir Chrome DevTools → Network tab → filter por `graph.facebook.com`
- Mostrar la llamada saliendo y retornando 200 OK durante el flow
- Overlay de texto (Loom, OBS scene text, o iMovie title): cada vez que aparece un permiso usándose, texto en pantalla "**Permission: `pages_messaging`** — receiving inbound message from Page X"
- Total target: 1 video por permiso de 60-120 segundos cada uno, no un mega-video de 10 min

### 20.3 "Invalid Screencast" — diagnostic decoder

Si llega rejection con código `Invalid Screencast`, el meaning real es 1 de 3:

1. **Reviewer no pudo ver el permiso siendo usado** — fix: re-grabar con annotations explícitas + Network tab visible
2. **Reviewer no pudo abrir el video link** — fix: verificar que el URL del video sea público (Google Drive con "anyone with the link" / Loom unlocked / direct mp4 URL)
3. **Calidad muy baja para verificar** — fix: re-grabar a 1080p+ con el text legible (font size 14+ en el app durante grabación)

**99% de los casos = 1 de los 3.** No es problema del app, es problema del screencast.

### 20.4 Permission-by-permission tactics (extiende §6)

Reproducido del post con comentario MorfX:

**Facebook Pages permissions** (`pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement`, `business_management`):
- *Most commonly requested + most straightforward to approve.*
- Key: **NO bundle into one generic demo** — cada permiso justificado individualmente.
- **MorfX:** los 5 permisos van bien con use case "AI bot responds to customer inquiries on Pages" — descripciones ya están en §6.1-§6.4.

**Instagram permissions** (`instagram_manage_messages`, `instagram_basic`):
- *Stricter en 2026.*
- 🆕 **Si arrancás nuevo, ir directo a Business API variants:** `instagram_business_basic`, `instagram_business_manage_messages`. Las "older" están deprecating.
- **MorfX action item:** verificar antes de submit si Meta App ID 1559280425149650 está pidiendo `instagram_manage_messages` o `instagram_business_manage_messages` — usar la Business API variant. Doc oficial: [developers.facebook.com/docs/instagram-platform](https://developers.facebook.com/docs/instagram-platform/). Tiempo: 5 min de revisar settings.

**Ads & Marketing API** (no aplica a MorfX V1 — solo si V2 hace ads programáticos):
- *Most rigorous review.* Skip salvo que sea core feature.

**WhatsApp Business API** (`whatsapp_business_messaging`, `whatsapp_business_management`):
- Requiere WABA funcional + use case claro de business messaging.
- Screencast: mostrar mensaje saliendo Y entrando.
- **MorfX:** ya tiene WhatsApp Cloud API operativo desde v5.0. Cuando se pidan estos permisos, screencast puede mostrar conversación real Somnio/GoDentist (con PII redacted en post-production).

### 20.5 Reglas anti-rejection durante el review (🆕 — no estaba en Bible)

Una vez submitted y "In Review":

- ❌ **NO editar App Settings mientras en review.** Cambiar campos (privacy URL, descripciones, icon) **resetea el timer del review** y a veces tira el submission entero. Si encontrás un typo, aguantatelo hasta que termine el ciclo.
- ❌ **NO submit el mismo permiso 5 veces seguidas.** Pattern de spam = penalty.
- ✅ **Si rejected, esperar 24h antes de resubmit.** Da tiempo al sistema interno para clear caches del review previo. Resubmits inmediatos a veces son auto-rechazados con el mismo feedback porque el reviewer trae el snapshot anterior.
- ✅ **Leer el feedback de rejection literalmente.** Meta dice exactamente qué falló. Fix solo eso, no rehagas todo (no introducir variables nuevas).
- ✅ **9 de cada 10 rejections se resuelven con un mejor screencast** según el autor — no con cambios al app.

### 20.6 Tactical FAQs

- **¿Cuánto tarda el review?** Oficial 5+ días hábiles. En práctica: simple = 2-3 días, complex (Ads/WhatsApp) = 7-10 días. Coincide con §12 del Bible.

- **¿Puedo someter sin un app live?** No. Meta va a testear. App tiene que ser real, accesible, funcional. Localhost-only = imposible.

- **¿Multiple permisos = una submission o varias?** **Una submission con todos los permisos juntos** > 5 secuenciales. Cada uno justificado individualmente, screencast por permiso, pero 1 sola entrega. Coincide con §8.1 del Bible.

- **¿BV es prerequisito?** Para Advanced/Full Access — sí. Hacela ANTES de submit App Review. Toma 5-7 días (alineado con [.planning/research/meta-business-verification-colombia.md](./meta-business-verification-colombia.md)). No querés que BV bloquee el App Review.

- **¿Instagram Basic Display API?** Deprecating. Si arrancás nuevo, **Instagram Business API directo** (Business API variants).

### 20.7 Conclusión del playbook (sintetizada)

> **El proceso de review NO está roto, está estricto y mal documentado.** La diferencia entre approval y loops de rejection se reduce a 3 cosas:
> 1. **Screencast claro** que demuestra cada permiso individualmente
> 2. **Descripciones de permiso precisas** que matchean lo que el app realmente hace (sin overclaim)
> 3. **App que realmente hace lo que decís que hace** (live, accesible, funcional)
>
> Si esos 3 están sólidos, approval rate es alto.

**Para MorfX traducido:**
- ✅ Screencast playbook: §7 + §20.2 + §20.3
- ✅ Descripciones precisas: §6 + §14 (cómo describir use case sin overclaim)
- ✅ App live + funcional: morfx.app está deployed, tooling de tests en `/sandbox` para testear permisos antes del submit
- 🆕 **Action item nuevo:** warmup script de 30-day API calls (§20.1 punto 5) — agregar al checklist de Semana -1 en §15

### 20.8 Cómo se actualiza §15 con esto

Agregar al checklist Semana -1 (entre "Arrancar BV" y "Grabar screencasts"):

```
[ ] Días T-10 a T-7: ejecutar "warmup script" — 1 API call exitoso por cada permiso
    a solicitar, contra Meta Graph API con tokens de test users válidos.
    Verificar en App Dashboard → Analytics que cada permiso muestre >0 calls
    en los "Last 30 days".
[ ] Día T-3: NO editar nada en App Settings desde aquí hasta approval/rejection.
[ ] Si rejected: esperar 24h, leer feedback literal, fix solo lo flageado, resubmit.
```

### 20.9 Source disclaimer

Los dos posts son self-promotion del autor (cierra ofreciendo sus servicios en Upwork como Top Rated Plus). El track record (239 proyectos, 100% Job Success en Upwork) es verificable. La sustancia técnica de los posts coincide con:
- [Meta Submission Guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide) — fuente oficial
- [Meta Screen Recordings Guide](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/) — fuente oficial
- Otros casos comunitarios (cubiertos en §16 del Bible)

**Las únicas afirmaciones que no pude cruzar con docs oficiales:**
- "9 out of 10 rejections solve with better screencast" — número específico de Saurabh, anecdotal
- "239 projects, 500+ permissions" — no hay verificación third-party más allá de Upwork profile
- "P50 approval 5-7 días" para straightforward submissions — coincide con docs Meta dentro de margen

**Recomendación:** tratar §20 como tactical playbook empírico de practitioner experimentado. Las afirmaciones técnicas son sólidas. Los números específicos son orientativos.

---

**Fin del research.**
