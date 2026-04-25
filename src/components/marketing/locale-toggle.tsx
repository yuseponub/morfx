'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

/**
 * Bug 2026-04-25: la implementación previa con `router.replace(pathname,
 * { locale })` + `useTransition` producía 2 problemas:
 *
 *   (a) Toggle EN→ES traducía solo parcialmente la página (server
 *       respondía con el locale nuevo pero el cliente conservaba
 *       traducciones del prev render, causando hidration mismatch
 *       parcial visible).
 *
 *   (b) Segundo toggle redirigía al `/login` porque el flujo
 *       intermedio de next-intl con `localePrefix: 'as-needed'` +
 *       `localeDetection: true` (default) generaba navegación que
 *       fallaba el exact-match del `PUBLIC_MARKETING_ROUTES` set en
 *       `middleware.ts`, cayendo a `updateSession` que envía a /login.
 *
 * Fix: (1) `localeDetection: false` en `routing.ts` — la URL es la
 * única source of truth, no la cookie stale. (2) Aquí: <Link> de
 * next-intl con `locale` prop — navegación nativa que el middleware
 * de next-intl resuelve correctamente sin pasar por replace+cookie.
 */
export function LocaleToggle() {
  const t = useTranslations('Header');
  const locale = useLocale();
  const pathname = usePathname();

  const baseSpan = 'px-[9px] py-[5px] transition-colors select-none inline-block';
  const activeSpan = 'bg-[var(--ink-1)] text-[var(--paper-0)]';
  const inactiveSpan =
    'text-[var(--ink-3)] cursor-pointer hover:bg-[var(--paper-3)]';

  return (
    <div
      role="group"
      aria-label={t('localeToggleLabel')}
      className="inline-flex overflow-hidden rounded-[3px] border border-[var(--ink-1)] text-[11px] font-semibold"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <Link
        href={pathname}
        locale="es"
        replace
        prefetch={false}
        aria-current={locale === 'es' ? 'true' : undefined}
        className={`${baseSpan} ${locale === 'es' ? activeSpan : inactiveSpan}`}
      >
        ES
      </Link>
      <Link
        href={pathname}
        locale="en"
        replace
        prefetch={false}
        aria-current={locale === 'en' ? 'true' : undefined}
        className={`${baseSpan} ${locale === 'en' ? activeSpan : inactiveSpan}`}
      >
        EN
      </Link>
    </div>
  );
}
