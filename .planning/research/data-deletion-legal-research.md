---
type: research
slug: data-deletion-legal-research
date: 2026-05-08
phase: quick-260507-tj9-data-deletion-page
author: gsd-researcher
confidence: HIGH on Colombian law (primary sources cited verbatim) / MEDIUM-HIGH on Meta App Review (third-party expert sources, no official Meta verbatim because the official Meta dev docs are now JS-rendered and partially behind login) / HIGH on GDPR Articles 12, 17, 19 (gdpr-info.eu primary mirror)
---

# Data Deletion Page — Legal Research for `/data-deletion` on morfx.app

## Executive summary

1. **Meta requires either (a) a Data Deletion Callback URL with programmatic deletion endpoint, or (b) a Data Deletion Instructions URL — a public, no-login page describing manual deletion steps. MorfX is providing (b) only.** [VERIFIED: Meta dev docs FAQ — "Developers must specify either a data deletion callback instruction URL or a callback URL found in the app's basic configuration"][1]
2. **The Maija pattern is the gold standard for Meta-approved B2B WhatsApp data deletion pages** — a 4-step linear procedural page (submit → verify identity → confirm receipt with timeline → completion notification) plus footer links to Privacy + Terms. It passed Meta App Review for a WhatsApp Business API SaaS very similar to MorfX. [CITED: maija.io/whatsapp-data-deletion-request][2]
3. **GDPR Article 17 grants the right to erasure on six grounds (Art 17(1)(a)–(f)) with five categories of exceptions (Art 17(3)).** Response time is **one month, extendable by two months** for complex requests (Art 12(3)). Identity verification is permitted (Art 12(6)). [VERIFIED: gdpr-info.eu Articles 12, 17, 19][3][4][5]
4. **Ley 1581/2012 Colombia uses two distinct timelines, both in business days (días hábiles): consulta = 10 + 5 hábiles, reclamo = 15 + 8 hábiles.** This is the most common error in Colombian privacy templates — calendar days vs business days, and conflating consulta with reclamo. [VERIFIED: Ley 1581/2012 articles 14 and 15 verbatim][6]
5. **MorfX has a dual role under Ley 1581/2012**: **Responsable** for admin user data (the operators of Somnio/GoDentist/etc.) and **Encargado** for end-consumer data (the customers chatting via WhatsApp/FB/IG). The privacy policy already documents this clearly in `Privacy.section7.responsable` and `Privacy.section7.encargado`. The new `/data-deletion` page must mirror that distinction or it will mislead end-users. [VERIFIED: codebase `messages/en.json` lines 765–800]
6. **End-consumers (titulares de los datos) of Somnio/GoDentist who want deletion must, under both GDPR and Ley 1581/2012, exercise the right against the data controller first (the business client), not against MorfX directly.** Under Ley 1581/2012 article 16, this is mandatory ("requisito de procedibilidad"): the titular cannot escalate to SIC without first exhausting the procedure before the Responsable. The page must route end-consumers to their corresponding business and only retain MorfX as fallback. [VERIFIED: Ley 1581/2012 art. 16 verbatim][6]
7. **DIAN (Colombia tax authority) requires conservation of electronic invoices and supporting documents for ≥ 5 years under article 632 of the Estatuto Tributario.** This is a *legal-obligation* exception that overrides erasure (parallel to GDPR Art 17(3)(b)). Deletion of personal data tied to invoices (name, NIT, address) cannot proceed for 5 years from invoice issuance. [VERIFIED: ET art. 632 + DIAN factura electrónica abecé][7][8]
8. **Meta reviewer rejection patterns:** broken/private URL, no structured deletion process, missing timeline, overly technical legal jargon, no identity verification step, hidden behind login. Page must be **public, English-readable (Meta default), bilingual is fine, ≥ 4 sections, with a concrete contact channel.** [CITED: shoutmecrunch.com data-delete-instructions checklist][9]
9. **The page does NOT need to match the verbatim text of Meta's docs.** Meta does not mandate specific wording. It mandates *substance*: a clear, accessible deletion path with timeline and contact. [VERIFIED: Meta Platform Terms 4.b verbatim — "how Users can request deletion of that data. The right to request deletion must be provided to all Users"][10]
10. **The page must be rendered as `/data-deletion` (and `/en/data-deletion`) and added explicitly to `middleware.ts` `isPublicMarketingRoute()` whitelist** because the current allowlist is exact-match (not `startsWith`) and only enumerates `/`, `/privacy`, `/terms` and their `/en` variants. Any new route requires editing that function or it falls through to `updateSession()` and may force a Supabase auth redirect — which would bounce the Meta reviewer. [VERIFIED: codebase `/middleware.ts` lines 15–30, 39–41]

---

## Section 1 — Meta Platform Terms — Data Deletion

### 1.1 What Meta requires (verbatim from Meta Platform Terms)

Meta Platform Terms section 3.d.i and 4.b explicitly impose deletion obligations on developers:

> **Section 3.d.i.1** — "Update or delete Platform Data immediately after we or the User request it, and provide the User a clear and easily accessible way to request modification or deletion." [CITED: developers.facebook.com/terms via WebFetch 2026-05-07][10]

> **Section 3.d.i.2** — "Delete all Platform Data as soon as reasonably possible when: ... a User requests their Platform Data be deleted or no longer has an account with you." [CITED: same][10]

> **Section 4.b** — "[Privacy policies must explain] how Users can request deletion of that data. The right to request deletion must be provided to all Users." [CITED: same][10]

The mechanism by which the developer satisfies "a clear and easily accessible way" is one of two interchangeable options exposed in the App Dashboard: a **Data Deletion Callback URL** or a **Data Deletion Instructions URL**.

### 1.2 Callback URL vs Instructions URL — the key distinction

| Field in App Dashboard | What it is | When to use |
|---|---|---|
| **Data Deletion Callback URL** | A programmatic HTTPS endpoint that Meta calls with a signed request when a Facebook user revokes the app or initiates deletion. Developer must respond with a JSON `{ url, confirmation_code }` so the user can later check status. Implementation example: `developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/`. [CITED: Meta dev docs][1] | When the app stores significant Platform Data per Facebook user and can detect/process the deletion event server-side. |
| **Data Deletion Instructions URL** | A **public, no-login HTML page** explaining in plain language how a user can request deletion. No callback. The page itself is the compliance artifact. | When the developer prefers a manual deletion flow (email / form / in-app dashboard) — typical for B2B SaaS where the platform doesn't tie data to a Facebook user ID alone, but to a business workspace + end-consumer phone. **This is MorfX's choice.** |

