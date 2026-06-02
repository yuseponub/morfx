# Meta App Category Analysis — MorfX

**Date:** 2026-05-07
**Question:** Which of Meta's 13 App Categories should MorfX select in App Settings → Basic, given its B2B multi-tenant SaaS use case (FB Messenger + Instagram DM + WhatsApp Cloud API + AI agents + CRM)?

**Bottom-line answer:** **"Messenger Bots for Business"** ✅

---

## Resumen ejecutivo

After fetching Meta's official category definitions page directly ([developers.facebook.com/docs/development/create-an-app/app-dashboard/app-categories/](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/app-categories/)), the answer is unambiguous:

**Meta's verbatim definition of "Messenger Bots for Business":** *"Apps que conectan negocios y personas a través de bots de Messenger"* (Apps that connect businesses and people through Messenger bots) — examples: alerts, subscriptions, and business information services.

This is **exactly** what MorfX does on FB Messenger and Instagram DM. The match is not directional — it's verbatim.

**Meta's verbatim definition of "Business and Pages":** *"Apps creadas para ayudar a los negocios a compartir contenido, colaborar y planificar"* — examples: package tracking, remote desktops, email management.

This does **NOT** match MorfX. MorfX is not a content/collaboration tool. It's a customer-engagement bot.

### Ranking final

| Rank | Categoría | Match Score | Evidencia clave |
|---|---|---|---|
| 🥇 1° | **Messenger Bots for Business** | ✅ 9/10 | Definición oficial + ejemplos = caso de uso de MorfX literal |
| 🥈 2° | **Business and Pages** | ⚠️ 4/10 | Definición oficial + ejemplos NO matchean MorfX (package tracking, remote desktops) |
| 🥉 3° | **Utility & Productivity** | ⚠️ 3/10 | Productividad genérica (GPS, file sharing) — no customer engagement |
| ❌ | Las 10 restantes | 0-2/10 | Off-topic confirmado |

### Decisión

**Selecciona "Messenger Bots for Business"** con 90%+ confianza. Es la única categoría cuyo lenguaje oficial de Meta describe MorfX sin necesidad de stretching.

---

## Evidencia crítica: la categoría afecta el outcome del review

**Verbatim de un rejection real de Meta** (caso del foro):

> *"The Games category you selected for your app does not appear to represent its core functionality. Update the category in App Settings and resubmit for review."*

