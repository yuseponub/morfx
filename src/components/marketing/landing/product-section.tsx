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
      className="border-b border-[var(--ink-2)] bg-[var(--paper-0)] py-20 md:py-24 odd:bg-[var(--paper-1)]"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div
          className={`grid gap-12 md:grid-cols-2 md:gap-16 md:items-center ${
            reverse ? 'md:[&>*:first-child]:order-2' : ''
          }`}
        >
          <div>
            <div className="mb-5 inline-flex size-12 items-center justify-center rounded-[6px] border border-[var(--paper-4)] bg-[var(--paper-0)]">
              <Icon
                className="size-6 text-[var(--ink-1)]"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <h2 className="mx-h1 text-[2rem] text-[var(--ink-1)] sm:text-[2.5rem] md:text-[2.75rem]">
              {t('heading')}
            </h2>
            <p className="mx-body-long mt-5 text-[1rem] leading-[1.7] text-[var(--ink-2)] md:text-[1.125rem]">
              {t('description')}
            </p>
            <ul className="mt-8 space-y-3">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] border border-[var(--ink-3)] text-[var(--ink-1)]">
                    <Check className="size-3" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="mx-body text-[0.9375rem] text-[var(--ink-2)] md:text-[1rem]">
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Card className="relative aspect-[4/3] items-center justify-center overflow-hidden rounded-[6px] border border-[var(--paper-4)] bg-[var(--paper-2)] p-8 shadow-none">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <Icon
                  className="size-16 text-[var(--ink-2)]"
                  strokeWidth={1.25}
                  aria-hidden
                />
                <span
                  className="mx-smallcaps text-[11px] tracking-[0.12em] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
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
