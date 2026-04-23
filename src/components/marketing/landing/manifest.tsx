/**
 * Manifest strip — "Nuestra tesis" editorial callout con dashed borders + headline rubric-em.
 *
 * Copy hardcoded español por D-LND-06 relajada (Plan 04). El mock v2.1 introduce esta sección
 * nueva que no existe en messages/*.json. i18n full pass queda para fase posterior.
 */
export function Manifest() {
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
          Nuestra tesis
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
          Un{' '}
          <em className="italic" style={{ color: 'var(--rubric-2)', fontStyle: 'italic' }}>
            sistema
          </em>{' '}
          para vender, responder y entregar.{' '}
          <br className="hidden md:inline" />
          No cinco herramientas pegadas con cinta.
        </h2>
      </div>
    </section>
  );
}
