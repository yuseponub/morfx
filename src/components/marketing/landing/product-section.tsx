import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  Bot,
  MessageSquare,
  Plug,
  Smartphone,
  Zap,
  Check,
  type LucideIcon,
} from 'lucide-react';

type IconKey =
  | 'MessageSquare'
  | 'Bot'
  | 'Zap'
  | 'Plug'
  | 'Smartphone';

const iconMap: Record<IconKey, LucideIcon> = {
  MessageSquare,
  Bot,
  Zap,
  Plug,
  Smartphone,
};

type ProductSectionProps = {
  id: string;
  namespace:
    | 'Landing.CRM'
    | 'Landing.Agents'
    | 'Landing.Automations'
    | 'Landing.Integrations'
    | 'Landing.Multichannel';
  icon: IconKey;
  reverse?: boolean;
};

export async function ProductSection({
  id,
  namespace,
  icon,
  reverse = false,
}: ProductSectionProps) {
  const t = await getTranslations(namespace);
  const Icon = iconMap[icon];

  const bullets = [
    t('bullet1'),
    t('bullet2'),
    t('bullet3'),
    t('bullet4'),
  ];

  return (
    <section
      id={id}
      className="border-b border-border/60 bg-background py-20 md:py-24 odd:bg-muted/20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div
          className={`grid gap-12 md:grid-cols-2 md:gap-16 md:items-center ${
            reverse ? 'md:[&>*:first-child]:order-2' : ''
          }`}
        >
          <div>
            <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
              <Icon className="size-6 text-primary" aria-hidden />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t('heading')}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground md:text-lg">
              {t('description')}
            </p>
            <ul className="mt-8 space-y-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  <span className="text-sm text-foreground/90 md:text-base">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Card className="relative aspect-[4/3] items-center justify-center overflow-hidden border-border/80 bg-gradient-to-br from-muted/40 via-background to-muted/20 p-8 shadow-sm">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <Icon className="size-16 text-primary/70" aria-hidden />
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('illustrationLabel')}
                </span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
