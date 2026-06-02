# Meta Permissions Deep Verification — MorfX V1 (5 candidates)

**Fecha:** 2026-05-08
**Contexto:** verificación rigurosa post-hallazgo `business_management` (que resultó deferable). Usuario pidió mismo nivel de escrutinio para los 5 que quedaron en MUST REQUEST.

---

## TL;DR ejecutivo — veredictos por permiso

| # | Permiso | Veredicto | Confianza | Razón principal |
|---|---|---|---|---|
| 1 | `pages_messaging` | ✅ **REQUEST** | 95% | Core Messenger send+receive+manage. No alternativa más restrictiva. |
| 2 | `pages_manage_metadata` | ✅ **REQUEST** | 90% | Suscripción de webhooks en `subscribed_apps` lo requiere. Sin esto, no llegan mensajes. |
| 3 | `instagram_business_manage_messages` | ✅ **REQUEST** | 95% | Core IG DMs. **Legacy `instagram_manage_messages` deprecada Jan 2025** — Business es la única vía. |
| 4 | `whatsapp_business_messaging` | ✅ **REQUEST** | 95% | Webhook de mensajes inbound + sending. Core WA. |
| 5 | `whatsapp_business_management` | ✅ **REQUEST** | 90% | **Dependency obligatoria** de `whatsapp_business_messaging` + webhook de status/delivery + templates. Embedded Signup las pide bundled. |

**Net result:** los 5 se mantienen REQUEST. Ningún drop como pasó con `business_management`. Hallazgos sorpresa que CAMBIAN matices del set:

- `instagram_business_manage_messages` Business variant tiene **menos dependencies** que la legacy (solo `instagram_business_basic` vs `instagram_basic` + `pages_read_engagement` + `pages_show_list`) — esto JUSTIFICA quitar `pages_read_engagement` y posiblemente `pages_show_list` del bloque IG.
- WhatsApp permissions son **inseparables**: `whatsapp_business_messaging` tiene a `whatsapp_business_management` como Related Permission/dependency oficial. No es decisión, vienen bundled.
- `pages_messaging` NO cubre Instagram (separación confirmada verbatim) — necesitas `instagram_business_manage_messages` aparte.

---

## 1. `pages_messaging`

