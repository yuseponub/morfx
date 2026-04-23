import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { LocaleToggle } from '@/components/marketing/locale-toggle';

export async function Header() {
  const t = await getTranslations('Header');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--ink-2)] bg-[var(--paper-0)]">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="MORFX">
          <Image
            src="/logo-light.png"
            alt="MORFX"
            width={85}
            height={32}
            className="block h-8 w-auto"
            priority
          />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <LocaleToggle />
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden h-auto px-[12px] py-[8px] text-[13px] font-medium text-[var(--ink-2)] hover:bg-transparent hover:text-[var(--ink-1)] sm:inline-flex"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Link href="/login">{t('login')}</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="h-auto gap-1.5 rounded-[4px] border border-[var(--ink-1)] bg-[var(--ink-1)] px-[16px] py-[8px] text-[13px] font-semibold text-[var(--paper-0)] hover:bg-[var(--ink-2)] active:translate-y-px"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <a
              href="https://wa.me/573137549286"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('contactSales')}
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
