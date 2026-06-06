# WhatsApp History Reader — CONTEXT

**Standalone:** `whatsapp-history-reader`
**Created:** 2026-06-06
**Status:** Discuss-phase capturado — listo para `research-phase`
**Etapa:** 1 de 2 (esta = solo LECTURA; la etapa 2 = migrador/importador a MorfX, standalone separado posterior)

---

## El qué

Robot **local, read-only** que lee WhatsApp Web vía Playwright (manejando el cliente web **real**, no librerías de protocolo) y guarda los historiales de conversación de un número de WhatsApp normal a archivos JSON. Reutilizable para hacer onboarding de **todos los clientes** de MorfX antes de migrar su número a la API.

El robot **jamás envía un mensaje**. Solo escanea un QR (Dispositivos vinculados), recorre los chats, hace scroll para cargar el historial completo y extrae texto + remitente + fecha + identidad del contacto.

## El por qué

Cuando un cliente migra su número a la API de WhatsApp (lo que MorfX necesita), el número se da de baja de la app y **se pierde el historial visible**. La API solo entrega mensajes desde su activación hacia adelante — no hay forma de recuperar lo viejo. Hay que respaldar **antes** de migrar. Esto elimina la objeción "pierdo todos mis chats" en el onboarding.

Caso disparador: número del centro médico del papá del usuario (`316 281 4531`, leads de Facebook) que da el error "este número ya está registrado con una cuenta de WhatsApp" al intentar conectarlo a MorfX.

## El por qué del enfoque (research anti-baneo)

Research web hecho 2026-06-06 (a formalizar en `RESEARCH.md`). Conclusiones que **rigen el diseño**:

1. **El riesgo de baneo está casi todo en el ENVÍO, no en la lectura.** Bots reactivos (que envían) <2% baneo/12 meses; un robot que envía **cero** está por debajo. Las señales de baneo son: mensajes a no-contactos, velocidad de envío, bloqueos/reportes, mensajes sin respuesta en 48h (regla 2026). Ninguna aplica a solo-lectura.
2. **Playwright sobre el cliente web REAL esquiva las ban-waves de protocolo.** Baileys/whatsmeow reimplementan el protocolo → detectables por fingerprint del handshake → caen en oleadas cada 2-3 meses. El cliente web real hace el handshake oficial; el único vector restante es comportamiento + CDP leaks (mitigable).
3. **Riesgo residual ≠ cero.** Solo el export nativo es cero. El usuario aceptó romper ToS; lo innegociable es no baneo. Diseño = mínimo riesgo alcanzable automatizando.

---

## Decisiones (locked)

### Alcance de chats (Área 1)
- **D-01:** Solo chats **individuales** (1:1). Excluir grupos, comunidades y listas de difusión (los leads son 1:1; lo demás es ruido).
- **D-02:** **Incluir** chats archivados (los leads viejos suelen estar archivados).
- **D-03:** **Historial completo** por chat — scroll hasta el primer mensaje. No cortar por fecha.

### Captura del número de teléfono (Área 2)
- **D-04:** Captura **best-effort**: extraer el número del identificador interno (JID) / DOM **sin clic** primero; abrir el panel de info del contacto **solo si** el número no está disponible. Todo read-only (abrir info = clic de lectura, riesgo de baneo insignificante).
- **D-05:** Si un chat no arroja número → guardarlo igual con `number: null` + flag `numberMissing: true`. No se pierde la conversación.
- **D-06:** ⚠️ **GATE DE CALIDAD INNEGOCIABLE:** `number=null` es excepción para casos raros. **Si la tasa de chats sin número supera un umbral bajo (a definir en research/plan, ~5-10%), el robot debe FALLAR / ALERTAR** — no producir un respaldo masivamente incompleto en silencio. Un null-rate alto = bug grave del extractor, no resultado aceptable.

### Estructura de salida (Área 3)
- **D-07:** **Un archivo JSON por chat** (nombrado por número/JID, ej. `573162814531.json`) + un `manifest.json` índice con la lista de chats y su estado. Encaja con el checkpoint (D-11).
- **D-08:** El esquema debe **diferenciar nítidamente al negocio ("yo"/emisor) del cliente (el otro)**, e incluir la **identidad del propio número de negocio** a nivel de chat, para que el robot migrador a MorfX (etapa 2) identifique fácil quién es quién sin ambigüedad.
- **D-09:** Por mensaje: `{ fromMe: boolean, timestamp (normalizado America/Bogota — Regla 2), text, type }`.
- **D-10:** Mensajes **no-texto** (imágenes, audios, docs, stickers): **placeholder en su posición** — ej. `{ type:'image', text:null, note:'<imagen omitida>' }`. **NO se descarga ningún archivo.** Preserva el flujo de la conversación.

