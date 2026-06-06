# robot-whatsapp-reader

Robot **local, read-only** que respalda los historiales de WhatsApp de un número **antes**
de migrarlo a la API (la migración da de baja el número y se pierde el historial visible).

> **Garantía dura (D-15):** este robot **JAMÁS / NUNCA** envía un mensaje. No existe ningún
> code path de envío en `src/` (ver "Zero-send guarantee" abajo). Es estrictamente de lectura.

---

## Qué hace / qué NO hace

- **Hace:** lee `web.whatsapp.com` (cliente web real vía Playwright + wa-js), enumera chats
  1:1 (incluidos los **archivados** — D-01/D-02), hace una lectura del historial completo desde
  el Store y guarda **un JSON por chat** + un `manifest.json` con el estado de cada chat.
- **NO hace:**
  - **No envía** ni un mensaje (D-15). Si la sesión se cae, **pausa limpio** y avisa — nunca
    intenta "despertar" la sesión enviando algo.
  - **No descarga media** (imágenes/audios/docs/stickers): se deja un placeholder en su
    posición (`<imagen omitida>`, etc.) para preservar el flujo de la conversación (D-10).
  - **No toca grupos / comunidades / difusión** (D-01) — solo chats 1:1.
  - **No toca la DB de MorfX ni el app** — la salida son archivos JSON locales (etapa 1 de 2).

---

## Install

```bash
cd robot-whatsapp-reader
npm install
npx playwright install chromium   # fallback; el robot usa Chrome del sistema (channel:'chrome')
```

> El robot abre **Chrome real** (`channel:'chrome'`, headed) para reducir fingerprint de
> automatización. Si no hay Chrome del sistema, el Chromium instalado arriba es el fallback.

---

## 1) Corre el PILOTO primero (D-16 — obligatorio)

La primera corrida es un **piloto guiado**: corre una muestra pequeña (`config.pilotChatCount`,
por defecto 5 chats) y **HALTA**. No barre el resto.

```bash
npm run dev -- --number 573162814531 --pilot
```

1. Se abre Chrome → **escanea el QR** desde tu teléfono (WhatsApp → Dispositivos vinculados).
2. Espera a que termine. Al final imprime un banner `PILOT COMPLETE` con el **null-rate**.
3. **INSPECCIONA** `output/573162814531/`:
   - 5 JSON de chat + `manifest.json`.
   - Verifica estructura (mensajes en orden, `fromMe` correcto, fechas en `America/Bogota`,
     placeholders de media en su lugar) y el **null-rate** impreso.
4. **NO barras** hasta validar la estructura y el null-rate (ese es el gate del Plan 06).

El piloto **NUNCA** continúa solo al barrido completo: tienes que correr **sin** `--pilot`.

---

## 2) Barrido completo (solo tras aprobar el piloto)

```bash
npm run dev -- --number 573162814531
```

- **Reanuda automáticamente** (salta los chats ya `done` — D-11).
- Corre en **tandas**: cada corrida procesa hasta `config.perSessionChatCap` (o `--limit N`) y
  reanuda donde quedó la siguiente vez (D-13).
- Pacing anti-ban: pausas aleatorizadas entre chats (D-13).

```bash
npm run dev -- --number 573162814531 --limit 50   # tanda acotada a 50 chats
```

---

## 3) Resume / fail-safe

Si la sesión se desloguea o el QR expira, el robot **pausa limpio** y te dice que re-escanees.
El chat en vuelo queda `pending` (no se marca `done`), así que **no se pierde**.

```bash
npm run dev -- --number 573162814531 --resume   # salta los done, retoma pending/failed
```

> El robot **NUNCA** envía nada para reactivar la sesión. Solo lee.

---

## 4) Después del barrido de un cliente — desvincular (unlink)

Cuando termines un cliente, **desvincula el dispositivo** desde el teléfono
(WhatsApp → **Dispositivos vinculados / Linked Devices** → cerrar sesión). Esto es **one-shot**:
no es un linked-device 24/7 (reduce exposición y huella).

> Los JSON en `output/` son **PII**: están gitignored, mantenlos **locales** y **bórralos**
> después del import de la etapa 2.

---

## 5) Multi-cliente (D-14)

Repite con otro `--number`. Cada cliente obtiene su propio:

- `output/<number>/` — sus JSON + manifest.
- `profiles/<number>/` — su perfil de navegador aislado (su propia sesión QR).

```bash
npm run dev -- --number 573001112233 --pilot
```

---

## D-06 — gate de calidad (null-rate)

`number: null` es excepción para casos raros. Si la tasa de chats sin número supera
`config.nullRateThreshold` (**0.08**) una vez procesados `config.nullRateMinSample` (**10**)
chats, el robot **FALLA en voz alta** (`NULL_RATE_GATE_TRIPPED`) y aborta — no produce un
respaldo masivamente incompleto en silencio. Un null-rate alto = bug del extractor, no resultado
aceptable.

---

## Zero-send guarantee (invariante D-15)

El robot no contiene **ningún** path de envío. Gate verificable sobre todo `src/`:

```bash
grep -rEn "sendText|sendMessage|WPP\.chat\.send|requestPhoneNumber" src/
```

**Debe retornar 0 líneas.** Si retorna algo, el build es no-conforme y la llamada ofensora debe
eliminarse **antes** de cualquier corrida. (Resultado al shippear el Plan 05: **0 coincidencias**.)
