'use client';

import { useLocale, useTranslations } from 'next-intl';

import { usePathname } from '@/i18n/navigation';

/**
 * Bug 2026-04-25 (iteration 3 — definitivo confirmado por curl):
 *
 * Root cause real: `usePathname` de `next/navigation` retorna el
 * internal route segment (con `[locale]` resuelto) — ej. `/es` cuando
 * el usuario está en `/`. Eso causaba que mi código generara
 * `<a href="/es">ES</a>` y `<a href="/en/es">EN</a>` (ambos wrong).
 * `/en/es` NO está en PUBLIC_MARKETING_ROUTES → cae a updateSession
 * → user no auth → redirect /login.
 *
 * Fix: usar `usePathname` de `@/i18n/navigation` (next-intl wrapper)
 * que SÍ strippea el locale segment automáticamente. En `/` retorna
 * `/`, en `/en/privacy` retorna `/privacy`, etc. — locale-agnostic.
 *
 * Hrefs absolutos hard-nav:
 * - ES (default, no prefix): href = pathname.
 * - EN (prefix `/en`): href = '/en' o '/en' + pathname.
 */
export function LocaleToggle() {
  const t = useTranslations('Header');
  const locale = useLocale();
  const pathname = usePathname() || '/';

  const esHref = pathname; // ES default = no prefix
  const enHref = pathname === '/' ? '/en' : `/en${pathname}`;

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
