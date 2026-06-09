# SWEEP-RESULTS — whatsapp-history-reader (Plan 07)

**Fecha:** 2026-06-08
**Número:** 573202067077 (Varixcenter)
**Autorización:** Plan 06 PILOT-RESULTS = GO ✅
**Resultado:** ✅ **Barrido completo exitoso**

---

## Resumen

Se respaldó el historial completo de **todos los chats 1:1** (activos + archivados) del número,
en JSON por chat + `manifest.json`, con la garantía read-only (D-15). El barrido corrió en tandas
resumibles (D-11/D-13) y terminó con **0 fallidos** y **0 números perdidos**.

## Cifras finales

| Métrica | Valor |
|---|---|
| Chats 1:1 respaldados (`status:done`) | **529** |
| Fallidos | **0** |
| Pendientes | **0** |
| `numberMissing` (sin número) | **0** |
| **null-rate final** | **0.000** (umbral 0.08) |
| Mensajes respaldados | **~4.100** |
| Chat más grande | 130 mensajes |
| Mediana de mensajes/chat | 5 |
| Tamaño en disco | 2.4 MB (solo texto + placeholders) |
| JSON en disco | 529 (= entradas del manifest) |
| Integridad | los 529 JSON parsean OK (escritura atómica temp+rename, sin truncados) |

## Cómo se ejecutó (D-11/D-13/D-15)

- **Tanda 1:** piloto (5 chats) — validación de fidelidad (PILOT-RESULTS.md).
- **Tanda 2:** 150 chats (`--limit 150 --resume`).
- **Tanda 3:** 150 chats (driver resumible).
- **Tanda 4:** 229 chats restantes en una sola sesión (`--limit 600 --resume`).
- Cada corrida reanudó vía manifest (saltó `done`, D-11). Pacing anti-ban 4–9s/chat (D-13).
- **Read-only (D-15):** 0 paths de envío en `src`; en fallos transitorios el robot pausó limpio
  y reanudó — **nunca envió nada**.

## Completitud verificada (no truncado)

- Prueba en vivo: el chat más grande devolvió su primer mensaje = `e2e_notification` (inicio real
  del chat); `loadEarlierMsgs()` devolvió 0 y el conteo no creció → **no hay historial más antiguo
  pendiente en el teléfono**. Cada chat está completo desde su inicio.
- Mensajes en orden cronológico estable; timestamps America/Bogota; `fromMe` correcto; media como
  placeholder sin descarga (D-10).

## Limpieza de no-1:1 (D-01)

- Durante el barrido se colaron 5 entradas de **difusión/estado** (4× `@broadcast` + 1× `0@c.us`)
  porque el filtro por flags no las cubría. Se **excluyeron** (filtro endurecido a allowlist
  `@c.us|@lid` + `isBroadcast`) y se eliminaron del output. No eran conversaciones 1:1 (1 msg c/u
  de metadata). Cifra final 529 = solo chats 1:1 reales.

## Ubicación del backup (PII — LOCAL)

- `robot-whatsapp-reader/output/573202067077/` — 529 JSON + manifest.json.
- **Gitignored** (no se sube). Mantener local; borrar tras el import de la Etapa 2.

## D-14 — Desvincular dispositivo (acción del operador)

Tras confirmar el backup, **desvincular** desde el teléfono:
WhatsApp → Dispositivos vinculados → cerrar la sesión de este navegador. (One-shot, no linked-device 24/7.)

## Conclusión

✅ Etapa 1 (respaldo read-only previo a migración) **completa** para 573202067077.
El número puede migrarse a la API sin perder el historial visible (queda en los JSON locales).