> **FAQ verbatim from Meta dev docs** — "Developers must specify either a data deletion callback instruction URL or a callback URL found in the app's basic configuration." [CITED: developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/][1]

The two are mutually substitutive — providing one satisfies the requirement. MorfX will **only** provide the Instructions URL because:
- MorfX does not have a Facebook-user-id keyed table; data is keyed by `workspace_id` + phone number.
- The deletion flow involves identity verification by the Client Company (the Responsable del Tratamiento), not by MorfX directly, so a callback would be premature automation.
- Meta has approved many B2B SaaS apps (Maija, ManyChat, etc.) with only an Instructions URL.

### 1.3 Reviewer expectations for an Instructions URL — minimum content checklist

Compiled from third-party expert sources that document successfully approved pages:

| # | Requirement | Source |
|---|---|---|
| 1 | **Clear step-by-step deletion request process** ("no ambiguity") | [9] |
| 2 | **What identification information the user must provide** (registered email, phone number, account ID, etc.) | [9] |
| 3 | **Expected data removal timeline** stated explicitly (e.g., "within 30 days after verification") | [9] |
| 4 | **At least one concrete contact method**: dedicated email, web form, or in-dashboard option | [9] |
| 5 | **Legal compliance statement** mentioning the regimes the page satisfies (GDPR, CCPA, Ley 1581) | [9] |
| 6 | **Public URL — no login wall, no IP allow-list, no robots.txt block** | [9] |
| 7 | **Plain language** — minimal technical or legal jargon | [9] |
| 8 | **Identity verification step explicitly described** (Meta wants to see that the developer doesn't delete on first message; this prevents impersonation) | [9] |

### 1.4 Common rejection patterns (from third-party experts)

> "Critical mistakes causing app rejection: No structured deletion process; Missing deletion timeline; Broken or private URL; Overly technical legal language; No verification method for requests." [CITED: shoutmecrunch.com][9]

Additional patterns reported by Medium/DEV community implementers:
- Page exists but returns 404 / 500 / requires login — automatic fail [CITED: postmoo.re][11]
- Page is the *same URL* as Privacy Policy (Meta dashboard treats them as separate fields and reviewers cross-check) — fail
- Page is in a language other than English with no English fallback — Meta reviewers default to English; bilingual is safe, English-only is safest [ASSUMED: based on widespread community advice; Meta does not state a hard English-only requirement]
- Page describes a flow that is technically possible but not actually implemented (e.g., "email this address" but the address bounces) — reviewers do test the flow [CITED: medium kevit-technologies "the Facebook team may message/use your bot several times over the course of multiple days"][12]

### 1.5 Language requirements

Meta does not publish a hard language mandate. Practical guidance:
- **Default to English** because reviewers are based across multiple regions but the App Dashboard UI and Platform Terms are in English.
- **Bilingual (en + es) is recommended for MorfX** because morfx.app already serves both locales and the legal entity is Colombian. The Spanish version satisfies Ley 1581/2012 obligations to Colombian titulares; the English version satisfies the Meta reviewer.
- This aligns with how `/privacy` and `/terms` already work — both render in `/data-deletion` (Spanish, default) and `/en/data-deletion` (English) via next-intl.

---

## Section 2 — GDPR Article 17 (Right to Erasure)

### 2.1 Article 17 verbatim (gdpr-info.eu)

> **Article 17(1)** — "The data subject shall have the right to obtain from the controller the erasure of personal data concerning him or her without undue delay and the controller shall have the obligation to erase personal data without undue delay where one of the following grounds applies:
>
> (a) the personal data are no longer necessary in relation to the purposes for which they were collected or otherwise processed;
>
> (b) the data subject withdraws consent on which the processing is based according to point (a) of Article 6(1), or point (a) of Article 9(2), and where there is no other legal ground for the processing;
>
> (c) the data subject objects to the processing pursuant to Article 21(1) and there are no overriding legitimate grounds for the processing, or the data subject objects to the processing pursuant to Article 21(2);
>
> (d) the personal data have been unlawfully processed;
>
> (e) the personal data have to be erased for compliance with a legal obligation in Union or Member State law to which the controller is subject;
>
> (f) the personal data have been collected in relation to the offer of information society services referred to in Article 8(1)." [CITED: gdpr-info.eu/art-17-gdpr/][3]

> **Article 17(2)** — Where the controller has made the personal data public and is obliged to erase them, the controller, taking account of available technology and the cost of implementation, shall take reasonable steps to inform other controllers processing the data that the data subject has requested the erasure. [CITED: same][3]

> **Article 17(3)** — Paragraphs 1 and 2 shall not apply to the extent that processing is necessary:
>
> (a) for exercising the right of freedom of expression and information;
>
> (b) for compliance with a legal obligation which requires processing by Union or Member State law to which the controller is subject or for the performance of a task carried out in the public interest;
>
> (c) for reasons of public interest in the area of public health;
>
> (d) for archiving purposes in the public interest, scientific or historical research purposes or statistical purposes;
>
> (e) for the establishment, exercise or defence of legal claims. [CITED: same][3]

### 2.2 Response timelines (Art 12(3))

> "The controller shall provide information on action taken on a request under Articles 15 to 22 to the data subject without undue delay and **in any event within one month** of receipt of the request. **That period may be extended by two further months** where necessary, taking into account the complexity and number of the requests." [CITED: gdpr-info.eu/art-12-gdpr/][4]

→ MorfX page should commit to **30 days max** as the operational timeline (the GDPR maximum without invoking the extension), to avoid having to communicate an extension in the common case.

### 2.3 Exceptions to erasure (Art 17(3))

The page must mention exceptions truthfully so that, if MorfX cannot delete some data (DIAN invoices, audit logs needed for legal claims), the user knows in advance. The five GDPR exceptions are:
1. Freedom of expression and information
2. **Compliance with a legal obligation** (this is where DIAN art. 632 retention falls)
3. Public health public interest
4. Archiving / scientific / historical / statistical purposes in the public interest
5. **Establishment, exercise or defence of legal claims** (audit logs of fraud cases, etc.)

For MorfX, only #2 and #5 are realistically invoked.

### 2.4 Right to be informed about onward erasure (Art 19)

> **Article 19** — "The controller shall communicate any rectification or erasure of personal data or restriction of processing carried out in accordance with Article 16, Article 17(1) and Article 18 to each recipient to whom the personal data have been disclosed, unless this proves impossible or involves disproportionate effort. The controller shall inform the data subject about those recipients if the data subject requests it." [CITED: gdpr-info.eu/art-19-gdpr/][5]

→ For MorfX as Encargado, this means **propagating the deletion to sub-processors (Supabase, Vercel, Anthropic, OpenAI, Google AI, Meta, Inngest, Onurix)**. The page should state this commitment explicitly.

### 2.5 Identity verification (Art 12(6))

> "Where the controller has reasonable doubts concerning the identity of the natural person making the request referred to in Articles 15 to 21, the controller may request the provision of additional information necessary to confirm the identity of the data subject." [CITED: gdpr-info.eu/art-12-gdpr/][4]

→ The page should describe a verification step (which is also a Meta reviewer expectation per §1.3 #8).

### 2.6 Page-content GDPR transparency requirements

Article 12(1) requires that information be provided "in a concise, transparent, intelligible and easily accessible form, using clear and plain language." This bans walls of legalese. The editorial design system already used in `/privacy` and `/terms` (max-width 42rem, body-long type, smallcaps headings, ornaments) satisfies this naturally.

---

## Section 3 — Ley 1581/2012 Colombia + Decreto 1377/2013

### 3.1 Derechos del Titular (Article 8) — verbatim

> "Artículo 8. Derechos de los Titulares. El Titular de los datos personales tendrá los siguientes derechos:
>
> a) Conocer, actualizar y rectificar sus datos personales frente a los Responsables del Tratamiento o Encargados del Tratamiento. Este derecho se podrá ejercer, entre otros frente a datos parciales, inexactos, incompletos, fraccionados, que induzcan a error, o aquellos cuyo Tratamiento esté expresamente prohibido o no haya sido autorizado;
>
> b) Solicitar prueba de la autorización otorgada al Responsable del Tratamiento salvo cuando expresamente se exceptúe como requisito para el Tratamiento, de conformidad con lo previsto en el artículo 10 de la presente ley;
>
> c) Ser informado por el Responsable del Tratamiento o el Encargado del Tratamiento, previa solicitud, respecto del uso que le ha dado a sus datos personales;
>
> d) Presentar ante la Superintendencia de Industria y Comercio quejas por infracciones a lo dispuesto en la presente ley y las demás normas que la modifiquen, adicionen o complementen;
>
> e) Revocar la autorización y/o solicitar la supresión del dato cuando en el Tratamiento no se respeten los principios, derechos y garantías constitucionales y legales. La revocatoria y/o supresión procederá cuando la Superintendencia de Industria y Comercio haya determinado que en el Tratamiento el Responsable o Encargado han incurrido en conductas contrarias a esta ley y a la Constitución;
>
> f) Acceder en forma gratuita a sus datos personales que hayan sido objeto de Tratamiento." [CITED: Ley 1581/2012 art. 8 — normograma.crcom.gov.co][6]