### A. Definición oficial verbatim
> *"El permiso pages_messaging permite que tu app acceda a las conversaciones de la página en Messenger y las administre."*
> ([developers.facebook.com/docs/permissions/reference/pages_messaging](https://developers.facebook.com/docs/permissions/reference/pages_messaging))

**Allowed Usage (Meta verbatim):**
- Create user-initiated interactive experiences
- Confirm customer interactions (purchases, orders, reservations)
- Send customer service messages

### B. Endpoints que lo requieren
- `POST /<page-id>/messages` — enviar mensaje al usuario via PSID
- `GET /<page-id>/conversations` — listar threads
- `GET /<conversation-id>/messages` — listar mensajes en thread
- `GET /<psid>?fields=name,profile_pic` — User Profile API (sender info)
- Webhook receipt de `messaging` field (vía pages_manage_metadata para suscribir, este permiso para procesar payloads)

### C. Alternativas más restrictivas
- `human_agent` — extensión a 7-day window con humano. **NO sustituto** — es complemento.
- `pages_messaging_subscriptions` — outbound proactivo fuera de 24h. **NO sustituto** — opt-in messaging adicional.
- **No hay alternativa de menor scope.**

### D. ¿Qué se rompe sin él?
**Todo Messenger.** No podés recibir ni enviar. `POST /messages` retorna 403. Webhooks de `messaging` no llegan aunque suscribas.

### E. Review difficulty
**Medium.** Es de los más solicitados y aprobados pero requiere screencast claro: customer envía → bot recibe → bot responde dentro 24h. Saurabh Dhar reporta: "most commonly requested and generally most straightforward to approve" si descripción y screencast están bien.

### F. Overlap con los otros 4
- Cero overlap — los otros 4 son IG/WhatsApp (diferentes plataformas) o webhook setup.
- Confirmado verbatim: NO cubre Instagram.

**Veredicto:** ✅ REQUEST (95%)

---

## 2. `pages_manage_metadata`

### A. Definición oficial verbatim
> *"El permiso pages_manage_metadata permite que tu app se suscriba a webhooks sobre la actividad que ocurre en la página, los reciba y actualice la configuración de la página."*
> ([Meta Permissions Reference](https://developers.facebook.com/docs/permissions/reference/pages_manage_metadata))

**Allowed Usage (verbatim):**
- Subscribe to receive webhooks from your page
- Update page settings

### B. Endpoints que lo requieren
- `POST /<page-id>/subscribed_apps` — **suscribir webhook a la Page** ← crítico para MorfX
- `GET /<page-id>/subscribed_apps` — listar app subscriptions
- `DELETE /<page-id>/subscribed_apps` — desuscribir
- `POST /<page-id>` con campos de configuración (mensajes de bienvenida, ice breakers, etc.)
- Reportes oficiales: GitHub issue ["To subscribe to the feed field, one of these permissions is needed: pages_manage_metadata"](https://github.com/jgorset/facebook-messenger/issues/280) confirma que la suscripción de webhooks lo requiere.

### C. Alternativas más restrictivas
- **Ninguna.** Webhook subscription es a nivel de Page y este es el único permiso que lo habilita post-deprecación de `manage_pages` (legacy 2018).

### D. ¿Qué se rompe sin él?
**Webhook subscription falla** → `subscribed_apps` retorna error → MorfX nunca recibe los mensajes inbound aunque tengas `pages_messaging`. Es el "circuito cerrado": pages_messaging permite procesar, pero pages_manage_metadata permite que LLEGUEN.

### E. Review difficulty
**Medium.** Generalmente aprobado en bundle con `pages_messaging`. Justification: "subscribe to messaging webhooks for connected Pages."

### F. Overlap con los otros 4
- Cero. Es función de infrastructure (webhook subscription) que ningún otro permiso cubre.

**Veredicto:** ✅ REQUEST (90%)

**Nota:** algunos blogs comunitarios mencionan que `pages_messaging` ya cubre webhook subscription para messaging events específicos. **No pude confirmar esto con docs oficiales** — la doc oficial es explícita en que `pages_manage_metadata` es el permiso para `subscribed_apps`. Recomendación: mantener REQUEST para evitar discovery negativo en T-7 warmup. La confianza no es 95% solo porque la mayoría de blogs comunitarios mezclan información legacy (manage_pages) con actual.

---

## 3. `instagram_business_manage_messages`

### A. Definición oficial verbatim
> *"El permiso instagram_business_manage_messages permite que una app acceda a mensajes en una cuenta profesional de Instagram."*
> ([Meta Permissions Reference](https://developers.facebook.com/docs/permissions/reference/instagram_business_manage_messages))

**Allowed Usage (verbatim):**
- View, manage and respond to messages
- Use external CRM tools to manage messages

### B. Endpoints que lo requieren
- `POST /<ig-user-id>/messages` — enviar IG DM
- `GET /<ig-user-id>/conversations` — listar conversaciones
- Webhook receipt de `messages` field para IG accounts
- `GET /<sender-igsid>?fields=name,profile_pic` — sender profile

### C. Alternativas más restrictivas
- Legacy `instagram_manage_messages` — **DEPRECADA Jan 27, 2025** ([SociaVault](https://sociavault.com/blog/instagram-api-deprecated-alternative-2026), [Elfsight Instagram Graph API guide 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)). NO usable. La Business variant es la única ruta moderna.
- No hay sub-scope más restrictivo.

### D. ¿Qué se rompe sin él?
**Todo IG DM.** No podés recibir ni enviar. Si pides la legacy, App Review la rechaza por deprecation.

### E. Review difficulty
**Medium-Hard.** Saurabh Dhar reporta: "Instagram permissions have gotten stricter en 2026." Pero la Business variant es **mejor** que la legacy: solo requiere `instagram_business_basic` como dependency, NO requiere bundle con `pages_read_engagement` ni `pages_show_list`. Esto reduce significativamente el surface area del review.

**Caveat IG sin FB Page:** docs oficiales mencionan "cuenta profesional de Instagram" sin especificar si requiere link a FB Page. La Business API moderna soporta IG accounts standalone (sin FB Page). Esto NO pude verificarlo 100% con un único doc oficial — recomiendo testear con un IG Business account standalone en T-10 warmup script.

### F. Overlap con los otros 4
- Cero overlap. Plataforma distinta (IG ≠ Messenger ≠ WhatsApp).
- **Implicación importante:** la Business variant elimina necesidad de `pages_read_engagement` y reduce dependency en `pages_show_list` (la legacy las requería). Esto SOPORTA el drop de `pages_read_engagement` que ya hicimos.

**Veredicto:** ✅ REQUEST (95%) — usar **Business variant**, no la legacy.

---

## 4. `whatsapp_business_messaging`

### A. Definición oficial verbatim
> *"El permiso whatsapp_business_messaging permite a una app enviar mensajes de WhatsApp y realizar llamadas a un número de teléfono específico."*
> ([Meta Permissions Reference](https://developers.facebook.com/docs/permissions/reference/whatsapp_business_messaging))

**Allowed Usage (verbatim):**
- Send WhatsApp messages
- Upload/retrieve media
- Make WhatsApp calls
- Manage WhatsApp business profile information
- Register phone numbers

### B. Endpoints que lo requieren
- `POST /<phone-number-id>/messages` — enviar mensaje (template + free-form)
- `POST /<phone-number-id>/media` — upload media
- `GET /<media-id>` — retrieve media
- **Webhook de mensajes inbound** ([Meta Webhooks docs](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)): "para recibir webhooks de mensajes específicamente, necesitas `whatsapp_business_messaging`."

### C. Alternativas más restrictivas
- **Ninguna.** No hay variant "receive only" o "template only". Es paquete completo.

### D. ¿Qué se rompe sin él?
- No podés enviar mensajes (template ni free-form)
- No recibís webhooks de mensajes inbound (`messages` field)
- Embedded Signup falla porque la pide automáticamente

### E. Review difficulty
**Hard.** WhatsApp es de los reviews más rigurosos. Requiere WABA funcional + use case claro. Screencast: mostrar mensaje saliendo Y entrando. Saurabh Dhar reporta 7-10 días typical.

### F. Overlap con los otros 4
- Tiene **dependency obligatoria con `whatsapp_business_management`** (#5). Vienen bundled en Embedded Signup.
- Cero overlap con FB/IG permissions (plataforma distinta).

**Hallazgo crítico:** [Search result confirma](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/): *"Para recibir webhooks: `whatsapp_business_messaging` para webhooks de mensajes; `whatsapp_business_management` para todos los demás webhooks (status updates, delivery notifications, etc.)"*. Esto significa que para tracking COMPLETO de status (sent/delivered/read/failed) necesitas AMBOS.

**Veredicto:** ✅ REQUEST (95%)

---

## 5. `whatsapp_business_management`

### A. Definición oficial verbatim
> *"El permiso whatsapp_business_management permite que tu app lea o administre los activos comerciales de WhatsApp que te pertenecen [...] These assets include WhatsApp Business accounts, phone numbers, message templates, QR codes, associated messages, and webhook subscriptions."*
> ([Meta Permissions Reference](https://developers.facebook.com/docs/permissions/reference/whatsapp_business_management))

**Allowed Usage (verbatim):**
- Manage WhatsApp business assets
- Display WhatsApp Business Account analytics in customer portals

### B. Endpoints que lo requieren
- `POST /<waba-id>/message_templates` — crear template
- `GET /<waba-id>/message_templates` — listar templates
- `POST /<waba-id>/phone_numbers` — registrar phone number
- `POST /<waba-id>/subscribed_apps` — suscribir webhook a WABA
- `GET /<waba-id>/analytics` — métricas
- Webhooks de status/delivery/read/quality_update — todos requieren este permiso

### C. Alternativas más restrictivas
- **Ninguna.** Es el permiso umbrella de management de WABA assets.

### D. ¿Qué se rompe sin él?
- No podés crear/listar/editar templates programáticamente
- No registrás phone numbers (Embedded Signup completo falla)
- Webhooks de delivery/read/status no llegan
- **Es DEPENDENCY oficial de `whatsapp_business_messaging`** — no podés tener uno sin el otro

### E. Review difficulty
**Hard.** Misma cola de WhatsApp review (rigurosa). Screencast requirement Meta: *"create message template, OR enable WhatsApp call button via API/UI."*

### F. Overlap con los otros 4
- **Inseparable de `whatsapp_business_messaging`** (#4). Embedded Signup las pide bundled. App Review las evalúa juntas.
- Cero overlap con FB/IG permissions.

**Caso edge:** "¿Si MorfX usa BSP partner que ya creó templates, necesita este permiso?" — **Sí**, porque MorfX hace Embedded Signup direct (no via BSP) según memoria del proyecto. Si fuera via BSP, el BSP podría retener este permiso, pero no es el caso.

**Caso edge:** "¿Si MorfX solo CONSUME templates ya creados (no programáticamente)?" — **Sí, igual lo necesita**, porque (a) es dependency de messaging, (b) los webhooks de status updates lo requieren, (c) phone number registration durante Embedded Signup lo requiere.

**Veredicto:** ✅ REQUEST (90%)

---

## Tabla comparativa final

| Dimensión | `pages_messaging` | `pages_manage_metadata` | `instagram_business_manage_messages` | `whatsapp_business_messaging` | `whatsapp_business_management` |
|---|---|---|---|---|---|
| **Verdict** | REQUEST | REQUEST | REQUEST | REQUEST | REQUEST |
| **Confianza** | 95% | 90% | 95% | 95% | 90% |
| **Plataforma** | FB Messenger | FB Pages (infra) | IG Direct | WhatsApp | WhatsApp (infra) |
| **Cubre send** | ✅ | N/A | ✅ | ✅ | ❌ |
| **Cubre receive (webhook)** | ✅ (procesar) | ✅ (suscribir) | ✅ | ✅ (messages webhook) | ✅ (status/delivery webhooks) |
| **Alternativa más restrictiva** | ❌ | ❌ | ❌ (legacy deprecada) | ❌ | ❌ |
| **Dependency oficial** | — | — | `instagram_business_basic` | `whatsapp_business_management` | — |
| **Review difficulty** | Medium | Medium | Medium-Hard | Hard | Hard |
| **Si NO lo pido** | Messenger no funciona | Webhooks no llegan | IG DMs no funcionan | WhatsApp no funciona | Embedded Signup falla + dep error en messaging |

---

## Permission set final mínimo viable MorfX V1

```
ADVANCED ACCESS (App Review obligatorio) — 5 permisos:

  pages_messaging                       ← FB Messenger send/receive/manage
  pages_manage_metadata                 ← Webhook subscription (subscribed_apps)
  instagram_business_manage_messages    ← IG DM send/receive
  whatsapp_business_messaging           ← WA messaging + receive webhook
  whatsapp_business_management          ← WA assets + status webhooks (dep obligatoria)

ADVANCED ACCESS (CONDITIONAL — verificar contra OAuth implementation):

  instagram_business_basic              ← Dependency oficial de #3 — probable necesario
  pages_show_list                       ← Solo si OAuth necesita listar pages programáticamente

OAuth básico (sin review):

  email
  public_profile
```

**Total review garantizado: 5. Conditional: +0 a +2. Total realista: 5-7.**

Comparación con lista anterior:
- ✅ `business_management` ya estaba dropeado (research previo)
- ✅ `pages_read_engagement` ya estaba dropeado (review previo)
- ✅ Los 5 que quedan son evidence-confirmed
- 🆕 `instagram_business_basic` aparece como dependency oficial de #3 — probablemente moverlo a CONDITIONAL alta confianza
- ⚠️ `pages_show_list` sigue dependiendo del OAuth flow (page-picker hosted vs programmatic listing)

---

## Edge cases / excepciones que cambiarían veredicto

1. **MorfX decide migrar a BSP partner para WhatsApp** → puede dropear `whatsapp_business_management` (BSP lo retiene). Improbable per memoria del proyecto (Embedded Signup directo es la decisión).

2. **IG account standalone (sin FB Page link)** → `instagram_business_manage_messages` debería seguir funcionando per docs ("cuenta profesional de Instagram") pero NO está 100% verificado. Test en T-10 warmup.

3. **Meta deprecate `pages_manage_metadata` y consolide en `pages_messaging`** → si pasa antes del submit, ajustar. Sin evidencia de que esto vaya a pasar 2026.

4. **MorfX agrega outbound proactivo fuera 24h** → necesitará `pages_messaging_subscriptions` adicional (defer V2 según Bible §17.1).

5. **MorfX agrega features tipo IG story replies, comment replies** → necesitará `instagram_manage_comments` adicional. No en V1 scope.

---

## Hallazgos sorprendentes

1. **Legacy `instagram_manage_messages` deprecada Jan 27, 2025** — confirma que NO podemos pedirla. Único path es la Business variant. Esto era "preferencia" en el Bible §20.4 pero realmente es **mandatorio**.

2. **WhatsApp permissions inseparables** — `whatsapp_business_management` es Related Permission/dependency oficial de `whatsapp_business_messaging`. Embedded Signup las pide bundled. **No es decisión, es paquete.** Esto debería actualizarse en Bible §5 que las trataba como independientes.

3. **`pages_messaging` NO cubre Instagram** — confirmado verbatim. A pesar de que IG está bajo Messenger Platform desde 2021, los permisos siguen siendo separados. Esto significa que pedir solo `pages_messaging` NO te da IG DMs.

4. **WhatsApp webhook bifurcation** — `whatsapp_business_messaging` para `messages` webhook, `whatsapp_business_management` para todos los demás (status, delivery, quality, account_update). Para tracking completo necesitás ambos. Esto refuerza por qué los 2 son inseparables.

5. **No pude confirmar 100%** que `pages_manage_metadata` sea estrictamente necesario para webhook receive (solo para subscribe). La doc oficial es explícita en `subscribed_apps` requiring it, pero algunos blogs comunitarios mezclan info legacy. **Recomendación: mantener REQUEST y verificar empíricamente en T-10 warmup script.**

---

## Fuentes

- [Meta Permissions Reference](https://developers.facebook.com/docs/permissions/) — definiciones oficiales
- [pages_messaging](https://developers.facebook.com/docs/permissions/reference/pages_messaging)
- [pages_manage_metadata](https://developers.facebook.com/docs/permissions/reference/pages_manage_metadata)
- [instagram_business_manage_messages](https://developers.facebook.com/docs/permissions/reference/instagram_business_manage_messages)
- [whatsapp_business_messaging](https://developers.facebook.com/docs/permissions/reference/whatsapp_business_messaging)
- [whatsapp_business_management](https://developers.facebook.com/docs/permissions/reference/whatsapp_business_management)
- [WhatsApp Cloud API Webhook Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/) — confirma bifurcación de webhooks
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/) — Business Login flow
- [Elfsight Instagram Graph API Guide 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/) — confirma deprecation legacy
- [SociaVault — Instagram API deprecated 2026](https://sociavault.com/blog/instagram-api-deprecated-alternative-2026)
- [GitHub Issue #280 — pages_manage_metadata required](https://github.com/jgorset/facebook-messenger/issues/280)
- [ManyChat — Meta Business Partner status](https://help.manychat.com/hc/en-us/articles/18624810395932-Is-Manychat-officially-approved-by-Meta)
- [Webhooks for Pages — Meta](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-pages/)

---

**Limitación de evidencia honesta:**
- Apps comparables (ManyChat, Tidio, Drift, Intercom, etc.) **NO publican sus permission sets exactos**. La afirmación "todos lo usan" o "ninguno lo usa" no es verificable con docs públicos. Conclusión basada en docs oficiales de Meta + dependencies declaradas + experiencias documentadas en Saurabh Dhar / foros.
- ManyChat es Meta Business Partner oficial — puede tener acceso a permisos no estándar via partnership. NO es comparison directa para MorfX V1.

**Fin del documento.**
