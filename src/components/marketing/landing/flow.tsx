import { getTranslations } from 'next-intl/server';
import {
  MessageCircle,
  Package,
  ShoppingBag,
  Sparkles,
  Truck,
} from 'lucide-react';

/**
 * Flow diagram "Cómo funciona" — 3-col grid Origen → Núcleo → Destino.
 * Strings i18n via getTranslations('Landing.Flow').
 */
export async function Flow() {
  const t = await getTranslations('Landing.Flow');

  const sourceLabel = t('sources.label');
  const destLabel = t('destinations.label');

  return (
    <section
      id="como-funciona"
      className="border-b border-[var(--ink-1)]"
      style={{ padding: '96px 0', background: 'var(--paper-2)' }}
    >
      <div className="mx-auto max-w-[1200px] px-8">
        {/* Section head */}
        <div className="mb-[56px] grid items-end gap-8 md:grid-cols-[auto_1fr]">
          <div
            className="justify-self-start md:justify-self-auto"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--rubric-2)',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              borderLeft: '1px solid var(--rubric-2)',
              paddingLeft: '10px',
            }}
          >
            {t('sectionMarker')}
          </div>
          <div>
            <h2
              className="m-0"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(36px, 4.4vw, 52px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                textWrap: 'balance',
              }}
            >
              {t.rich('headline', {
                em: (chunks) => (
                  <em
                    className="italic"
                    style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}
                  >
                    {chunks}
                  </em>
                ),
              })}
            </h2>
            <p
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '17px',
                lineHeight: 1.55,
                color: 'var(--ink-3)',
                maxWidth: '520px',
                margin: '12px 0 0',
              }}
            >
              {t('description')}
            </p>
          </div>
        </div>

        {/* 3-col grid */}
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-3">
          {/* Origen */}
          <div className="flex flex-col gap-4">
            <FlowNode
              kind="src"
              icon={<ShoppingBag style={{ width: '18px', height: '18px' }} aria-hidden />}
              title={t('sources.shopify.title')}
              body={t('sources.shopify.body')}
              label={sourceLabel}
            />
            <FlowNode
              kind="src"
              icon={<MessageCircle style={{ width: '18px', height: '18px' }} aria-hidden />}
              title={t('sources.whatsapp.title')}
              body={t('sources.whatsapp.body')}
              label={sourceLabel}
            />
          </div>

          {/* Núcleo */}
          <div className="flex flex-col items-center justify-center gap-4">
            <HubNode
              label={t('hub.label')}
              titleLine1={t('hub.titleLine1')}
              titleLine2={t('hub.titleLine2')}
              body={t('hub.body')}
              bullets={t.raw('hub.bullets') as string[]}
            />
          </div>

          {/* Destino */}
          <div className="flex flex-col gap-4">
            <FlowNode
              kind="dst"
              icon={<Truck style={{ width: '18px', height: '18px' }} aria-hidden />}
              title={t('destinations.coordinadora.title')}
              body={t('destinations.coordinadora.body')}
              label={destLabel}
            />
            <FlowNode
              kind="dst"
              icon={<Package style={{ width: '18px', height: '18px' }} aria-hidden />}
              title={t('destinations.interRapidisimo.title')}
              body={t('destinations.interRapidisimo.body')}
              label={destLabel}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowNode({
  kind,
  icon,
  title,
  body,
  label,
}: {
  kind: 'src' | 'dst';
  icon: React.ReactNode;
  title: string;
  body: string;
  label: string;
}) {
  return (
    <div
      className="relative"
      style={{
        background: 'var(--paper-0)',
        border: '1px solid var(--ink-1)',
        padding: '20px',
        boxShadow:
          '0 1px 0 var(--ink-1), 0 8px 20px -12px oklch(0.3 0.04 60 / 0.28)',
      }}
    >
      {/* Label chip (::before) */}
      <span
        aria-hidden
        className="absolute"
        style={{
          top: '-8px',
          left: '16px',
          background: 'var(--paper-2)',
          padding: '0 8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        {label}
      </span>

      {/* Icon box */}
      <div
        className="grid place-items-center"
        style={{
          width: '36px',
          height: '36px',
          background: 'var(--paper-2)',
          border: '1px solid var(--ink-1)',
          marginBottom: '12px',
        }}
      >
        {icon}
      </div>

      <h4
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '20px',
          fontWeight: 700,
          margin: '0 0 6px',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h4>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '13px',
          lineHeight: 1.5,
          color: 'var(--ink-3)',
          margin: 0,
        }}
      >
        {body}
      </p>

      {/* kind prop reserved for future connectors (aria not affected) */}
      <span data-kind={kind} style={{ display: 'none' }} aria-hidden />
    </div>
  );
}

function HubNode({
  label,
  titleLine1,
  titleLine2,
  body,
  bullets,
}: {
  label: string;
  titleLine1: string;
  titleLine2: string;
  body: string;
  bullets: string[];
}) {
  return (
    <div
      className="relative"
      style={{
        background: 'var(--rubric-2)',
        color: 'var(--paper-0)',
        border: '1px solid var(--rubric-1)',
        padding: '32px 28px',
        boxShadow:
          '0 1px 0 var(--ink-1), 0 8px 20px -12px oklch(0.3 0.04 60 / 0.28)',
      }}
    >
      {/* Label chip — rubric-2 color */}
      <span
        aria-hidden
        className="absolute"
        style={{
          top: '-8px',
          left: '16px',
          background: 'var(--paper-2)',
          padding: '0 8px',
          fontFamily: 'var(--font-sans)',
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--rubric-2)',
        }}
      >
        {label}
      </span>

      {/* Icon box inverted */}
      <div
        className="grid place-items-center"
        style={{
          width: '36px',
          height: '36px',
          background: 'var(--paper-0)',
          color: 'var(--rubric-2)',
          border: '1px solid var(--rubric-1)',
          marginBottom: '12px',
        }}
      >
        <Sparkles style={{ width: '20px', height: '20px' }} aria-hidden />
      </div>

      <h4
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '28px',
          fontWeight: 700,
          margin: '0 0 6px',
          letterSpacing: '-0.01em',
        }}
      >
        {titleLine1}
        <br />
        {titleLine2}
      </h4>
      <p
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: '14px',
          lineHeight: 1.5,
          margin: 0,
          color: 'color-mix(in oklch, var(--paper-0) 88%, transparent)',
        }}
      >
        {body}
      </p>

      <ul
        className="list-none"
        style={{
          padding: 0,
          margin: '12px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {bullets.map((s) => (
          <li
            key={s}
            className="relative"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '11px',
              fontWeight: 500,
              paddingLeft: '18px',
              lineHeight: 1.4,
              color: 'color-mix(in oklch, var(--paper-0) 92%, transparent)',
            }}
          >
            <span aria-hidden className="absolute left-0">
              →
            </span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