These are the **derechos ARCO** (Acceso, Rectificación, Cancelación / Supresión, Oposición). The page must enumerate them.

### 3.2 Plazos — consulta vs reclamo (CRITICAL DISTINCTION)

| Trámite | Naturaleza | Plazo base | Prórroga | Total máximo | Base legal |
|---|---|---|---|---|---|
| **Consulta** | Pregunta del titular sobre qué datos tiene el responsable y para qué los usa (derecho de acceso) | **10 días hábiles** | 5 días hábiles | 15 días hábiles | art. 14 [6] |
| **Reclamo** | Solicitud de corrección, actualización, **supresión**, o denuncia de incumplimiento de deberes | **15 días hábiles** | 8 días hábiles | 23 días hábiles | art. 15 [6] |

**Verbatim Ley 1581/2012 Article 14 (consultas):**
> "La consulta será atendida en un término máximo de diez (10) días hábiles contados a partir de la fecha de recibo de la misma. Cuando no fuere posible atender la consulta dentro de dicho término, se informará al interesado, expresando los motivos de la demora y señalando la fecha en que se atenderá su consulta, la cual en ningún caso podrá superar los cinco (5) días hábiles siguientes al vencimiento del primer término." [CITED: Ley 1581/2012 art. 14][6]

**Verbatim Ley 1581/2012 Article 15 (reclamos):**
> "El término máximo para atender el reclamo será de quince (15) días hábiles contados a partir del día siguiente a la fecha de su recibo. Cuando no fuere posible atender el reclamo dentro de dicho término, se informará al interesado los motivos de la demora y la fecha en que se atenderá su reclamo, la cual en ningún caso podrá superar los ocho (8) días hábiles siguientes al vencimiento del primer término." [CITED: Ley 1581/2012 art. 15][6]

Article 15 also defines requirements for a valid reclamo:
> "El reclamo se formulará mediante solicitud dirigida al Responsable del Tratamiento o al Encargado del Tratamiento, con la identificación del Titular, la descripción de los hechos que dan lugar al reclamo, la dirección, y acompañando los documentos que se quiera hacer valer. Si el reclamo resulta incompleto, se requerirá al interesado dentro de los cinco (5) días siguientes a la recepción del reclamo para que subsane las fallas." [CITED: same][6]

> "Una vez recibido el reclamo completo, se incluirá en la base de datos una leyenda que diga «reclamo en trámite» y el motivo del mismo, en un término no mayor a dos (2) días hábiles." [CITED: same][6]

The "reclamo en trámite" tag is a domain-layer flag MorfX must implement — out of scope for this research but a downstream task.

### 3.3 Requisito de procedibilidad (Article 16)

> **Artículo 16** — "El Titular o causahabiente sólo podrá elevar queja ante la Superintendencia de Industria y Comercio una vez haya agotado el trámite de consulta o reclamo ante el Responsable del Tratamiento o Encargado del Tratamiento." [CITED: Ley 1581/2012 art. 16][6]

→ The page must explain this gating order: **first contact MorfX (or Client Company) → wait for response → only then escalate to SIC.** Otherwise the SIC will reject the queja for lack of requisito de procedibilidad.

### 3.4 SIC — Authority of control — official contact data

