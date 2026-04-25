import { getTranslations } from 'next-intl/server';

/**
 * Manifest strip — "Nuestra tesis" editorial callout con dashed borders + headline rubric-em.
 *
 * El headline tiene la palabra "sistema" (ES) o "system" (EN) marcada con <em rubric-2>.
 * Para preservar el énfasis sin codificar HTML en el JSON, usamos t.rich con el placeholder
 * <em>...</em>. El resto del headline viene en headlineLead (antes del em) y headlineTail
 * (después del em).
 */
export async function Manifest() {
  const t = await getTranslations('Landing.Manifest');

  return (
    <section
      className="relative border-b border-[var(--ink-1)]"
      style={{ padding: '72px 0', background: 'var(--paper-2)' }}
    >
      {/* Dashed top border */}
      <div
        aria-hidden
        className="absolute left-0 right-0"
        style={{
          top: '-2px',
          height: '4px',
          background:
            'repeating-linear-gradient(90deg, var(--ink-1) 0 8px, transparent 8px 16px)',
        }}
      />
      {/* Dashed bottom border */}
      <div
        aria-hidden
        className="absolute left-0 right-0"
        style={{
          bottom: '-2px',
          height: '4px',
          background:
            'repeating-linear-gradient(90deg, var(--ink-1) 0 8px, transparent 8px 16px)',
        }}
      />

      <div className="mx-auto max-w-[920px] px-8 text-center">
        <p
          className="text-[11px] font-bold uppercase"
          style={{
            fontFamily: 'var(--font-sans)',
            letterSpacing: '0.2em',
            color: 'var(--rubric-2)',
          }}
        >
          {t('eyebrow')}
        </p>
        <h2
          className="mt-[14px] text-[var(--ink-1)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(32px, 4vw, 44px)',
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
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
            br: () => <br className="hidden md:inline" />,
          })}
        </h2>
      </div>
    </section>
  );
}
