'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

/**
 * Bug 2026-04-25 (iteration 2): el fix previo con `<Link>` de next-intl
 * + `localeDetection: false` arregló la traducción parcial pero el
 * segundo toggle ES→EN→ES seguía redirigiendo al /login.
 *
 * Root cause v2: el `<Link>` de next-intl hace soft client-side
 * navigation que en `localePrefix: 'as-needed'` mode termina pasando
 * por un flujo intermedio (cookie write + RSC fetch) que no matcha
 * el exact-match del PUBLIC_MARKETING_ROUTES set en middleware.ts
 * para algunos requests intermedios.
 *
 * Fix definitivo: `<a>` puro con href absoluto computado client-side.
 * Hard browser navigation, sin cookies, sin client routing magic.
 *
 * Computación del href:
 * - usePathname de next/navigation retorna la URL actual COMPLETA
 *   (con prefix /en si aplica). Ej: '/en/privacy' o '/'.
 * - Para ES (default, sin prefix): strip '/en' del path → '/' o '/privacy'.
 * - Para EN (prefix /en): asegurar prefix '/en' → '/en' o '/en/privacy'.
 */
export function LocaleToggle() {
  const t = useTranslations('Header');
  const locale = useLocale();
  const pathname = usePathname() || '/';

  // Strip the /en prefix to get the locale-agnostic path.
  // Examples: '/en' → '/', '/en/privacy' → '/privacy', '/' → '/', '/privacy' → '/privacy'.
  const basePath = pathname === '/en'
    ? '/'
    : pathname.startsWith('/en/')
      ? pathname.slice(3) // '/en/privacy' → '/privacy'
      : pathname;

  const esHref = basePath; // ES default = no prefix
  const enHref = basePath === '/' ? '/en' : `/en${basePath}`;

  const baseSpan = 'px-[9px] py-[5px] transition-colors select-none inline-block no-underline';
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
      <a
        href={esHref}
        aria-current={locale === 'es' ? 'true' : undefined}
        className={`${baseSpan} ${locale === 'es' ? activeSpan : inactiveSpan}`}
      >
        ES
      </a>
      <a
        href={enHref}
        aria-current={locale === 'en' ? 'true' : undefined}
        className={`${baseSpan} ${locale === 'en' ? activeSpan : inactiveSpan}`}
      >
        EN
      </a>
    </div>
  );
}