[Source — Reasons Apps Aren't Approved](https://www.facebook.com/business/help/505825226263662)

**Implicación:** elegir una categoría que no matchee con los permisos pedidos / el demo video = rejection automático. Por eso vale la pena pensarlo bien antes del primer submission.

**Meta también dice:** *"Making changes to your app's basic or advanced settings after you have submitted may require re-review."* [Source — Submitting For Review](https://developers.facebook.com/docs/app-review/submission-guide/)

Por lo tanto: cambiar categoría post-Live = re-review trigger = atrasa todo. Hay que elegirla bien la primera vez.

---

## Análisis por categoría (las 13)

Cada categoría incluye: definición oficial verbatim de Meta, ejemplos oficiales, encaje con MorfX, riesgo en review, veredicto.

### 1. Business and Pages ⚠️

**Definición oficial:** *"Apps creadas para ayudar a los negocios a compartir contenido, colaborar y planificar."*

**Ejemplos oficiales (Meta):** package tracking, remote desktops, email management apps.

**Análisis MorfX:**
- ❌ "compartir contenido" → MorfX no comparte contenido, automatiza conversaciones bidireccionales
- ❌ "colaborar y planificar" → MorfX no es Slack/Asana/Trello
- ❌ Ejemplos (package tracking, remote desktops, email management) → géneros completamente distintos a customer-engagement bots
- ⚠️ El nombre "Business" sugiere fit por ser SaaS B2B, pero la **descripción oficial** no respalda eso

**Risk/reward:** Riesgo medio-alto. Reviewers podrían cuestionar "¿por qué esta categoría si tu demo muestra bots conversando con clientes finales?"

**Apps reales que probablemente la usan:** Buffer, Hootsuite, Sprout Social (scheduling de posts), HubSpot CRM (sin bots), Mailchimp.

**Veredicto:** ⚠️ **Candidata débil** — la única razón para elegirla sería conservadurismo ("suena más genérico"), pero no es lo que la definición oficial respalda.

---

### 2. Community & Government ❌

**Definición oficial:** *"Apps que apoyan eventos locales, organizaciones y asociaciones locales, organismos gubernamentales y agrupaciones políticas."*

**Ejemplos oficiales:** legislation tracking applications.

**Análisis MorfX:** No aplica. MorfX no es ni cívica ni gubernamental.

**Veredicto:** ❌ Descartada con certeza.

---

### 3. Education ❌

**Definición oficial:** *"Apps centradas en la enseñanza de competencias y temas."*

**Ejemplos oficiales:** math, language learning, standardized test prep, school portals, special education resources.

**Análisis MorfX:** No aplica. MorfX no enseña; automatiza conversaciones comerciales.

**Veredicto:** ❌ Descartada con certeza.

---

### 4. Entertainment ❌

**Definición oficial:** *"Apps diseñadas para entretener al usuario. Estas apps pueden tener audio, imágenes y otros tipos de contenido."*

**Ejemplos oficiales:** TV, film, music, books, fan clubs, theater, ticketing services.

**Análisis MorfX:** No aplica. MorfX es B2B SaaS; el cliente final no usa MorfX para entretenerse.

**Veredicto:** ❌ Descartada con certeza.

---

### 5. Games ❌

**Definición oficial:** *"Apps en las que jugar es la interacción principal. Los juegos pueden ser en solitario o multijugador."*

**Restricción:** Requiere seleccionar subcategoría (action, puzzle, strategy, sports, etc.).

**Análisis MorfX:** No aplica. **Importante:** este es justamente el ejemplo de rejection verbatim que encontré ("The Games category you selected does not appear to represent its core functionality"). MorfX seleccionar Games = rejection garantizado.

**Veredicto:** ❌ Descartada con certeza.

---

### 6. Lifestyle ❌

**Definición oficial:** *"Apps que se centran en el estilo de vida y el mejoramiento personal, incluidos los blogs."*

**Ejemplos oficiales:** travel, fashion, health, fitness, parenting, home improvement.

**Análisis MorfX:** No aplica.

**Veredicto:** ❌ Descartada con certeza.

---

### 7. Messaging ❌ (CRÍTICO — frecuentemente confundida)

**Definición oficial:** *"Apps que conectan a las personas entre sí a través de texto, fotos, voz y videos."*

**Ejemplos oficiales:** text, voice, video communication, photo/video sharing.

**Análisis MorfX:**
- ❌ **"conectan a las personas entre sí"** → consumer-to-consumer messaging apps. MorfX NO es eso.
- ❌ MorfX intermedia conversaciones business↔customer, no customer↔customer
- ❌ Apps de esta categoría: Signal, Telegram, Discord, WhatsApp clones, Snapchat — apps de mensajería pura

**Risk/reward:** Riesgo MUY alto. Reviewer abre app esperando consumer messaging app y ve bot framework B2B = mismatch obvio = rejection.

**Veredicto:** ❌ **Descartada con alta confianza** — la definición oficial dice "personas entre sí", no "negocios y personas".

---

### 8. Messenger Bots for Business ✅ (RECOMENDACIÓN)

**Definición oficial:** *"Apps que conectan negocios y personas a través de bots de Messenger."*

**Ejemplos oficiales:** alerts, subscriptions, and business information services.

**Análisis MorfX:**
- ✅ **"conectan negocios y personas a través de bots"** → MorfX literal: business clients usan MorfX → bots de IA conversan con sus customers en FB/IG
- ✅ "alerts" → MorfX manda confirmaciones de pedido, recordatorios de citas
- ✅ "subscriptions" → MorfX gestiona retomas / recompras de Somnio (subscripciones implícitas)
- ✅ "business information services" → MorfX responde preguntas sobre productos, precios, sedes (caso GoDentist FB/IG)
- ✅ Permisos pedidos por MorfX: 5 de 7 son `pages_messaging` / `instagram_manage_messages` / soporte de mensajería → 100% match con la categoría

**¿Cubre Instagram?** Pregunta abierta. Meta no lo dice explícitamente. Pero:
- Instagram Messaging API runs on Messenger Platform infrastructure desde 2021
- No existe categoría separada "Instagram Bots for Business"
- En la práctica, apps de B2B chatbot multi-canal (ManyChat, Chatfuel, SendPulse, Tidio) tratan Messenger + IG DM como un solo canal
- Conclusión razonable: la categoría cubre IG DM por extensión

**¿Disparan policies anti-spam más estrictas?** No encontré evidencia de eso. Las policies de Messenger Platform (24h window, opt-in para subscriptions) aplican a TODA app que use `pages_messaging`, no solo a las de esta categoría. La elección de categoría no agrava el escrutinio — solo lo alinea.

**¿Casos de B2B SaaS multi-feature que la usaron y fueron aprobados?** No pude confirmar caso por caso (apps no exponen su Meta App Category públicamente), pero el ecosistema entero de chatbot SaaS (ManyChat, Chatfuel, Tidio, SendPulse, Customers.ai) opera bajo este caso de uso. Si la categoría no funcionara para B2B multi-feature, no existirían.

**Risk/reward:** Match óptimo. Reviewer abre app → ve permisos messaging → ve categoría "Messenger Bots for Business" → ve demo de bot conversando con cliente → coherencia total → aprobación más fluida.

**Veredicto:** ✅ **Candidata fuerte — recomendación principal con 90%+ confianza.**

---

### 9. News ❌

**Definición oficial:** *"Apps que se centran en temas de actualidad, como la política, el entretenimiento, los negocios, la ciencia y la tecnología."*

**Análisis MorfX:** No aplica.

**Veredicto:** ❌ Descartada.

---

### 10. Quizzes & Horoscopes ❌

**Definición oficial:** *"Apps que generan resultados personalizados a partir de una serie de preguntas o el perfil social."*

**Análisis MorfX:** No aplica.

**Veredicto:** ❌ Descartada.

---

### 11. Shopping ❌

**Definición oficial:** *"Apps relacionadas con la búsqueda y compra de productos."*

**Ejemplos oficiales:** product search, purchasing, product review applications.

**Análisis MorfX:**
- ⚠️ MorfX maneja pedidos y CRM con productos → tangente
- ❌ Pero MorfX NO es un app de búsqueda/compra de productos. Es una herramienta de automatización de comunicación con clientes que pueden estar comprando.
- ❌ MorfX no hace recommendations, search, browsing como Amazon/Mercado Libre

**Veredicto:** ❌ Descartada — el core de MorfX no es shopping discovery.

---

### 12. Social Networks & Dating ❌

**Definición oficial:** *"Apps que conectan a personas con redes."*

**Ejemplos oficiales:** dating apps, professional networks, social platforms.

**Análisis MorfX:** No aplica.

**Veredicto:** ❌ Descartada.

---

### 13. Utility & Productivity ⚠️

**Definición oficial:** *"Apps que se centran en la organización, la resolución de problemas y el mejoramiento de procesos."*

**Ejemplos oficiales:** GPS navigation, file sharing, password management, Q&A forums.

**Análisis MorfX:**
- ⚠️ "mejoramiento de procesos" → vagamente aplicable a CRM/automation
- ❌ Ejemplos oficiales (GPS, file sharing, password management) → herramientas de productividad personal, no plataformas de engagement con clientes
- ❌ MorfX no es internal productivity, es customer-facing automation

**Risk/reward:** Riesgo medio. Reviewer ve "Utility & Productivity" → espera herramienta de productividad → ve permisos de messaging y demos de bots conversando con customers → mismatch.

**Veredicto:** ⚠️ Tercera opción de fallback, pero no recomendada.

---

## Tabla comparativa final

| Categoría | Definición oficial vs MorfX | Ejemplos oficiales vs MorfX | Encaje permisos pedidos | Risk de rejection | Veredicto |
|---|---|---|---|---|---|
| Business and Pages | "compartir contenido, colaborar, planificar" → ❌ | package tracking, remote desktop, email mgmt → ❌ | Parcial — `business_management` matchea pero `pages_messaging` no es "compartir contenido" | Medio — reviewer puede cuestionar mismatch | ⚠️ Débil 2° |
| Community & Government | civic/political → ❌ | legislation tracking → ❌ | Cero | Alto | ❌ |
| Education | teaching skills → ❌ | math/lang/test prep → ❌ | Cero | Alto | ❌ |
| Entertainment | entertain users → ❌ | TV/film/music → ❌ | Cero | Alto | ❌ |
| Games | playing as main interaction → ❌ | requires subcategory → ❌ | Cero — además ejemplo de rejection verbatim | Crítico (rejection garantizado) | ❌ |
| Lifestyle | self-improvement → ❌ | travel/fashion/health → ❌ | Cero | Alto | ❌ |
| Messaging | "personas entre sí" (C2C) → ❌ | text/voice/video apps → ❌ | Confunde C2C con B2C — mismatch obvio | Crítico (mismatch dramatico) | ❌ |
| **Messenger Bots for Business** | "conectan negocios y personas a través de bots" → ✅ | alerts, subscriptions, business info → ✅ | 100% match con `pages_messaging` + `instagram_manage_messages` | Bajo — coherencia total | ✅ **1° lugar** |
| News | current topics → ❌ | news outlets → ❌ | Cero | Alto | ❌ |
| Quizzes & Horoscopes | personalized results from quizzes → ❌ | quizzes/horoscopes → ❌ | Cero | Alto | ❌ |
| Shopping | search/purchase products → ❌ | product search/review → ❌ | Tangente (CRM tiene products pero MorfX no es shopping) | Medio | ❌ |
| Social Networks & Dating | connect to networks → ❌ | dating/professional → ❌ | Cero | Alto | ❌ |
| Utility & Productivity | "organización, procesos" → ⚠️ | GPS/file/password/Q&A → ❌ | Vago — no customer engagement | Medio | ⚠️ Débil 3° |

---

## Casos comparables

No pude obtener evidencia directa de qué categoría usaron HubSpot, ManyChat, Sprout Social, Zendesk, etc. (Meta no expone esto públicamente y los blogs corporativos no lo discuten). Pero análisis del comportamiento:

| App | Use case | Categoría más probable |
|---|---|---|
| **ManyChat** | Chat marketing automation FB/IG/WA — exact MorfX peer | Messenger Bots for Business |
| **Chatfuel** | No-code Messenger bots | Messenger Bots for Business |
| **Tidio** | Live chat + chatbots | Messenger Bots for Business |
| **SendPulse** | Multi-channel chatbot (FB/IG/WA/TG/TikTok) | Messenger Bots for Business |
| **HubSpot CRM** | CRM + email + (no FB bots primary) | Business and Pages |
| **Buffer / Hootsuite** | Social media scheduling | Business and Pages |
| **Sprout Social** | Social analytics + scheduling | Business and Pages |
| **Zendesk** | Helpdesk + chat (multi-channel) | Probably Messenger Bots for Business o Utility & Productivity |

**Patrón:** Apps con primary FB/IG bot use case → Messenger Bots for Business. Apps que primario es page management/scheduling/analytics → Business and Pages. MorfX cae en el primer grupo.

---

## Decision tree

```
¿Tu app primary use case son bots conversando con customers en FB/IG?
├── SÍ → Messenger Bots for Business ✅
└── NO
    ├── ¿Tu app es scheduling/analytics/posting de páginas?
    │   ├── SÍ → Business and Pages
    │   └── NO
    │       ├── ¿Tu app es productivity/utility para businesses?
    │       │   ├── SÍ → Utility & Productivity
    │       │   └── NO → revisar otras categorías
```

**Para MorfX:** rama 1 → SÍ → Messenger Bots for Business.

---

## Caveats / hallazgos sorprendentes

1. **Meta NO documenta criterios de fit por categoría públicamente** — solo da definiciones cortas. Los devs tienen que inferir. Esta es una de las razones por las que el research del usuario es valioso (reduce ambigüedad antes de submit).

2. **App Type ≠ App Category** — distinción importante:
   - **App Type** (Business / Consumer / Gaming / None): se elige al crear la app, **NO se puede cambiar**, determina qué productos y permisos se pueden pedir. Para MorfX = "Business".
   - **App Category** (los 13): se elige en Basic Settings, SÍ se puede cambiar (con riesgo de re-review), es informacional.
   - Algunos tutoriales viejos confunden los dos términos.

3. **Categoría cambiable post-Live, pero con costo** — Meta dice "may require re-review". En la práctica, cambios pequeños tipo categoría no siempre disparan re-review pero pueden hacerlo. Mejor elegirla bien la primera vez.

4. **Multi-canal (FB+IG+WA) no tiene categoría unificada** — la categoría se elige por la app entera, no por permiso. Para MorfX que combina Messenger Platform (FB+IG) + WhatsApp Cloud API en una sola Meta App, "Messenger Bots for Business" cubre las 3 funcionalmente porque el use case (bots conectando businesses con personas) es idéntico aunque el canal varíe.

5. **No hay evidencia de stricter scrutiny por elegir "Messenger Bots for Business"** — antes hipotetizé que esa categoría podría disparar policies anti-spam más fuertes, pero buscando no encontré evidencia. Las policies de Messenger Platform (24h window, opt-in subscriptions, no spam) aplican a TODA app con `pages_messaging`, sin importar la categoría declarada.

6. **MorfX tiene un sibling agent `godentist-fb-ig` ya en producción** (shipped 2026-05-05) que actualmente recibe mensajes vía ManyChat. Cuando MorfX migre a Meta directo, "Messenger Bots for Business" será coherente con el track record real (FB/IG bot operativo), no especulativo.

---

## Recomendación final (200 palabras)

**Selecciona "Messenger Bots for Business"** en Meta App Settings → Basic → Category.

La definición oficial de Meta (*"Apps que conectan negocios y personas a través de bots de Messenger"*) describe MorfX literalmente. Los tres ejemplos que Meta da para esta categoría — alerts, subscriptions, business information services — son exactamente lo que MorfX hace en FB/IG (confirmaciones de pedido, retomas, info de productos/sedes). 5 de los 7 permisos que MorfX pide son messaging-centric (`pages_messaging`, `instagram_manage_messages`, soporte), lo que crea coherencia total entre categoría declarada y permisos requeridos — exactamente lo que reviewers premian para aprobar rápido.

La alternativa "Business and Pages" parecía conservadora pero la definición oficial de Meta para esa categoría (*"compartir contenido, colaborar y planificar"* con ejemplos package tracking / remote desktops / email management) NO matchea MorfX. Elegirla introduciría mismatch sutil que reviewers detectan y cuestionan.

"Messaging" es activamente peligroso porque la definición de Meta (*"conectan personas entre sí"*) es explícitamente consumer-to-consumer, mientras que MorfX es business-to-customer.

Riesgo de elegir Messenger Bots for Business: bajo. Coherencia con permisos: total. Riesgo de re-review post-Live por mal pick inicial: cero.

**Confianza: 90%+.**

---

## Fuentes

### Documentación oficial Meta

- [App Categories — Meta for Developers (definiciones verbatim de los 13)](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/app-categories/)
- [App Types — Meta for Developers (Business vs Consumer vs Gaming vs None)](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/app-types/)
- [App Dashboard — Basic Settings](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/)
- [App Review — Submission Guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [App Review — Common Mistakes](https://developers.facebook.com/docs/app-review/submission-guide/common-mistakes)
- [App Review — Messenger Rejection Guide](https://developers.facebook.com/docs/app-review/support/rejection-guides/messenger/)
- [App Review — Instagram Platform](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Messenger Platform Sample Submission](https://developers.facebook.com/docs/app-review/resources/sample-submissions/messenger-platform/)
- [Submitting For Review — re-review trigger guidance](https://developers.facebook.com/docs/app-review/submission-guide/)
- [Reasons Apps Aren't Approved (rejection verbatim source)](https://www.facebook.com/business/help/505825226263662)
- [About App Review — Meta Business Help Center](https://www.facebook.com/business/help/1122417471594221)
- [Live Mode Requirements](https://developers.facebook.com/blog/post/2019/09/23/live-mode-for-production-use/)

### Blogs / community / forums

- [Saurabh Dhar — Meta App Approval Guide 2025](https://www.saurabhdhar.com/blog/meta-app-approval-guide)
- [Saurabh Dhar — App Rejected: Disallowed Use Case](https://www.saurabhdhar.com/blog/app-rejected-disallowed-use-case-details-meta-rejection)
- [Kevit Technologies — How to get your Facebook App reviewed](https://medium.com/kevit-technologies/how-to-get-your-facebook-app-reviewed-5db98c4e604c)
- [Dancer's Code — Navigating Facebook App Review](https://dancerscode.com/posts/navigating-the-facebook-app-review-process/)
- [Mixpost — Facebook App Review docs](https://docs.mixpost.app/services/social/facebook/app-review/)
- [Web Tech Services — Meta App Review Accelerator](https://web-techservices.com/meta-app-review)
- [Respond.io — Skip Facebook Bot Verification](https://respond.io/blog/skip-facebook-bot-verification)
- [Chatwoot Discussion — Messenger Integration Issues](https://github.com/orgs/chatwoot/discussions/3397)
- [Unipile — Instagram API Access Guide](https://www.unipile.com/instagram-api-access-i-a-full-guide-for-saas-editors-by-unipile/)
- [Bot.space — Instagram DM API Guide](https://www.bot.space/blog/the-instagram-dm-api-your-ultimate-guide-to-automation-sales-and-customer-loyalty-svpt5)
- [SourceCoast Forum — Facebook App Review Rejection](https://www.sourcecoast.com/forums/jfbconnect-joomla-3x-support/13171-facebook-app-review-rejection)

### Comparable B2B SaaS (categoría inferida, no confirmada)

- [ManyChat — Chat Marketing Automation](https://manychat.com/)
- [Chatfuel — WhatsApp Business API + Messenger](https://chatfuel.com/)
- [Tidio — Live Chat + AI Chatbots](https://www.tidio.com/blog/manychat-review/)
- [SendPulse — Multi-channel chatbots](https://sendpulse.com/features/chatbot/facebook)
- [Zendesk Facebook chatbots guide](https://www.zendesk.com/service/messaging/facebook-chatbot/)