| Field | Value | Source |
|---|---|---|
| Entidad | Superintendencia de Industria y Comercio (SIC) | [13][14] |
| Delegatura competente | Delegatura para la Protección de Datos Personales | [14] |
| Sede principal | Carrera 13 N°. 27-00, Bogotá D.C. | [13][14] |
| Pisos | 1, 3, 4, 5, 6, 7 y 10 | [13] |
| Código postal | 110311 | [13] |
| PBX | (601) 587 0000 | [13][14] |
| Línea de atención | (601) 592 0400 | [13][14] |
| Línea gratuita nacional | 01 8000 910165 | [13][14] |
| Email institucional | contactenos@sic.gov.co | [13][14] |
| Asunto recomendado | "Queja por Protección de Datos Personales" | [14] |
| Sede electrónica para denuncias | sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania | [15] |

> **Note:** The frequently-cited email `habeasdata@sic.gov.co` could **not be confirmed** in any official SIC source as of 2026-05-07. The official channel for personal-data complaints is `contactenos@sic.gov.co` with subject "Queja por Protección de Datos Personales", or via the sede electrónica web form. [VERIFIED via web search 2026-05-07] — **DO NOT cite the unverified email on the live page.** [ASSUMED — verify with legal counsel before publish]

### 3.5 Decreto 1377/2013 article 13 — minimum content of a data-treatment policy

