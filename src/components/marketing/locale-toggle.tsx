'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleToggle() {
  const t = useTranslations('Header');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(nextLocale: 'es' | 'en') {
    if (nextLocale === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  const baseSpan =
    'px-[9px] py-[5px] transition-colors select-none';
  const activeSpan = 'bg-[var(--ink-1)] text-[var(--paper-0)]';
  const inactiveSpan = 'text-[var(--ink-3)] cursor-pointer hover:bg-[var(--paper-3)]';

  return (
    <div
      role="group"
      aria-label={t('localeToggleLabel')}
      aria-busy={isPending}
      className="inline-flex overflow-hidden rounded-[3px] border border-[var(--ink-1)] text-[11px] font-semibold"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <span
        className={`${baseSpan} ${locale === 'es' ? activeSpan : inactiveSpan}`}
        onClick={() => switchTo('es')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            switchTo('es');
          }
        }}
      >
        ES
      </span>
      <span
        className={`${baseSpan} ${locale === 'en' ? activeSpan : inactiveSpan}`}
        onClick={() => switchTo('en')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            switchTo('en');
          }
        }}
      >
        EN
      </span>
    </div>
  );
}
