import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MessageSquare } from 'lucide-react';

import { LocaleToggle } from '@/components/marketing/locale-toggle';

export async function Header() {
  const t = await getTranslations('Header');

  return (
    <header
      className="sticky top-0 z-40 w-full border-b border-[var(--ink-1)]"
      style={{ background: 'color-mix(in oklch, var(--paper-1) 92%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-8">
        {/* Wordmark morf·x (punto rubric-2) */}
        <Link href="/" className="inline-flex items-baseline no-underline" aria-label="MORFX">
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '30px',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              color: 'var(--ink-1)',
            }}
          >
            morf<b style={{ color: 'var(--rubric-2)', fontWeight: 800 }}>·</b>x
          </span>
        </Link>

        {/* Nav primary — hidden below md (matches mock responsive @960px) */}
        <nav className="hidden items-center gap-7 md:flex">
          <a
            href="#producto"
            className="border-b border-transparent py-1 text-[12px] font-medium uppercase text-[var(--ink-2)] no-underline hover:border-[var(--ink-1)] hover:text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.12em' }}
          >
            {t('navProducto')}
          </a>
          <a
            href="#como-funciona"
            className="border-b border-transparent py-1 text-[12px] font-medium uppercase text-[var(--ink-2)] no-underline hover:border-[var(--ink-1)] hover:text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.12em' }}
          >
            {t('navComoFunciona')}
          </a>
          <a
            href="#integraciones"
            className="border-b border-transparent py-1 text-[12px] font-medium uppercase text-[var(--ink-2)] no-underline hover:border-[var(--ink-1)] hover:text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.12em' }}
          >
            {t('navIntegraciones')}
          </a>
          <a
            href="#nosotros"
            className="border-b border-transparent py-1 text-[12px] font-medium uppercase text-[var(--ink-2)] no-underline hover:border-[var(--ink-1)] hover:text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-sans)', letterSpacing: '0.12em' }}
          >
            {t('navNosotros')}
          </a>
        </nav>

        {/* Right CTA cluster: locale + login ghost + primary rubric-2 */}
        <div className="flex items-center gap-[10px]">
          <LocaleToggle />

          {/* Login ghost — hidden on sm */}
          <Link
            href="/login"
            className="hidden rounded-[4px] border border-transparent bg-transparent px-[14px] py-[8px] text-[12px] font-semibold text-[var(--ink-1)] no-underline hover:bg-[var(--paper-3)] sm:inline-flex"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {t('login')}
          </Link>

          {/* Primary CTA — rubric-2 press pattern (D-LND-10 corregido) */}
          <a
            href="https://wa.me/573137549286"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-[7px] rounded-[4px] border border-[var(--rubric-1)] bg-[var(--rubric-2)] px-[14px] py-[8px] text-[13px] font-semibold text-[var(--paper-0)] no-underline hover:bg-[var(--rubric-1)] active:translate-y-px"
            style={{
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 1px 0 var(--rubric-1)',
            }}
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            {t('contactSales')}
          </a>
        </div>
      </div>
    </header>
  );
}
