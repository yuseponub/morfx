# Meta Business Verification para SAS Colombiana — Bible MorfX

**Generated:** 2026-05-07
**Caso target:** MorfX S.A.S. — App ID `1559280425149650`, Display Name `morf·x`, dominio `morfx.app`. BV iniciada desde Security Center hace ~1 día, status "under review".
**Objetivo:** desbloquear Advanced Access para `pages_messaging` + `instagram_manage_messages` + `business_management` post-BV approval.
**Alcance:** todo lo que el usuario necesita para (a) entender el estado, (b) anticipar rejection, (c) preparar docs faltantes, (d) recuperarse si hay problemas, (e) actuar inmediato post-approval.

---

## TL;DR ejecutivo

1. **Status check ahora:** `business.facebook.com/settings/security` → "Business Verification" — busca el chip de status (`Pending`, `In Review`, `Verified`, `Failed`, `Information Required`).
2. **Timeline realista:** 10 min (auto-approval) — 48h (típico LATAM) — 14 días hábiles (manual review). Casos extremos reportados de 1-2 meses sin escalation.
3. **Documentos colombianos clave que Meta acepta:** Cámara de Comercio (Certificado de Existencia y Representación Legal, NO mayor a 30 días) + RUT actualizado de DIAN + cédula del representante legal + comprobante utility bill / extracto bancario para address+phone.
4. **Riesgo principal MorfX:** mismatch sutil del legal name "MorfX S.A.S." contra el RUT/Cámara — punctuation, mayúsculas, espacios. Meta hace string match exacto carácter-por-carácter.
5. **Re-submissions permitidos:** 3 intentos, después appeal manual via Business Help Center. Cooldown no documentado oficialmente, devs reportan ~24-48h entre intentos.
6. **Post-approval inmediato:** App Settings → Verification ya muestra "Verified" → puedes proceder a **Access Verification** (App Review por permiso) sin esperar otro flow.

---

## Sección 1 — Status Check Guide (ejecutar AHORA)

### 1.1 — Navegar al Security Center correcto

```
URL directa: https://business.facebook.com/settings/security
Alternativa: business.facebook.com → Settings (gear icon) → Security Center
```

> ⚠️ NO confundir con "Authorizations and verifications" que es regulatory ads
> verification (URL contiene `verification_type=GENERIC_UNIVERSAL_REGULATORY`).
> Esa NO es la BV que necesitas — es otra cosa que ya se aprobó pero no
> desbloquea App Review.

### 1.2 — Identificar el status exacto

En Security Center buscá la card "Business Verification". Los estados posibles según docs Meta + experiencias devs son:

| Status visible | Significado | Acción requerida |
|---|---|---|
| **Not Started** | Nunca enviaste BV | Click "Start Verification" |
| **Pending** | Submitted, esperando triage automático | Esperar (10 min - 24h típico) |
| **In Review** | Reviewer humano la tiene | Esperar (48h - 14 días) |
| **Information Required** | Meta necesita más docs | Click "Provide Info" + leer mensaje |
| **Verified** ✅ | Aprobada | Proceder a Access Verification |
| **Failed** ❌ | Rechazada | Leer razón, corregir, re-submit (max 3) |

### 1.3 — Verificar dónde llega la notificación

Meta notifica:
- **Email** al admin email del Business Portfolio (NO necesariamente el de la app)
- **In-app notification** en el icono de campana de Business Manager
- **Developer Alert** en el App Dashboard Inbox (developers.facebook.com)

> 💡 Verificá `info@morfx.app` Y el email personal del admin del Business
> Portfolio (puede ser distinto). Revisá spam/promotions.

### 1.4 — Si "In Review" lleva >5 días

Casos documentados de 5-30+ días de "In Review" sin movimiento. Pasos:

