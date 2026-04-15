import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Mail, MessageSquare } from 'lucide-react';

const WA_URL = 'https://wa.me/573137549286';
const EMAIL = 'morfx.colombia@gmail.com';

export async function CTA() {
  const t = await getTranslations('Landing.CTA');

  return (
    <section className="bg-background py-20 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-2xl border border-border/80 bg-muted/40 px-8 py-16 text-center shadow-sm md:px-16">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('heading')}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            {t('description')}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-w-[220px]">
              <a
                href={WA_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageSquare className="size-4" />
                {t('primaryButton')}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-w-[220px]">
              <a href={`mailto:${EMAIL}`}>
                <Mail className="size-4" />
                {t('secondaryButton')}
              </a>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            {t('contactLine', { phone: '+57 313 754 9286', email: EMAIL })}
          </p>
        </div>
      </div>
    </section>
  );
}