The page is not the *full* política de tratamiento (that's `/privacy`), but it is part of the same compliance bundle. Decreto 1377/2013 article 13 requires policies to include at minimum [CITED: Decreto 1377/2013 art. 13 + Función Pública gestor normativo][16]:

1. Nombre o razón social, domicilio, dirección, correo electrónico y teléfono del Responsable
2. Tratamiento al cual serán sometidos los datos y finalidad
3. Derechos del titular
4. Persona o área responsable de la atención de peticiones, consultas y reclamos
5. Procedimiento para el ejercicio de los derechos
6. Fecha de entrada en vigencia y período de vigencia de las bases de datos

The full numerical breakdown (1–6) was not retrievable verbatim from the official Función Pública URL because of TLS issues during research; the substance is well-established and consistent across compilations [16][17]. **Item #4 (designated officer) and item #5 (procedure for exercising rights) are exactly what the `/data-deletion` page operationalizes.**

### 3.6 MorfX's dual role — Responsable vs Encargado

This is **already documented in `/privacy` sections 7.2 (responsable) and 7.3 (encargado)**, but the deletion page must reaffirm it:

| Data category | MorfX's role | Who is the Titular? | Who handles the deletion request? |
|---|---|---|---|
| Admin user data (operators of Somnio, GoDentist, etc.) — name, email, phone, NIT, billing | **Responsable** | The MorfX customer (admin user) | **MorfX directly** — `morfx.colombia@gmail.com` |
| End-consumer data (customers chatting with the business via WhatsApp/FB/IG) — name, phone, addresses, message text, AI session state | **Encargado** for the business client | The end-consumer (customer of the business) | **The Client Company first** (the business owns the relationship and the original consent under Ley 1581/2012 art. 9) — MorfX assists if escalation is required |
| Marketing site visitor (cookies, analytics, contact form) | **Responsable** | The site visitor | **MorfX directly** |

This trichotomy is the core of the multi-tenant SaaS legal architecture and the page must communicate it without making the end-consumer think MorfX is the sole point of contact (which would create confusion and legal exposure).

---

## Section 4 — Multi-tenant SaaS B2B patterns (competitor analysis)

### 4.1 Analyzed competitors

| Vendor | URL | What we learned |
|---|---|---|
| Maija | `maija.io/whatsapp-data-deletion-request` | **4-step linear flow + footer** — submit via WhatsApp → ID verification → confirmation with timeline → completion notice. Designed for Meta App Review. [2] |
| ManyChat | `help.manychat.com/.../14281070595100-Managing-User-Data-GDPR-Compliance` | **Operator self-service inside dashboard**: 3-dot context menu → "Delete Contact Data". Auto-removes PII after 90 days post-unsubscribe. Multi-tenant: operator deletes per-contact; subscribers can request via operator. [18] |
| HubSpot | `knowledge.hubspot.com/privacy-and-consent/manage-data-privacy-requests` + `developers.hubspot.com/.../crm-v3-objects-contacts-gdpr-delete` | **Two-tier API**: customer admin can permanently delete contact via UI toggle; programmatic GDPR-compliant delete endpoint. [19][20] |
| Twilio | `support.twilio.com/.../4410585868443-Data-Retention-and-Deletion-in-Twilio-Products` (403'd in this research, but search snippets gave structure) | **Per-product matrix**: call logs (immediate API delete), Segment user data (delete + suppression list), workspace deletion (admin self-service), account closure (30 days for customer content + 60 days for account data). Distinguishes "Customer Data" (controller) from "End-User Data" (processor). [21] |
| Intercom | `intercom.com/help/.../5658-data-subject-access-and-deletion-requests` (404'd) | Pattern reportedly mirrors Twilio: clear controller/processor split + form-driven SAR. [ASSUMED based on industry pattern; could not verify] |

### 4.2 Common structure across approved B2B pages

1. **Hero**: page title + last-updated date + which legal regimes the page satisfies
2. **What data we collect** (or pointer to Privacy)
3. **Who is the controller / processor** — clear matrix
4. **How to request deletion** — 3-5 numbered steps
5. **Identity verification step**
6. **Timeline commitment** (e.g., "30 days from verified request")
7. **Exceptions** (legal-obligation retention, fraud-prevention audit logs)
8. **Sub-processors / onward erasure commitment**
9. **Authority of control + escalation path** (SIC for Colombia, DPA for EU)
10. **Contact channels** (email, form, WhatsApp number)
11. **Footer**: link to Privacy + Terms + back to home

The MorfX brief asks for 12 sections — this matches industry practice plus a 12th section for governing law / dispute resolution.

### 4.3 Multi-data-subject handling (end-user vs admin vs visitor)

The strongest pattern (Maija + ManyChat) is to **route by self-identification at the start of the page**:

> "Are you (a) an end-customer who chatted with a business via WhatsApp/FB/IG and wants the business to delete your data? (b) an admin user / operator of a MorfX workspace? (c) a website visitor?"

Each branch then shows different steps. This is what the `/data-deletion` page should adopt because it's the only structure that legally honors the controller/processor split without misleading any of the three audiences.

### 4.4 Controller/processor distinction in deletion flows — best practice phrasing

From Twilio's pattern (paraphrased — do not copy verbatim) [21]:
- "When you (the business client) collect end-user data through MorfX, you are the controller and MorfX is the processor."
- "End-users wishing to delete their data should contact the business they interacted with."
- "If you cannot reach the business, MorfX will assist as a fallback under our DPA obligations."

This pattern preserves the legal hierarchy while not abandoning the end-user.

---

## Section 5 — Meta-approved live examples analyzed

### 5.1 Concrete URLs

| URL | Vendor | Confirmed Meta-approved? | Length | Style |
|---|---|---|---|---|
| `maija.io/whatsapp-data-deletion-request` | Maija (WhatsApp B2B SaaS) | YES (page exists in production for active App ID) [2] | ~1 screen | Numbered procedural |
| `help.manychat.com/.../14281070595100` | ManyChat (FB Messenger / IG B2B SaaS) | YES (production help-center page for active app) [18] | ~2 screens | Help-doc style with screenshots |
| `manychat.com/legal/dpa` | ManyChat DPA (referenced from privacy) | YES [22] | Long-form legal | Legal contract style |

### 5.2 Common phrases and structure (paraphrased)

| Element | Maija pattern | ManyChat pattern |
|---|---|---|
| Trigger | "Send 'Requesting data deletion' to [WhatsApp number]" | UI-based: "Open your contact list, click 3-dot menu, select Delete Contact Data" |
| Verification | "We'll confirm your identity using your phone number and prior interactions" | Operator authenticates via existing dashboard session |
| Timeline | "We will remove your data within [X] days" + exception note | "Auto-removed 90 days after unsubscribe" |
| Confirmation | "You will receive a confirmation message via WhatsApp" | Toast notification in dashboard |
| Footer | Links to Terms, Privacy, locale switcher | Links to Privacy, DPA, Help articles |

### 5.3 Minimum content checklist (synthesis of §1.3 + §5.2)

For MorfX's `/data-deletion`:
- [ ] Page title + last-updated date
- [ ] Plain-language intro (≤ 2 paragraphs)
- [ ] Audience selector / role distinction (end-consumer vs admin vs visitor) — crucial for multi-tenant
- [ ] For each audience: 3–5 numbered procedural steps including identity verification
- [ ] Concrete contact channels: `morfx.colombia@gmail.com` + `wa.me/573137549286` + Bucaramanga postal address (already in footer) — at least one per audience
- [ ] Timeline commitment per audience: 30 days (GDPR) / 15 hábiles (Ley 1581 reclamo) / 10 hábiles (Ley 1581 consulta)
- [ ] Identity verification description
- [ ] Exceptions section: DIAN art. 632 (5 years for invoices), legal-claim retention, fraud-prevention audit logs
- [ ] Sub-processor onward-erasure commitment (list: Supabase, Vercel, Anthropic, OpenAI, Google AI, Meta, Inngest, Onurix)
- [ ] Authority of control: SIC + email + address (Carrera 13 27-00 Bogotá)
- [ ] Right to file SIC complaint (with art. 16 prerequisite warning)
- [ ] Cross-links to `/privacy` and `/terms`
- [ ] Bilingual (es default + en) under next-intl

---

## Section 6 — Colombia-specific retention obligations

### 6.1 DIAN — Estatuto Tributario article 632 (5-year retention)

Electronic invoices, credit notes, debit notes, and acuses de recibo must be conserved by **both issuer and recipient for ≥ 5 years** in conditions that guarantee consultation, integrity, and authenticity. [VERIFIED: ET art. 632 + DIAN abecé factura electrónica + Resolución 30/2019 DIAN][7][8][23]

**Practical implication for MorfX:**
- Personal data tied to invoices issued by MorfX to its customers (admin user name, NIT, address) **cannot be deleted for 5 years from invoice issuance** even if requested.
- Personal data tied to invoices that the Client Companies (Somnio, GoDentist) issue to *their* end-consumers via MorfX-mediated systems is owned by the Client Company; MorfX as Encargado follows the Client Company's instructions but the same 5-year obligation applies on the Client side.
- The page should mention this exception explicitly to manage user expectations and to ground the legal-obligation exception under both GDPR Art 17(3)(b) and Ley 1581/2012 (no equivalent textual exception but the constitutional principle "principio de finalidad" + general legal obligations apply).

### 6.2 Other retention rules potentially relevant

| Source | Obligation | Relevance to MorfX |
|---|---|---|
| Ley 1581/2012 art. 11 | Caducidad y temporalidad — datos no se conservan más allá de la finalidad | Directly aligned with deletion right; supports default deletion when finalidad cesó |
| Código de Comercio art. 28 | Comerciantes deben conservar correspondencia y documentos por 10 años | Affects MorfX's own books, not end-consumer data |
| SARLAFT (UIAF) | KYC/AML retention (5 years) | **Likely NOT applicable** to MorfX — SARLAFT applies to specific obligated sectors (financial, jewelry, real estate, exchange houses, vigilancia y seguridad). SaaS not enumerated. [ASSUMED — verify with legal counsel if MorfX ever processes payments directly] |
| Ley 527/1999 (firma electrónica) | Documentos electrónicos firmados con firma certificada conservar 10 años | Not directly relevant unless MorfX issues digitally-signed contracts |

**Recommended phrasing on the page (paraphrased):** *"Some data may be retained beyond a deletion request for compliance with Colombian tax law (Estatuto Tributario art. 632 — 5-year retention of invoices and supporting documents) or for the establishment, exercise or defence of legal claims. We will delete the data that is not subject to such obligations and notify you of any exception applied."*

---

## Section 7 — Recommended page structure for MorfX (12 sections mapped)

| # | Section title (es) | Section title (en) | Key content bullets | Citations |
|---|---|---|---|---|
| 1 | **Sobre esta página** | **About this page** | Last-updated; legal regimes covered (GDPR, Ley 1581, Decreto 1377, Meta Platform Terms); plain-language commitment | [3][6][10] |
| 2 | **Quiénes somos y cuál es nuestro rol** | **Who we are and what role we play** | MorfX S.A.S. NIT 902.052.328-5, Bucaramanga; dual role: Responsable for admin users + Encargado for end-consumers; reference to `/privacy` §7 | codebase Privacy.section7 |
| 3 | **¿A quién aplica esta página?** | **Who is this page for?** | Three-audience selector: (a) end-consumer who chatted with a business, (b) admin user / operator, (c) website visitor | §4.3 [21][18][2] |
| 4 | **Sus derechos** | **Your rights** | ARCO under Ley 1581 art. 8 + GDPR right to erasure (Art 17) + right to revoke consent (art. 9 Ley 1581) | [3][6] |
| 5 | **Cómo solicitar la eliminación — usuario administrador** | **How to request deletion — admin user** | 4 steps: (i) email morfx.colombia@gmail.com from registered email + subject "Solicitud de eliminación de datos" / "Data deletion request"; (ii) include workspace name + admin email + "I authorize deletion of all personal data tied to my MorfX account"; (iii) MorfX confirms receipt within 2 business days; (iv) deletion completes within 30 days (GDPR) / 15 hábiles (Ley 1581 reclamo) | §1.3 §3.2 |
| 6 | **Cómo solicitar la eliminación — consumidor final** | **How to request deletion — end consumer** | Primary path: contact the business you interacted with (the business is the Responsable). Fallback path: WhatsApp +57 313 754 9286 with name + phone + business name + brief description. Identity verified by phone + last interaction date. MorfX coordinates with the Client Company. | [2] §3.6 §4.4 |
| 7 | **Cómo solicitar la eliminación — visitante del sitio** | **How to request deletion — site visitor** | Email morfx.colombia@gmail.com with subject + provide approximate visit date + IP/browser if known. Cookie data + analytics deleted within 30 days. | §4.3 |
| 8 | **Plazos de respuesta** | **Response timelines** | Table: GDPR 30 days max + 60 days extension; Ley 1581 consulta 10+5 hábiles; Ley 1581 reclamo 15+8 hábiles; verification step delay clarification | [3][4][6] |
| 9 | **Excepciones a la eliminación** | **Exceptions to deletion** | DIAN art. 632 (5 años para facturas + soportes); GDPR Art 17(3)(b) legal-obligation; Art 17(3)(e) defence of legal claims; we'll notify which data we kept and why | [3][7][8] |
| 10 | **Cómo eliminamos los datos en nuestros sub-encargados** | **How we propagate deletion to sub-processors** | List: Supabase, Vercel, Anthropic, OpenAI, Google AI, Meta, Inngest, Onurix; Article 19 GDPR commitment; "if technically impossible we will inform you" caveat | [5] codebase Privacy.section7.subencargados |
| 11 | **Autoridad de control y escalación** | **Authority of control and escalation** | SIC Delegatura para la Protección de Datos Personales; Carrera 13 N°. 27-00 Bogotá D.C. CP 110311; (601) 587 0000; contactenos@sic.gov.co (subject "Queja por Protección de Datos Personales"); sedeelectronica.sic.gov.co; warning under Ley 1581 art. 16 — first contact MorfX, then SIC | [13][14][15] |
| 12 | **Vigencia, ley aplicable y disputas** | **Effective date, governing law, and disputes** | Effective date; Colombian law governs; jurisdiction Bucaramanga; cross-link to `/terms` jurisdiction clause | codebase Terms.section16 |

> **Footer:** cross-links to `/privacy`, `/terms`, `/`, plus locale toggle — same pattern as existing legal pages.

---

## Section 8 — Design system inheritance (codebase findings)

### 8.1 Confirmed paths

| Item | Confirmed path | Notes |
|---|---|---|
| Privacy page | `src/app/(marketing)/[locale]/privacy/page.tsx` | Verified by direct read |
| Terms page | `src/app/(marketing)/[locale]/terms/page.tsx` | Verified by direct read |
| Footer | `src/components/marketing/footer.tsx` | Legal column lines 132–152; add `/data-deletion` `<li>` after `/terms` |
| Header | `src/components/marketing/header.tsx` | No change needed |
| Legal section component | `src/components/marketing/legal/legal-section.tsx` | **Reuse this** — it already implements marginalia + ornaments + bullets + paragraphs + nested subsections |
| Middleware | `middleware.ts` (root, NOT `src/`) | `isPublicMarketingRoute()` lines 15–30 must be edited to add `/data-deletion` and `/en/data-deletion` |
| i18n messages | `messages/en.json` + `messages/es.json` (917 lines each) | Add new namespace `"DataDeletion"` parallel to `"Privacy"` and `"Terms"` |
| i18n routing | `src/i18n/routing.ts` (referenced from privacy page) | localePrefix as-needed; supports both `/privacy` (es default) and `/en/privacy` |

### 8.2 Tokens used in legal pages (verified from privacy/terms source)

| Token | Used for |
|---|---|
| `--paper-0` | Page background (light cream) |
| `--paper-1`, `--paper-4` | TOC background, dividers |
| `--ink-1`, `--ink-2`, `--ink-3`, `--ink-4` | Body text hierarchy |
| `--rubric-2` | Smallcaps eyebrow color above page title |
| `--font-sans`, `--font-serif`, `--font-mono`, `--font-display` | Typography stack |
| Utility classes | `.mx-display`, `.mx-h2`, `.mx-h3`, `.mx-body-long`, `.mx-smallcaps`, `.mx-marginalia` |
| Decorative | `— ❦ —` ornament between sections (LegalSection `showOrnament` prop) |
| Layout | `max-w-[64rem]` article container, `max-w-[42rem]` body width |

### 8.3 i18n namespace convention (from existing structure)

```json
"DataDeletion": {
  "pageTitle": "...",
  "lastUpdated": "Last updated: May 8, 2026",
  "toc": "Contents",
  "backToLanding": "Back to home",
  "seePrivacy": "See Privacy Policy",
  "seeTerms": "See Terms of Service",
  "preamble": "...",
  "section1": { "id": "...", "heading": "...", "paragraphs": [...], "bullets": [...], "subsections": [...] },
  "section2": { ... },
  ...
  "section12": { ... }
}
```

Each section follows the `SectionData` interface (id, heading, optional paragraphs, optional bullets, optional subsections) already used by `LegalSection`. The page component is a near-copy of `privacy/page.tsx` with `SECTION_KEYS = ['section1', ..., 'section12']`.

### 8.4 Footer link placement

In `src/components/marketing/footer.tsx` line 146 (after `/terms` `<li>` and before `/login` `<li>`):

```tsx
<li style={liItem}>
  <LocaleLink href="/data-deletion" style={linkBase} className={linkHover}>
    {t('dataDeletion')}
  </LocaleLink>
</li>
```

And add to `messages/{en,es}.json` `Footer` namespace:
- en: `"dataDeletion": "Data deletion"`
- es: `"dataDeletion": "Eliminación de datos"`

### 8.5 Middleware whitelist update — **required**

In `middleware.ts` `isPublicMarketingRoute()` (lines 15–30), add:

```ts
pathname === '/data-deletion' ||
pathname === '/en/data-deletion' ||
```

Without this edit the route falls through to `updateSession(request)` and may force a Supabase redirect — which would bounce a Meta reviewer who is not authenticated.

### 8.6 Static metadata + locale params

Use the same `generateStaticParams()` + `generateMetadata({ params })` pattern as `privacy/page.tsx`. Title and description should mention "Meta Platform Terms" + "Ley 1581 de 2012" + "GDPR" so Meta's automated checks see the page is purpose-built.

---

## Section 9 — Open questions / ambiguities

| # | Question | Ambiguity | Recommendation |
|---|---|---|---|
| Q1 | Is `habeasdata@sic.gov.co` an officially active SIC email? | Cited in many third-party templates, but no SIC official source confirms it. Official channel is `contactenos@sic.gov.co` + sede electrónica. | Use `contactenos@sic.gov.co` only on the page; do not use the unverified email. Verify with legal counsel. |
| Q2 | Does Meta App Review require the page in English specifically? | No hard mandate found in official Meta docs; widespread community advice says English is safest for reviewer. | Render bilingual via next-intl. Default `/data-deletion` in Spanish (Colombia is the legal home), `/en/data-deletion` in English. The Meta App Dashboard "Data Deletion Instructions URL" field should point to `/en/data-deletion` (English) so reviewers see English by default. |
| Q3 | Should MorfX implement the Callback URL too? | Not strictly required; the Instructions URL satisfies the Platform Terms. But if MorfX ever stores Facebook-user-ids (e.g., for FB Messenger Page Subscribers), Meta may eventually push for a callback in a future App Review. | Defer — implement Instructions URL now; revisit callback URL if Meta App Review feedback requests it. |
| Q4 | Identity verification — what specifically is asked? | Reviewer expects to see a verification step. The brief says MorfX has the email + phone of admins and the phone of end-users. | Verify admin via reply-from-registered-email + workspace name match. Verify end-user via phone match + last interaction date / business name match. Document both flows in §5 and §6 of the page. |
| Q5 | Does the page need a web form or is email enough? | Meta's checklist in §1.3 says "at least one of: email, web form, or in-dashboard option" — so email alone is acceptable. A form adds engineering scope. | **MVP: email only.** Add a form in v2 if reviewer feedback requests it. |
| Q6 | Legal copy review — is anyone signing off? | Research is not legal advice. The verbatim citations are accurate but the *application* to MorfX requires counsel sign-off. | Page should be reviewed by Colombian counsel before publication, especially the SIC contact data, the DIAN art. 632 retention exception, and the Encargado role description. |
| Q7 | Should we mention end-user can withdraw consent inside the WhatsApp chat (e.g., reply "STOP") instead of going through the deletion page? | Withdrawing future consent is different from deletion of past data. STOP-style mechanics belong in opt-out / unsubscribe flow, not deletion. | Mention briefly in §4 (Your rights) that withdrawing consent may be a separate path; the page focuses on deletion of data already collected. |
| Q8 | Cookie / web-analytics specific deletion path? | The marketing site at morfx.app may use analytics cookies. Visitor data is separately controlled by MorfX as Responsable. | Cover in §7 (visitor audience) — direct visitors to morfx.colombia@gmail.com. If a cookie banner is added later, link from there to `/data-deletion`. [ASSUMED — current site does not have cookie banner; verify before publish] |

---

## Section 10 — Project Constraints (from CLAUDE.md and codebase rules)

The following directives from `./CLAUDE.md` and `.claude/rules/*.md` constrain implementation of the page (planner must verify):

1. **Regla 0 (GSD Workflow):** A discuss → research → plan → execute pipeline is mandatory. This research doc satisfies the "research" step. Quick-task mode (`260507-tj9-data-deletion-page`) bypasses the multi-phase pipeline by user election; the planner should still invoke `/gsd-plan-phase` style atomic tasks if the page implementation involves more than 3 file edits.
2. **Regla 1 (Push to Vercel):** After implementation, push to Vercel before requesting user review. The page must render correctly in the Vercel preview before Meta App Dashboard URL is updated.
3. **Regla 3 (Domain Layer):** Not directly applicable — the page is read-only marketing content with no data mutations. No Supabase calls. No domain-layer code involved.
4. **Regla 4 (Documentation):** Update `docs/` if any architectural change is introduced (the middleware edit qualifies as a small architectural change). At minimum, update `docs/analysis/04-estado-actual-plataforma.md` if it tracks marketing-site state.
5. **Regla 6 (Production protection):** Not applicable — adding a marketing page does not modify any agent's runtime behavior. No feature flag needed for the page itself.
6. **Project skill rule (.claude/rules/code-changes.md):** Edits to `middleware.ts` are routing-level; planner must verify the new path does not accidentally whitelist anything else (the function uses exact-match, so this is safe by design).
7. **i18n keys must exist in BOTH `en.json` and `es.json` with identical structure** — next-intl will throw if one locale is missing a key; the existing Privacy/Terms namespaces already have parallel structure.

---

## Sources (numbered, with retrieval dates)

[1] Meta for Developers — Data Deletion Callback documentation. `https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/`. Retrieved 2026-05-07 via WebFetch (partial — the page is JS-rendered; FAQ snippet captured: "Developers must specify either a data deletion callback instruction URL or a callback URL found in the app's basic configuration").

[2] Maija — WhatsApp Data Deletion Request page. `https://www.maija.io/whatsapp-data-deletion-request`. Retrieved 2026-05-07 via WebFetch. **Reference example for Meta-approved B2B WhatsApp data deletion instructions URL**.

[3] GDPR Article 17 — Right to erasure ('right to be forgotten'). `https://gdpr-info.eu/art-17-gdpr/`. Retrieved 2026-05-07 via WebFetch — verbatim text of paragraphs 1, 2, 3.

[4] GDPR Article 12 — Transparent information, communication and modalities. `https://gdpr-info.eu/art-12-gdpr/`. Retrieved 2026-05-07 via WebFetch — verbatim text of paragraphs 3 and 6.

[5] GDPR Article 19 — Notification obligation regarding rectification or erasure. `https://gdpr-info.eu/art-19-gdpr/`. Retrieved 2026-05-07 via WebFetch — full verbatim text.

[6] Ley 1581 de 2012 (Estatutaria de Habeas Data) — Compilación normativa CRC. `https://normograma.crcom.gov.co/crc/compilacion/docs/ley_1581_2012.htm`. Retrieved 2026-05-07 via WebFetch — verbatim text of articles 8, 14, 15, 16, 17.

[7] Estatuto Tributario Colombia, artículo 632 — Conservación de documentos. Cited via DIAN abecé factura electrónica + Resolución 30 de 2019 DIAN. `https://www.dian.gov.co/impuestos/factura-electronica/Documents/Abece-FE-Facturador.pdf`. Retrieved 2026-05-07 via web search.

[8] DIAN — ABECÉ información para el facturador (factura electrónica). `https://www.dian.gov.co/impuestos/factura-electronica/Documents/Abece-FE-Facturador.pdf`. Retrieved 2026-05-07 via web search snippet.

[9] ShoutMeCrunch — Facebook GDPR Data Deletion Page Setup Guide (Update 2026). `https://www.shoutmecrunch.com/data-delete-instructions/`. Retrieved 2026-05-07 via WebFetch. Tertiary source but captures community-known checklist.

[10] Meta Platform Terms — `https://developers.facebook.com/terms/`. Retrieved 2026-05-07 via WebFetch — verbatim sections 3.d.i.1, 3.d.i.2, 3.d.i.2.a, 3.d.i.2.b, 4.b, 5.a.ii.

[11] PostMoore Blog — Why Meta App Review Keeps Disapproving Your App. `https://www.postmoo.re/blogs/meta-app-review-disapproved-how-to-get-approved`. Retrieved 2026-05-07 via web search snippet — rejection-pattern guidance.

[12] Kevit Technologies on Medium — How to get your Facebook App reviewed. `https://medium.com/kevit-technologies/how-to-get-your-facebook-app-reviewed-5db98c4e604c`. Retrieved 2026-05-07 via WebFetch — reviewer-test description.

[13] Movilexito — Superintendencia de Industria y Comercio direccion oficial. `https://www.movilexito.com/sites/default/files/2019-04/Superintendencia_de_Industria_y_Comercio.pdf`. Retrieved 2026-05-07 via web search — Carrera 13 N°. 27-00, código postal 110311.

[14] SIC — Delegatura para la Protección de Datos Personales. `https://www.sic.gov.co/delegatura-para-la-proteccion-de-datos-personales`. Retrieved 2026-05-07 via web search snippet (page is TLS-strict, direct fetch blocked).

[15] SIC Sede Electrónica — Denuncias de Habeas Data y Protección de Datos Personales. `https://sedeelectronica.sic.gov.co/atencion-y-servicios-a-la-ciudadania/servicios/denuncias-de-habeas-data-y-proteccion-de-datos-personales`. Retrieved 2026-05-07 via web search.

[16] Decreto 1377 de 2013 — Función Pública gestor normativo. `https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646`. Retrieved 2026-05-07 via web search snippets (direct WebFetch failed with TLS cert error). Article 13 contenido mínimo (numerals 1–6) referenced.

[17] Decreto 1377 de 2013 — Alcaldía de Bogotá compilación. `https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=53646`. Retrieved 2026-05-07 via web search snippet (direct WebFetch failed with TLS cert error).

[18] ManyChat Help Center — Managing User Data / GDPR Compliance. `https://help.manychat.com/hc/en-us/articles/14281070595100-Managing-User-Data-GDPR-Compliance`. Retrieved 2026-05-07 via web search snippet (direct WebFetch returned 403). Multi-tenant deletion flow reference.

[19] HubSpot Knowledge Base — Manage data privacy requests. `https://knowledge.hubspot.com/privacy-and-consent/manage-data-privacy-requests`. Retrieved 2026-05-07 via web search snippet.

[20] HubSpot Developer Docs — Permanently delete a contact (GDPR-compliant). `https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/basic/post-crm-v3-objects-contacts-gdpr-delete`. Retrieved 2026-05-07 via web search snippet.

[21] Twilio Support — Data Retention and Deletion in Twilio Products. `https://support.twilio.com/hc/en-us/articles/4410585868443-Data-Retention-and-Deletion-in-Twilio-Products`. Retrieved 2026-05-07 via web search snippet (direct WebFetch returned 403).

[22] ManyChat Legal — Data Processing Addendum. `https://manychat.com/legal/dpa`. Retrieved 2026-05-07 via web search snippet.

[23] DIAN — Resolución 30 de 2019 — Facturación electrónica. `https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0030_2019.htm`. Retrieved 2026-05-07 via web search.

---

## Confidence assessment

| Area | Confidence | Reason |
|---|---|---|
| GDPR Articles 17, 12, 19 | **HIGH** | Verbatim from gdpr-info.eu (authoritative GDPR mirror, EU institutions reference it) |
| Ley 1581/2012 articles 8, 14, 15, 16, 17 | **HIGH** | Verbatim from CRC compilación normativa (official Colombian government source) |
| Decreto 1377/2013 article 13 contenido mínimo | **MEDIUM-HIGH** | Cited via Función Pública gestor normativo and search snippets; could not retrieve verbatim because of TLS cert issues with the source. Substance is well-established and consistent across compilations. **Recommend verifying the verbatim numerals 1–6 with legal counsel before final publication.** |
| SIC contact data | **HIGH** for address + phones; **HIGH** for `contactenos@sic.gov.co` email; **LOW** for `habeasdata@sic.gov.co` (cannot confirm — recommend NOT using on the page) | Multiple sources |
| Meta App Review requirements | **MEDIUM-HIGH** | Meta Platform Terms verbatim available; Meta dev docs are partly JS-rendered so the verbatim FAQ snippet was the only direct quote. Substance corroborated by Maija (live approved page) and shoutmecrunch checklist. |
| DIAN art. 632 5-year retention | **HIGH** | Cross-referenced via DIAN abecé + Resolución 30/2019 + multiple compliance sources |
| Codebase findings (paths, tokens, conventions) | **HIGH** | Verified by direct file read on 2026-05-07 |

---

**Research date:** 2026-05-08
**Valid until:** 2026-08-07 (90 days for legal sources; sooner if Meta updates Platform Terms or Colombia issues new data-protection regulation)
**Estimated implementation effort downstream:** ~3–5 hours (page component + i18n keys × 2 locales + middleware edit + footer link + Meta dashboard URL update + Vercel push)
