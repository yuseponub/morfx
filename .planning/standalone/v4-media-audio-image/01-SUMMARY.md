# 01-SUMMARY — Wave 0: migración messages.transcription

**Plan:** 01 · **Wave:** 0 · **Tipo:** migración (Regla 5) · **Fecha:** 2026-06-01

## Qué se hizo
- **Archivo:** `supabase/migrations/20260601000000_messages_transcription.sql`
- **SQL:** `ALTER TABLE messages ADD COLUMN transcription TEXT NULL;`
- Aditiva, no-destructiva, sin index, sin NOT NULL, sin DEFAULT, **sin backfill** (D-04 forward-looking — audios viejos quedan `transcription = NULL`).
- **Commit:** `a7ea36d1` (pusheado a `exec/debounce-v2-wave6`).

## Acceptance criteria
- `grep -c "ADD COLUMN transcription"` = 1 ✅
- Sin `NOT NULL` / `DEFAULT` / `UPDATE` en el archivo (grep = 0) ✅

## Regla 5 — PAUSA RESUELTA ✅
- **Aplicada en PROD por el usuario el 2026-06-01.** Ejecutó `ALTER TABLE messages ADD COLUMN transcription TEXT NULL;` en el SQL Editor de Supabase prod → resultado `Success. No rows returned` (output esperado de DDL).
- La columna `messages.transcription TEXT NULL` ahora existe en producción.
- **Waves 1-5 pueden pushearse con seguridad** — el código que lee/escribe `messages.transcription` ya tiene la columna en prod (no se repite el incidente de 20h).

## Estado
Wave 0 ✅ COMPLETA. Desbloqueadas Waves 1-5 (execute completo sin pausas).
