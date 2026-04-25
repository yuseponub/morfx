import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed', // ES at /, EN at /en
  /* Bug 2026-04-25: con localeDetection: true (default) la cookie
   * `NEXT_LOCALE` puede anular la URL como source of truth, causando
   * que el toggle EN→ES quede half-translated (server respeta URL,
   * client usa cookie stale) y que el segundo toggle redirija al
   * /login porque el flujo intermedio falla el exact-match del
   * PUBLIC_MARKETING_ROUTES set en middleware.ts. URL es la única
   * verdad — el toggle escribe la URL directamente.
   */
  localeDetection: false,
});