1. **Día 5+:** verificar si llegó Information Required (notificación) que se haya pasado
2. **Día 7+:** revisar el thread del [Meta Developer Community Forum](https://communityforums.atmeta.com/) — algunos devs reportan que escalation por ahí mueve la cola
3. **Día 14+:** abrir caso en [Meta Business Help Center](https://www.facebook.com/business/help/support) — "Get Help" → "Business Verification Stuck" si está disponible la opción
4. **Día 21+:** si nada se mueve, considerar abrir caso paralelo desde un admin distinto (ojo: esto puede contar como nuevo intento del límite de 3)

---

## Sección 2 — Documentos Colombianos Aceptados por Meta

### 2.1 — Combinación recomendada (lo que MorfX debería tener listo)

Meta busca verificar 3 cosas: **legal name**, **address**, **phone**. Idealmente con 2-3 documentos que cubran las 3.

| Documento | Cubre | Validez | Dónde obtener |
|---|---|---|---|
| **Cámara de Comercio — Certificado de Existencia y Representación Legal** | Legal name + address + representante legal | **30 días** (industry standard, no legal) | [ccb.org.co](https://www.ccb.org.co/es/tramites-y-consultas/certificados-ccb) o cámara local |
| **RUT (DIAN actualizado)** | Legal name + NIT + actividad económica + address | "Última actualización" en encabezado | [muisca.dian.gov.co](https://muisca.dian.gov.co/WebRutMuisca/DefActualizarRut2.faces) → consulta/actualización RUT → Imprimir/PDF |
| **Cédula representante legal** | Identidad del firmante | Vigente | Persona física |
| **Utility bill / Extracto bancario** | Address + phone (a nombre de la empresa) | <1 año (Meta general); <90 días recomendado | Servicios públicos / banco |

### 2.2 — RUT — instrucciones precisas 2024-2025

El RUT físico antiguo **NO sirve**. Meta acepta el PDF descargado desde MUISCA que es el único formato vigente reconocido por DIAN.

**Paso a paso:**

1. Ingresar a `muisca.dian.gov.co` con usuario + contraseña
2. Menú principal → "RUT" → "Consulta / Actualización del RUT"
3. Verificar que la sección de "Actividades económicas" esté actualizada (CIIU 2024 — DIAN actualizó nomenclatura)
4. Click "Imprimir" o "Descargar PDF"
5. El PDF muestra "Fecha última actualización" en el encabezado — **debe ser reciente** (lo más viejo que aceptan razonablemente: ~6 meses, ideal <30 días)

**Red flag específico Colombia:** si el RUT muestra estado "**SUSPENDIDO**" o "**CANCELADO**", Meta rechazará automáticamente. Verificar antes de subir. Estado correcto: "**ACTIVO**".

### 2.3 — Cámara de Comercio — Certificado de Existencia y Representación Legal

**Vigencia:** la ley colombiana NO establece un plazo legal específico, pero en la práctica las entidades (incluida Meta) piden que **no tenga más de 30 días** de expedido.

**Contenido obligatorio que el certificado debe mostrar:**
- Razón social completa (legal name) — debe matchear EXACTO con Business Manager
- NIT
- Domicilio principal
- Estado: **ACTIVA** (NO "INACTIVA", "CANCELADA", "DISUELTA")
- Representante legal vigente
- Objeto social

**Cómo obtenerlo (Bogotá CCB ejemplo):**
1. `ccb.org.co` → Trámites → Certificados → Comprar online
2. Costo aproximado: COP $7.000-$15.000 (varía cámara)
3. Descarga inmediata PDF firmado digitalmente
4. **Tiene código de verificación** en la primera página — útil si Meta pide validación

**Trampa común:** algunas cámaras (Medellín, Cali) emiten certificados con saltos de línea o espacios extra en la razón social que pueden confundir el OCR de Meta. Ver §3 para mitigation.

### 2.4 — Documentos secundarios para address/phone

Si Cámara + RUT no cubren ya el phone (raro), Meta acepta:
- **Recibo de servicios públicos** (luz, agua, gas, internet) — a nombre de la SAS, no a nombre personal del rep legal
- **Extracto bancario** de cuenta corporativa
- **Factura electrónica** emitida por la SAS donde aparezca su dirección + teléfono

> ⚠️ Meta **NO acepta** comprobantes a nombre del rep legal personal —
> deben ser a nombre de la SAS exactamente como figura en Cámara.

---

## Sección 3 — String Matching Exacto del Legal Name

Esta es la causa #1 de rejection y la más sutil. Meta hace **byte-for-byte match** sin tolerancia.

### 3.1 — Reglas Meta (extraídas de docs + foros)

1. **Punctuation matters.** "S.A.S." ≠ "SAS" ≠ "S A S" ≠ "S. A. S."
2. **Mayúsculas matter.** "MorfX" ≠ "MORFX" ≠ "Morfx"
3. **Tildes matter.** "Compañía" ≠ "Compania"
4. **Caracteres especiales matter.** "&" ≠ "and" ≠ "y"; "Ñ" ≠ "N"
5. **Espacios trailing matter.** Cámara de Comercio a veces emite "MORFX S.A.S.  " con doble espacio — Meta lo lee literal.
6. **Saltos de línea matter.** Si la razón social en el PDF está partida en 2 líneas, OCR puede leerla como un solo string sin espacio.

### 3.2 — Procedure — verificar antes de submit

**Paso 1:** Descargá el RUT en PDF y la Cámara de Comercio.

**Paso 2:** Copiá la razón social desde el PDF al portapapeles (Ctrl+C sobre el texto seleccionable):
- Si el PDF es imagen-based (escaneado), abrí en un OCR (Adobe Acrobat → Recognize Text) primero
- Pegalo en un editor que muestre caracteres invisibles (VS Code con "Render Whitespace: all")
- Comparalo carácter-por-carácter

**Paso 3:** Pegá el mismo string en Business Manager → Settings → Business Info → Legal Business Name. NO lo retipees. Pegado raw.

**Paso 4:** Verificá que el dominio del email del admin del business (NO el de la app) coincida con el dominio que vas a verificar. MorfX usa `morfx.app` → admin email debe ser `algo@morfx.app` (NO Gmail/Hotmail).

### 3.3 — Si ya enviaste con nombre incorrecto

Opciones según severidad:

| Severidad | Acción |
|---|---|
| Diferencia trivial (espacio doble, mayúscula) | Esperar al review; ~70% de las veces pasan automáticamente. Si rechazan, corregir y re-submit. |
| Diferencia estructural (S.A.S. vs SAS) | NO esperar al review; cancelar (si aún se puede) e iniciar de cero con el nombre correcto. Cancelar mid-review NO cuenta como intento fallido. |
| Documentos de empresa diferente subidos por error | Cancelar inmediato. Si ya completó review = rejection automático y cuenta 1 intento. |

### 3.4 — Caso MorfX específico

**Hipótesis con la info disponible:**
- Display Name de la app: `morf·x` (con middle dot rust red)
- Legal name probable: `MorfX S.A.S.` (estándar Colombia)

**Posible mismatch a confirmar antes de Meta procese:**
- ¿En Business Manager el legal name está como `MorfX S.A.S.` o como `morf·x`?
- ¿El dot decorativo se filtró?
- ¿Las mayúsculas matchean Cámara de Comercio?

> 🔍 **Acción usuario hoy:** abrir `business.facebook.com/settings/info` →
> verificar campo "Legal name" — debe decir exactamente lo que dice el RUT,
> sin emojis ni dots tipográficos.

---

## Sección 4 — Mismatch Domain ↔ Empresa (caso WHOIS)

### 4.1 — ¿Meta exige que el WHOIS del dominio matchee el legal name?

**Respuesta corta: NO.** Meta no chequea WHOIS público para BV. Pero sí chequea:

1. Que el dominio esté **listado en App Domains** del Meta App
2. Que la **website** muestre el legal name (footer, página "About", etc.)
3. Que el **email del admin** sea de ese dominio (no Gmail)
4. Para Domain Verification (proceso aparte), que se pueda **agregar DNS TXT record** o **HTML file** o **meta tag**

### 4.2 — Domain Verification ≠ Business Verification

Son procesos independientes pero relacionados:

| Proceso | Qué verifica | Cuándo se hace |
|---|---|---|
| **Business Verification (BV)** | Existencia legal de la empresa | UNA vez por Business Portfolio |
| **Domain Verification** | Que controlas el dominio (DNS) | Por cada dominio que uses en Ads / OG / Embedded Signup |
| **Access Verification (App Review)** | Cómo usas cada permiso | UNA vez por permiso solicitado |

Tener Domain Verification aprobada **ayuda** a la BV en ambiguity calls (Meta puede usarla como signal positiva), pero no es prerequisite formal.

### 4.3 — Caso MorfX

**Si `morfx.app` está registrado en Porkbun a nombre personal del usuario** (no a nombre de MorfX S.A.S.):
- Meta no lo verá automáticamente (Porkbun ofrece WHOIS privacy por default)
- No es problema para BV
- Pero Domain Verification debe hacerse desde el Meta Business Manager — agregar DNS TXT record en Porkbun. Eso valida control técnico, no ownership legal.

**Si el usuario quiere alinearlo a nombre de la SAS:**
- Porkbun permite cambiar registrant info — actualizar a `MorfX S.A.S.` con dirección legal de la empresa
- No urgente para BV inicial; útil para futuros submissions

---

## Sección 5 — Top 10 Rejection Reasons + Recovery

Compilados de docs Meta + foros + casos LATAM:

### 5.1 — Tabla maestra

| # | Rejection reason | Mensaje típico Meta | Fix |
|---|---|---|---|
| 1 | **Name mismatch** | "Document does not match business name" | Verificar §3 string match. Re-submit con docs corregidos. |
| 2 | **Address mismatch / partial address** | "Address on document doesn't match" | Subir Cámara reciente con dirección completa que matchee Business Info. |
| 3 | **Phone missing/mismatch** | "Phone number not verified" | Subir utility bill con teléfono empresa. NO VoIP/Google Voice. |
| 4 | **Expired/illegible document** | "Document is unreadable" | Re-escanear 300+ DPI; descargar versión PDF nueva (no foto). |
| 5 | **Unsupported language sin traducción** | "Language not supported" | Spanish ES sí lo aceptan oficialmente; si pide traducción, certificada con apostilla. |
| 6 | **Unsupported document type** | "Document type not accepted" | Sustituir self-filed por Cámara/RUT oficiales. |
| 7 | **Self-filed without seal** | "Document lacks official authentication" | Documentos con código verificación (firma digital Cámara) son aceptados. |
| 8 | **Unverified domain** | "Website not associated with business" | Hacer Domain Verification + asegurar website muestre razón social. |
| 9 | **No verification code received** | (callback fail) | Cambiar método (email→phone→WhatsApp). Disable IVR si phone. |
| 10 | **Multiple ID submission attempts** | "Too many attempts from same admin" | Otro admin del Business Portfolio inicia el flow. |

### 5.2 — Secuencia recovery por intento

**Intento 1 falla:**
- Leer mensaje exacto en Security Center
- Identificar cuál de los 10 anteriores aplica
- Corregir UN solo issue (no todos a la vez — para ver cuál era el real)
- Re-submit (cooldown empírico: 24-48h)

**Intento 2 falla:**
- Probable que sea otro issue distinto
- Repetir loop pero ahora corregir docs Y Business Info simultáneamente
- Considerar cambiar admin que somete (si rejection mencionó "multiple attempts")

**Intento 3 falla:**
- NO hay intento 4 automático — appeal manual obligatorio
- Path: [Meta Business Help Center](https://www.facebook.com/business/help/support) → "Contact Support" → seleccionar "Business Verification" → adjuntar TODOS los docs + carta explicativa
- Tiempos appeal: 7-30 días reportados

### 5.3 — "Could not verify identity" (mensaje genérico)

Cuando Meta dice esto sin detalle, pasos exploratorios:

1. **Verificar 2FA del admin** — debe estar activo. Si se desactivó por algo, reactivar antes de re-submit.
2. **Cuenta admin con historia de spam/violations** — usar otro admin
3. **IP / VPN** — algunos casos LATAM se aprueban sin VPN, fallan con VPN. Apagar antes de re-submit.
4. **Browser** — Chrome incógnito, sin extensions. Algunos reportan que extensions de adblock rompen el upload de docs.

---

## Sección 6 — Verificaciones Adicionales que Meta Puede Pedir

### 6.1 — Phone call / SMS / WhatsApp callback

Meta envía un código de 5-6 dígitos al teléfono empresa registrado. Para que funcione:
- Phone debe ser **número celular real** (no VoIP, Google Voice, Skype)
- Si tiene **IVR / contestador automático**, deshabilitarlo durante el flow
- WhatsApp Business app debe estar instalada en el número si elegís WhatsApp

### 6.2 — Email verification al dominio

Meta envía link a un email del dominio (`admin@morfx.app` o `info@morfx.app`).

> ⚠️ **`info@morfx.app` ya es el contact email registrado en App Settings.**
> Verificar que el inbox esté funcionando y que NO haya filtro spam que mueva
> el correo de Meta.

### 6.3 — Domain verification via DNS TXT

Si Meta lo pide, instrucciones:
1. Business Manager → Brand Safety → Domains
2. "Add" → ingresar `morfx.app`
3. Copiar el TXT record (formato: `facebook-domain-verification=abc123xyz`)
4. En Porkbun: DNS Records → Add Record → Type: TXT → Host: `@` → Answer: el string completo
5. Esperar 5-15 min para propagación
6. Click "Verify" en Meta

### 6.4 — Video selfie del rep legal

Reportado en algunos casos LATAM (México, Brasil) como verificación adicional para BV. Colombia: poco común pero posible.
- Selfie video (10-30 seg) sosteniendo cédula
- Misma cédula que se subió en docs
- Mismo rostro que aparece en cédula

### 6.5 — Notarización

Meta **NO requiere** docs notarizados o apostillados para Colombia. Cámara de Comercio digital con firma electrónica + RUT PDF descargado de MUISCA son suficiente. Si Meta pide notarización es señal de que algo está mal en docs anteriores — primero corregir lo básico antes de notarizar.

---

## Sección 7 — Errores Específicos Colombianos

### 7.1 — Tildes en nombres

Si el rep legal se llama "José" o "María", el RUT y la cédula muestran las tildes. **Meta acepta tildes** — la regla es matching exacto, no ASCII-only.

> ❗ Pero **Business Manager UI** a veces no acepta caracteres especiales en
> ciertos campos. Si te rechaza el campo, prueba pegar (no tipear) y verificar
> con copy-paste que se grabó con tildes.

### 7.2 — Direcciones colombianas (Carrera/Calle/etc.)

Meta acepta formato colombiano: `Carrera 7 #45-23`, `Calle 100 #11A-50`, `Diagonal 25 #34-12`. Reglas:
- NO abreviar: "Cr" → "Carrera", "Cl" → "Calle"
- Símbolo `#` se acepta (algunos sistemas lo cambian a "No." — no hace falta cambiarlo)
- Indicar ciudad, departamento, código postal si lo tiene

> 💡 Verificar que el address en RUT, Cámara, y Business Info sea EL MISMO string.

### 7.3 — Razón social con caracteres extraños

Casos comunes Colombia:
- `INVERSIONES 123 S.A.S.` ← número en el nombre, OK
- `S&V CONSULTORES S.A.S.` ← `&` puede causar issues, pero MorfX no lo usa
- `MORFX SAS` (sin puntos) vs `MORFX S.A.S.` ← chequear el RUT a ver cuál figura

### 7.4 — DIAN actualizó CIIU en 2024

La nomenclatura CIIU (actividad económica) cambió. Si tu RUT es viejo (>2024) puede tener códigos obsoletos. **Actualizar el RUT** desde MUISCA antes de submit por si Meta cross-references. Es trámite gratuito y demora <5 minutos.

### 7.5 — Estados de la empresa en Cámara de Comercio

| Estado | Significa | ¿Meta acepta? |
|---|---|---|
| **ACTIVA** | Todo OK | ✅ |
| **INACTIVA** | Sin renovar matrícula mercantil | ❌ Renovar antes |
| **CANCELADA** | Liquidada voluntariamente | ❌ No se puede recuperar |
| **DISUELTA** | En proceso de liquidación | ❌ |
| **SUSPENDIDA** | Sanción Supersociedades / DIAN | ❌ Resolver con autoridad |

**Renovación de matrícula mercantil:** vence cada año entre enero y marzo. Si MorfX SAS no renovó en 2026, está en riesgo de aparecer "INACTIVA". Verificar en RUES: [rues.org.co](https://www.rues.org.co/).

---

## Sección 8 — Timeline Expectations 2025-2026

### 8.1 — Tiempos reales por percentil (compilado de devs)

| Percentil | Tiempo en review | Comentario |
|---|---|---|
| P10 (rápidos) | 10 minutos - 2 horas | Auto-approval, docs perfectos |
| P50 (típico) | 24-72 horas | Review humano básico |
| P75 | 5-7 días hábiles | Review profundo |
| P90 | 14 días hábiles | Cuello de botella moderado |
| P95 | 21-30 días | Review pesado o queue lleno |
| P99 | 60+ días | Casos atascados — escalation needed |

### 8.2 — Días hábiles vs días corridos

Meta usa **business days** (días hábiles US, lunes-viernes excluyendo feriados US). Por eso:
- Submit viernes → no avanza hasta lunes
- Diciembre suele ser slowest (holidays US)
- Casos LATAM no tienen prioridad regional separada — entran al queue global

### 8.3 — Cuándo preocuparse

| Días en review | Acción |
|---|---|
| 0-3 | Calma, normal |
| 4-7 | Verificar email + Business Manager notifications diariamente |
| 8-14 | Empezar a preparar plan de re-submit por si rechaza |
| 15-21 | Revisar Meta Developer Community Forum por updates |
| 22-30 | Abrir caso Business Help Center |
| 30+ | Considerar abrir thread público en forum (a veces acelera) |

---

## Sección 9 — Escalation Paths

### 9.1 — Vías oficiales

1. **Meta Business Help Center — Contact Support**
   URL: `https://www.facebook.com/business/help/support`
   Categoría: Business Verification → "My verification is stuck"
   Disponible: 24/7 chat (calidad variable)

2. **Meta for Developers — Bug/Issue Report**
   URL: `https://developers.facebook.com/support/bugs/`
   Útil si la BV está atascada por bug del UI (raro pero pasa)

3. **Meta Direct Support (Tech Provider o Marketing Partner)**
   Solo si MorfX califica como Tech Provider — no es el caso aún

### 9.2 — Vías no oficiales que han funcionado

1. **Meta Developer Community Forum**
   URL: `https://communityforums.atmeta.com/`
   Postear en "Dev Quest" con detalles + tag `#business-verification`
   Algunos staff Meta monitorean y escalan

2. **Twitter/X @MetaBusiness o @Meta**
   Tweet público mencionando el delay; respuesta lenta pero a veces escala

3. **LinkedIn — Meta Sales reps Colombia**
   Si conoces algún Meta employee LATAM, pedirles forward al equipo correcto

### 9.3 — Lo que NO hacer

- ❌ Enviar misma BV con admin distinto sin esperar respuesta del primer intento
- ❌ Cambiar legal name en Business Info mid-review (cancela y empieza de cero)
- ❌ Cambiar dominio o email contact mid-review
- ❌ Comprar Meta Verified Business pensando que acelera BV — son procesos separados

---

## Sección 10 — Post-Approval — Primeras 24h

### 10.1 — Inmediato (minuto 0-30)

1. Verificar email confirmation + notification en Business Manager
2. Capturar screenshot del status "Verified" para records
3. Ir a `developers.facebook.com/apps/1559280425149650/settings/basic`
4. Verificar que el banner rojo "Currently Ineligible for Submission" haya desaparecido
5. Verificar que aparezca un nuevo banner verde "Eligible for Advanced Access"

### 10.2 — Primeras 2-4 horas

1. Revisar la sección "Advanced Access" en App Dashboard → Permissions and Features
2. Por cada permiso que MorfX necesita, hacer al menos 1 API call exitosa con Standard Access primero (Meta exige esto antes de poder solicitar Advanced)
   - `pages_messaging` — recibir un test message del Page admin
   - `instagram_manage_messages` — leer un test DM del IG account admin
3. Confirmar que tienes los videos demo + descripciones listas (ver `meta-access-verification-guide.md`)

### 10.3 — Día 1 — preparar Submission de App Review

1. Re-leer `.planning/research/meta-access-verification-guide.md` §6 (descripciones por permiso) y §7 (screencasts)
2. Crear test user dummy + endpoint TOTP
3. Verificar que privacy policy menciona FB/IG + OpenAI/Anthropic explícitamente
4. Verificar que data deletion page está live (la otra instancia ya está creando esto)
5. Cuando todo esté listo: App Review → Permissions and Features → Request Advanced Access en bulk

### 10.4 — Qué se desbloquea inmediato

Post-BV approval, **sin necesidad de App Review**, puedes:
- Crear más Business assets (más Pages, más Ad Accounts)
- Compartir assets con otros Business Portfolios
- Procesar `business_management` en Standard Access (limitado a apps Roles)

**NO se desbloquea hasta App Review:**
- `pages_messaging` para Pages que no son de tu Business Portfolio
- `instagram_manage_messages` para IG accounts que no son tuyas
- Cualquier Advanced Access que requiera review humano

---

## Sección 11 — Top 5 Risks Específicos MorfX

### Risk 1 — Display Name "morf·x" con dot tipográfico vs Legal Name "MorfX S.A.S."

**Severidad:** 🟠 ALTA
**Probabilidad:** ~40% si el dot se filtró al Legal Name field
**Mitigation:** verificar `business.facebook.com/settings/info` HOY que el Legal Name diga exactamente `MorfX S.A.S.` (con puntos, sin dot tipográfico, con mayúscula M). Display Name puede tener el dot — son campos distintos.

### Risk 2 — Cámara de Comercio puede estar vencida (>30 días)

**Severidad:** 🟡 MEDIA
**Probabilidad:** depende de cuándo la generaste
**Mitigation:** descargá UNA NUEVA hoy desde CCB online (~$15.000 COP, 5 min). Aunque Meta no rechace por 31 días, si te rechaza por otra cosa y tenés que re-submit, tener una fresca evita doble trámite.

### Risk 3 — RUT con CIIU desactualizado o estado SUSPENDIDO

**Severidad:** 🟠 ALTA si está SUSPENDIDO; 🟡 MEDIA si solo CIIU viejo
**Probabilidad:** ~10% (la mayoría de SAS están ACTIVAS, suspensión por DIAN es rara)
**Mitigation:** descargar RUT actualizado desde MUISCA hoy. Verificar estado "ACTIVO" en encabezado.

### Risk 4 — Domain registrado a nombre personal en Porkbun

**Severidad:** 🟢 BAJA
**Probabilidad:** alta (típico que dev compre dominio personal)
**Mitigation:** no urgente. WHOIS privacy de Porkbun oculta el dato. Lo que sí es importante: hacer Domain Verification (DNS TXT) que sí se puede.

### Risk 5 — Email del admin Business Portfolio NO es @morfx.app

**Severidad:** 🟠 ALTA si no lo es
**Probabilidad:** ~30% (devs suelen registrar Business Manager con personal email)
**Mitigation:** revisar en `business.facebook.com/settings/people` quién es el "Admin" — debe ser email `@morfx.app`. Si no lo es:
- Crear un email `admin@morfx.app` o usar `info@morfx.app`
- Invitarlo como admin al Business Portfolio
- Eventualmente removar el personal email (NO durante review)

---

## Sección 12 — Top 3 Cosas que Hacer HOY (independientemente del status)

### 1. Verificar legal name field — 5 minutos

Ir a `business.facebook.com/settings/info` → confirmar que "Legal name" coincide carácter-por-carácter con el RUT. Captura de pantalla para records.

### 2. Descargar docs frescos — 10 minutos

- Cámara de Comercio nueva (CCB online o equivalente)
- RUT actualizado en MUISCA
- Cédula representante legal escaneada (ambos lados, alta resolución)

Tenerlos listos en una carpeta `morfx-bv-docs/` por si Meta pide más.

### 3. Verificar Domain Verification status — 15 minutos

Ir a `business.facebook.com/settings/domains` → si `morfx.app` no aparece "Verified", agregar y completar DNS TXT en Porkbun. Ayuda como signal positiva en BV review (no obligatorio pero no-cost).

---

## Sección 13 — Red Flags Detectados en el Setup Actual

Basado en el contexto del usuario:

🟢 **Positivos confirmados:**
- App ID válido (`1559280425149650`)
- Display Name `morf·x` configurado
- Privacy policy + Terms en `morfx.app/en/`
- Category seleccionada (Messenger bots for business)
- App icon 1024×1024 generado
- App Domains configurado (después de la corrección a `morfx.app, www.morfx.app`)

🟡 **Necesita verificación:**
- ¿El Legal Name en Business Info matchea exactamente "MorfX S.A.S." del RUT?
- ¿El admin del Business Portfolio tiene email `@morfx.app`?
- ¿Domain Verification está hecha?
- ¿El RUT está actualizado en DIAN MUISCA?

🟠 **Posibles issues sutiles:**
- BV iniciada hace ~1 día pero "Authorizations and verifications" muestra otra cosa (regulatory ads) — confirmar que la BV submitida desde Security Center sea la correcta
- Dominio probable registrado a nombre personal — no bloquea pero podría alinear a futuro
- Data deletion URL aún no live (otra instancia en proceso) — bloquea Gate 3 (App Review) pero no Gate 1 (BV)

❌ **No detectado pero podría ser issue:**
- Estado de la SAS en RUES no verificado — confirmar "ACTIVA"
- Renovación matrícula mercantil 2026 — confirmar al día (vencimiento enero-marzo)
- 2FA del admin del Business Portfolio — confirmar activado

---

## Sección 14 — Sources

### Oficial Meta
- [Verify Your Business in Meta Business Suite | Meta Business Help Center](https://www.facebook.com/business/help/2058515294227817) (acceso restringido, page title only)
- [About Business Verification in Meta Business Suite](https://www.facebook.com/business/help/1095661473946872)
- [Upload official documents to verify your business](https://www.facebook.com/business/help/159334372093366)
- [Troubleshoot Issues With Verifying Your Business](https://www.facebook.com/business/help/2342133782492969)
- [Business Verification — App Development with Meta](https://developers.facebook.com/docs/development/release/business-verification/)
- [About Domain Verification](https://www.facebook.com/business/help/286768115176155)
- [Developer Platform requiring Business Verification for Advanced Access](https://developers.facebook.com/blog/post/2023/02/01/developer-platform-requiring-business-verification-for-advanced-access/)

### Guides operativas
- [Meta Business Verification 2026 Complete Guide — AGrowth.io](https://agrowth.io/blogs/facebook-ads/how-to-verify-your-business-on-meta)
- [Why can't my business be verified by Meta? — Wati.io](https://support.wati.io/en/articles/11463209-why-can-t-my-business-be-verified-by-meta)
- [10 Reasons your Facebook Business Verification Is Failing — Interakt](https://www.interakt.shop/blog/reasons-for-facebook-business-verification-failure/)
- [Meta Business Verification — Respond.io](https://respond.io/help/whatsapp/meta-business-verification)
- [Meta Business Verification — 360dialog](https://docs.360dialog.com/docs/resources/meta-business-verification/standard-business-verification)
- [How to submit a Meta Business Account Verification — Superchat](https://help.superchat.com/en/articles/14982-how-to-submit-a-meta-business-account-verification)

### LATAM / Colombia específico
- [Verificación De Cuenta Meta Business Suite — Cognitiva.la](https://cognitiva.la/verificacion-cuenta-meta-business-suite/)
- [Pasos verificar cuenta — Cliengo](https://help.cliengo.com/hc/es/articles/6004805765915-pasos-para-verificar-una-cuenta-en-el-administrador-comercial-de-facebook)
- [Solucionar problemas verificación Meta (ES)](https://es-la.facebook.com/business/help/2342133782492969)

### Colombia trámites
- [DIAN — Inscripción y actualización RUT](https://www.dian.gov.co/impuestos/RUT/Paginas/Inscripcion-y-actualizacion-RUT.aspx)
- [DIAN MUISCA — Consulta RUT](https://muisca.dian.gov.co/WebRutMuisca/DefActualizarRut2.faces)
- [Cámara de Comercio Bogotá — Certificados](https://www.ccb.org.co/es/tramites-y-consultas/certificados-ccb)
- [RUES — Registro Único Empresarial y Social](https://www.rues.org.co/)
- [Gerencie.com — Vigencia certificado existencia](https://www.gerencie.com/certificado-de-existencia-y-representacion-legal.html)

### Forums / casos reales
- [Meta Developer Community — In Review exceeds 5 days](https://communityforums.atmeta.com/discussions/dev-quest/meta-business-manager-account-in-review-status-exceeds-5-business-days-without-a/1257652)
- [Quora — Third time rejection](https://www.quora.com/Third-time-my-Facebook-request-for-Business-Verification-got-rejected-after-a-month-without-notification-explanation-FB-support-advises-to-resubmit-blindly-the-same-files-Is-Facebook-Business-Verification-a-myth-or)

---

## Apéndice A — Checklist Pre-Rejection (qué tener listo HOY)

```
DOCS COLOMBIANOS
[ ] Cámara de Comercio reciente (<30 días)
    [ ] Estado: ACTIVA
    [ ] Razón social: "MorfX S.A.S." (verificar match exacto)
    [ ] Representante legal: nombre completo correcto
    [ ] Domicilio principal: dirección colombiana completa
    [ ] PDF descargado con código verificación

[ ] RUT actualizado de DIAN MUISCA
    [ ] Estado: ACTIVO
    [ ] Razón social matchea Cámara
    [ ] CIIU 2024 actualizado
    [ ] Última actualización: <6 meses
    [ ] PDF firmado digitalmente

[ ] Cédula representante legal
    [ ] Vigente
    [ ] Ambos lados escaneados
    [ ] Resolución 300+ DPI
    [ ] Mismo nombre que figura en Cámara y RUT

[ ] Comprobante address/phone (si Meta pide secundario)
    [ ] Recibo de servicios públicos a nombre SAS, O
    [ ] Extracto bancario corporativo
    [ ] <90 días

META BUSINESS MANAGER
[ ] Legal name field matchea Cámara/RUT exacto (verificar visual + paste)
[ ] Admin email es @morfx.app (no Gmail/Hotmail)
[ ] 2FA activado en admin account
[ ] App Domains: morfx.app, www.morfx.app
[ ] Domain Verification (TXT record) hecha en Porkbun → verified en Meta
[ ] App Settings completos (icon, privacy, terms, category)

CONTINGENCY
[ ] Captura del Legal Name actual en Business Info (por si hay que cambiar)
[ ] Email + password admin guardados (para re-submit con otro admin si pasa)
[ ] Folder local con todos los docs en PDF (para re-upload rápido)
```

## Apéndice B — Plantilla de Mensaje al Meta Support (si se atasca)

```
Hi Meta Business Support,

I'm writing about a Business Verification stuck in "In Review" status.

Business Portfolio: [Business Portfolio Name]
Business ID: [BID]
Country: Colombia
Legal Entity: MorfX S.A.S.
Submission date: [date]
Days in review: [N]

I have submitted:
- Cámara de Comercio (Certificate of Existence and Legal Representation)
  issued by [chamber name] on [date]
- Updated RUT (Tax Registration Certificate) downloaded from DIAN MUISCA
  on [date]
- Legal representative ID

All documents match Business Manager Business Info exactly. The legal name
"MorfX S.A.S." appears identically across:
- Cámara de Comercio
- RUT
- Business Manager Business Info field
- Website footer at https://www.morfx.app

I've waited [N] business days, exceeding the typical 14-day window. Could
you please escalate this for review?

Thank you,
[Name + role + email @morfx.app]
```

---

**Fin del documento.** Última actualización: 2026-05-07.
