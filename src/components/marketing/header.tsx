import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LocaleToggle } from '@/components/marketing/locale-toggle';

export async function Header() {
  const t = await getTranslations('Header');

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="MORFX">
          <Image
            src="/logo-light.png"
            alt="MORFX"
            width={85}
            height={32}
            className="block h-8 w-auto dark:hidden"
            priority
          />
          <Image
            src="/logo-dark.png"
            alt="MORFX"
            width={135}
            height={32}
            className="hidden h-8 w-auto dark:block"
            priority
          />
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <LocaleToggle />
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">{t('login')}</Link>
          </Button>
          <Button asChild size="sm">
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
