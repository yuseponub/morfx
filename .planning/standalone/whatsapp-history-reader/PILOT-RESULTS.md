# PILOT-RESULTS — whatsapp-history-reader (Plan 06)

**Fecha:** 2026-06-08
**Número piloto:** 573202067077 (negocio Varixcenter — chats de varices/valoración)
**Modo:** `--pilot` (5 chats, HALT — D-16 gate, no barrió)
**Decisión:** ✅ **GO**

---

## Resumen ejecutivo

El piloto corrió sobre 5 chats reales y **HALTÓ** sin barrer (gate D-16 honrado). La estructura
JSON, la captura de número, y la fidelidad de mensajes (orden / timestamps / fromMe / placeholders)
se validaron contra datos reales. **null-rate 0.000**. Se autoriza el barrido completo (Plan 07).

## Métrica clave — null-rate (D-06)

- **null-rate medido: 0.000** (0 de 5 chats sin número resuelto).
- Todos los `@lid` se resolvieron a número E.164 vía Store cache (`getPnForLid` / panel).
- Umbral del gate: 0.08 (minSample 10). Holgadamente por debajo.

## Enumeración (D-01/D-02)

- **534 chats 1:1** enumerados desde `WPP.whatsapp.ChatStore.getModelsArray()` (grupos/newsletters excluidos).
- Fuente del Store estable (no DOM scroll). Archivados incluidos vía flag `archive`.

## Fidelidad de mensajes (validada contra datos reales)

| Chat (número) | msgs | numberMissing | inversiones cronológicas |
|---|---|---|---|
| 573124510825 (Dra María Carolina) | 79 | false | 0 |
| 573003955741 | 15 | false | 0 |
| 573213450681 | 6 | false | 0 |
| 573208558752 | 5 | false | 0 |
| 573212823711 | 3 | false | 0 |

- **Orden cronológico:** perfecto (0 inversiones tras stable-sort por unix-seconds).
- **Timestamps:** America/Bogota `-05:00` (Regla 2). ✓
- **fromMe:** correcto (verificado en conversación real: "¿Precio?" → respuesta → "Vasitos").
- **Texto:** preservado verbatim para `type:'chat'`.
- **No-texto (D-10):** `image`/`document`/`vcard`/`audio`/`ptt`/notificaciones → placeholder
  (`<imagen omitida>`, `<documento omitido>`, etc.), **sin descarga de media**. ✓
- **Identidad de negocio (D-08):** `business.number=573202067077` en cada JSON. ✓
- **schemaVersion 1** (D-07/D-09) presente y correcto. ✓

## Persistencia / resume (D-11/D-12)

- Escritura atómica (temp + rename) — JSON por chat + `manifest.json` 3-estados.
- Manifest: los 5 chats `status:done` con file/number/messageCount. Resume saltaría los done.

## Garantía read-only (D-15)

- `grep` sobre `robot-whatsapp-reader/src`: **0 paths de envío**, **0 requestPhoneNumber**.
- En fallos previos (CSP, timeout) el robot **pausó limpio y no envió nada** — fail-safe verificado en vivo.

## Resolución de open questions de RESEARCH (empírico)

- **Shape del mensaje crudo:** `m.id._serialized`, `m.id.fromMe`, `m.t` (unix SEGUNDOS), `m.type`, `m.body`/`m.caption`. Confirmado.
- **Gate de readiness:** `WPP.isReady` NO basta (lista vacía); hay que esperar `conn.isMainReady()` **y** leer de `ChatStore.getModelsArray()` (el `chat.list({onlyUsers})` devolvía 0 en la 1ra llamada). Locked.
- **LID→PN:** resoluble vía Store cache para chats con historial (null-rate 0 en la muestra).
- **Hidratación de archivados:** incluidos en `getModelsArray()` (flag `archive`).

## Bugs corregidos durante el piloto (no detectados en research headless)

1. `channel:'chrome'` sin Chrome de marca → fallback a Chromium empaquetado.
2. `require.resolve('@wppconnect/wa-js/dist/...')` → ERR_PACKAGE_PATH_NOT_EXPORTED → usar `'@wppconnect/wa-js'`.
3. CSP de WhatsApp Web bloqueaba `addScriptTag` → `bypassCSP:true`.
4. `WPP.isReady` true antes de sincronizar la lista → esperar `conn.isMainReady()`.
5. esbuild/tsx `__name` no definido en `page.evaluate` → shim `__name` identidad.
6. `chat.list({onlyUsers})` flaky 1ra llamada → enumerar desde `ChatStore.getModelsArray()`.
7. `e2e_notification` fuera de orden → stable-sort por timestamp.

## GO / NO-GO

✅ **GO** — autorizar barrido completo (Plan 07) de los ~534 chats 1:1 del número 573202067077,
en tandas resumibles, con la misma garantía read-only. Internet lento → más lento, no bloqueante
(resumible vía `--resume`).
