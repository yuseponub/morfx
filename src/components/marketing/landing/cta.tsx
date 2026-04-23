import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Mail, MessageSquare } from 'lucide-react';

const WA_URL = 'https://wa.me/573137549286';
const EMAIL = 'morfx.colombia@gmail.com';

export async function CTA() {
  const t = await getTranslations('Landing.CTA');

  return (
    <section className="border-t border-[var(--paper-4)] bg-[var(--paper-1)] py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <div className="mb-8 flex justify-center">
          <span className="mx-smallcaps text-[12px] tracking-[0.12em] text-[var(--ink-3)]">
            — ❦ —
          </span>
        </div>
        <h2 className="mx-display text-[2.5rem] leading-[1] text-[var(--ink-1)] sm:text-[3rem] md:text-[3.5rem] lg:text-[4rem]">
          {t('heading')}
        </h2>
        <p className="mx-body-long mx-auto mt-6 max-w-xl text-[1.0625rem] text-[var(--ink-2)] md:text-[1.125rem]">
          {t('description')}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-auto min-w-[220px] gap-1.5 rounded-[4px] border border-[var(--ink-1)] bg-[var(--ink-1)] px-[16px] py-[10px] text-[13px] font-semibold text-[var(--paper-0)] hover:bg-[var(--ink-2)] active:translate-y-px"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageSquare className="size-4" />
              {t('primaryButton')}
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-auto min-w-[220px] gap-1.5 rounded-[4px] border border-[var(--ink-1)] bg-transparent px-[16px] py-[10px] text-[13px] font-semibold text-[var(--ink-1)] hover:bg-[var(--paper-2)] active:translate-y-px"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <a href={`mailto:${EMAIL}`}>
              <Mail className="size-4" />
              {t('secondaryButton')}
            </a>
          </Button>
        </div>
        <p
          className="mx-caption mt-8 font-mono text-[12px] tracking-[0.02em] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('contactLine', { phone: '+57 313 754 9286', email: EMAIL })}
        </p>
      </div>
    </section>
  );
}
