import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, MessageSquare } from 'lucide-react';

const WA_URL = 'https://wa.me/573137549286';

export async function Hero() {
  const t = await getTranslations('Landing.Hero');

  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 text-center md:items-start md:py-32 md:text-left">
        <span className="mb-6 inline-flex items-center rounded-full border border-border/80 bg-background px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('badge')}
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
          {t('headline')}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          {t('subhead')}
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row md:items-start">
          <Button asChild size="lg" className="min-w-[200px]">
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
          <Button asChild size="lg" variant="outline" className="min-w-[160px]">
            <Link href="/login">{t('secondaryCTA')}</Link>
          </Button>
        </div>
        <p className="mt-5 text-sm text-muted-foreground">{t('responseTag')}</p>
      </div>
    </section>
  );
}
