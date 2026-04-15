'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export function LocaleToggle() {
  const t = useTranslations('Header');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale = locale === 'es' ? 'en' : 'es';

  function switchLocale() {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={switchLocale}
      disabled={isPending}
      aria-label={t('localeToggleLabel')}
      className="font-mono text-xs tracking-wider"
    >
      <span className={locale === 'es' ? 'font-semibold' : 'text-muted-foreground'}>
        ES
      </span>
      <span className="text-muted-foreground mx-1">|</span>
      <span className={locale === 'en' ? 'font-semibold' : 'text-muted-foreground'}>
        EN
      </span>
    </Button>
  );
}