### Robustez y multi-cliente (Área 4 — delegada a Claude; requisito del usuario locked: "que no se rompa, y si se rompe que tenga protocolo de continuo sin repetir mismos chats")
- **D-11:** **Checkpoint por chat** vía `manifest.json` con estado por chat (`pending` / `done` / `failed`) + conteo de mensajes + timestamp. En reanudación, **NUNCA re-scrapea un chat marcado `done`**.
- **D-12:** **Escritura atómica por chat** (escribir a temp + rename; marcar `done` en el manifest **solo tras** escritura completa) → un crash a mitad de un chat no lo cuenta como completo.
- **D-13:** **Parámetros anti-baneo configurables**: delays de scroll, pausas entre chats, cap opcional de chats por sesión / tope diario, timing aleatorizado (humano). Permite correr en **tandas**; cada tanda reanuda donde quedó.
- **D-14:** **Multi-cliente**: parametrizado por número/cliente — carpeta de salida por número + perfil de navegador (`userDataDir`) **aislado por número**. Reusable para todos los clientes.
- **D-15:** **Fail-safe**: si la sesión se desloguea / el QR expira → pausar limpio y avisar; **jamás reintentar enviando nada**. Garantía dura: **ningún code path del robot envía mensajes** (no se implementa send).

### Claude's Discretion
- Ubicación del código: proyecto Node+Playwright **independiente** (patrón `robot-godentist/`), probablemente `robot-whatsapp-reader/` en la raíz. NO dentro del app Next.js.
- Umbral exacto del gate D-06, valores default de delays/caps D-13, esquema JSON exacto (campos finos) — a definir en research/plan respetando las decisiones de arriba.
- Mecánica precisa de extracción del JID/número (DOM vs store interno) — research-phase con validación en cliente real.

---

## Restricciones operacionales

- **Read-only estricto** (D-15). Cero envíos, ninguna excepción.
- **Playwright sobre `web.whatsapp.com` real** — nunca Baileys/whatsmeow/protocolo.
- **Ejecución LOCAL** en el PC del usuario (IP residencial consistente con el teléfono). NO datacenter/Railway (evita flag de IP cluster).
- Navegador real + perfil persistente (`userDataDir`), ritmo humano, extracción **one-shot** y luego desvincular (no linked-device 24/7). Login por **QR oficial** (Dispositivos vinculados).
- **Sin media/docs** — solo texto + placeholders.
- **Regla 6 trivialmente satisfecha**: es una herramienta aparte; NO toca el app MorfX, ni agentes productivos, ni la DB de producción.
- **Regla 2**: timestamps normalizados a `America/Bogota`.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Precedentes de código (reusar patrón)
- `robot-godentist/` — robot Node+Playwright independiente (express + playwright ^1.52, Dockerfile, `src/adapters/`). Plantilla estructural para `robot-whatsapp-reader/`.
- `scripts/kommo-scraper.ts` — precedente de scraping Playwright dentro del repo (manejo de sesión, scroll, extracción DOM).

### Research
- `RESEARCH.md` (a crear en research-phase) — formaliza el research anti-baneo resumido arriba. Sin ADRs externos en el repo para este tema.

---

## Code Context

### Reusable Assets
- **`robot-godentist/`**: estructura de proyecto Playwright independiente (package.json propio, tsconfig, Dockerfile, `dist/` build via `tsc`, `dev` via `tsx watch`). Copiar layout.
- **`scripts/kommo-scraper.ts` + `scripts/_diag-browser-repro-local.ts`**: patrones de scroll lazy-load, espera de selectores, extracción DOM con Playwright.

### Established Patterns
- Robots viven como proyectos Node separados con su propio `package.json` (no parte del build Next.js).
- Playwright `^1.52` ya en uso en el repo.

### Integration Points
- **Etapa 1 (este standalone): NINGUNA con MorfX.** La salida son archivos JSON locales. No escribe a la DB, no toca el app.
- **Etapa 2 (futuro standalone migrador):** consumirá estos JSON para crear contactos + conversaciones + mensajes en MorfX (vía domain layer, con `source='import'` que bypasea agentes/automatizaciones). El esquema D-08 está diseñado para que ese consumo sea trivial.

---

## Deferred Ideas

- **Etapa 2 — Robot migrador/importador a MorfX**: "simula" las conversaciones dentro del inbox de MorfX (con fechas reales) para que los clientes las vean **como si hubieran pasado ahí**. NO es para dar contexto a agentes — solo visualización archival. Standalone separado posterior. Requisito de diseño: importar **sin disparar** agente/automatizaciones sobre mensajes viejos (`source='import'`), dedup de contactos por número.
- **Captura de media/docs**: omitida en V1 (solo placeholders). Posible V1.1 si se necesita.
- **Grupos / comunidades / difusión**: excluidos (D-01); reconsiderar solo si un cliente lo necesita.

---

*Standalone: whatsapp-history-reader*
*Context gathered: 2026-06-06*
