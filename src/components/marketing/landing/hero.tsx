import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, MessageSquare } from 'lucide-react';

const WA_URL = 'https://wa.me/573137549286';

export async function Hero() {
  const t = await getTranslations('Landing.Hero');

  return (
    <section className="relative overflow-hidden border-b border-[var(--ink-2)] bg-[var(--paper-0)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 text-center md:items-start md:py-32 md:text-left">
        <span className="mx-smallcaps mb-6 text-[12px] tracking-[0.12em] text-[var(--rubric-2)]">
          {t('badge')}
        </span>
        <h1 className="mx-display max-w-3xl text-[3rem] font-[800] leading-[0.95] tracking-[-0.02em] text-[var(--ink-1)] sm:text-[4rem] md:text-[5.5rem] lg:text-[6rem]">
          {t('headline')}
        </h1>
        <div
          className="my-8 h-px w-20 bg-[var(--ink-1)]"
          aria-hidden
        />
        <p className="mx-body-long max-w-2xl text-[1.125rem] text-[var(--ink-2)] md:text-[1.25rem]">
          {t('subhead')}
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row md:items-start">
          <Button
            asChild
            size="lg"
            className="h-auto min-w-[200px] gap-1.5 rounded-[4px] border border-[var(--ink-1)] bg-[var(--ink-1)] px-[16px] py-[10px] text-[13px] font-semibold text-[var(--paper-0)] hover:bg-[var(--ink-2)] active:translate-y-px"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('primaryCTA')}
            >
              <MessageSquare className="size-4" />
              {t('primaryCTA')}
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-auto min-w-[160px] rounded-[4px] border border-[var(--ink-1)] bg-transparent px-[16px] py-[10px] text-[13px] font-semibold text-[var(--ink-1)] hover:bg-[var(--paper-1)] active:translate-y-px"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Link href="/login">{t('secondaryCTA')}</Link>
          </Button>
        </div>
        <p className="mx-caption mt-5 text-[var(--ink-3)]">{t('responseTag')}</p>
      </div>
    </section>
  );
}
