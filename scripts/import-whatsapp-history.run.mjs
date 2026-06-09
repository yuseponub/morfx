/**
 * Runner del importador de historiales (whatsapp-history-importer).
 *
 * POR QUÉ ESTE WRAPPER (no `npx tsx` directo):
 *   `tsx` carga los módulos JSON como ESM y envuelve la metadata de
 *   `libphonenumber-js` como `{ default: ... }`. La librería espera el objeto
 *   crudo → `normalizePhone` (usado por el domain `resolveOrCreateContact`)
 *   falla SILENCIOSAMENTE y devuelve null → todos los chats se rechazan con
 *   "Numero de telefono invalido". (Descubierto en el piloto Plan 03.)
 *
 * SOLUCIÓN: esbuild transpila el TS (resuelve los alias `@/` vía tsconfig) pero
 * deja los paquetes npm EXTERNAL → los carga el `node` real, que sí lee el JSON
 * de metadata correctamente. CERO cambio en `src/lib/utils/phone.ts` (Regla 6:
 * el agente en producción no se toca).
 *
 * Uso (mismos args que el CLI):
 *   node --env-file=.env.local scripts/import-whatsapp-history.run.mjs \
 *     --backup robot-whatsapp-reader/output/<num> \
 *     --workspace <uuid> --phone-number-id <id> [--apply] [--limit N]
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const outfile = join(here, '.import-whatsapp-history.bundle.cjs')

await build({
  entryPoints: [join(here, 'import-whatsapp-history.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external', // npm packages los carga node (libphonenumber-js OK)
  outfile,
  logLevel: 'error',
  tsconfig: join(here, '..', 'tsconfig.json'),
})

// Ejecuta el bundle en ESTE proceso → conserva process.argv (los args del CLI).
const require = createRequire(import.meta.url)
require(outfile)
