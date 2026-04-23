import { getTranslations } from 'next-intl/server';

export async function About() {
  const t = await getTranslations('Landing.About');

  const dataItems: Array<{ label: string; value: string }> = [
    { label: t('dataLegalName'), value: 'MORFX S.A.S.' },
    { label: t('dataNIT'), value: '902.052.328-5' },
    { label: t('dataCity'), value: 'Bucaramanga, Santander, Colombia' },
    { label: t('dataFounded'), value: t('dataFoundedValue') },
    { label: t('dataCIIU'), value: '6201' },
    { label: t('dataLegalRep'), value: 'Jose Mario Romero Rincon' },
  ];

  return (
    <section
      id="about"
      className="border-b border-[var(--ink-2)] bg-[var(--paper-0)] py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 flex justify-center">
          <span className="mx-smallcaps text-[12px] tracking-[0.12em] text-[var(--ink-3)]">
            — ❦ —
          </span>
        </div>

        <div className="mb-12 max-w-3xl">
          <span className="mx-smallcaps text-[12px] tracking-[0.12em] text-[var(--rubric-2)]">
            {t('eyebrow')}
          </span>
          <h2 className="mx-h1 mt-3 text-[2rem] text-[var(--ink-1)] sm:text-[2.5rem] md:text-[2.75rem]">
            {t('heading')}
          </h2>
          <p className="mx-body-long mt-6 text-[1rem] leading-[1.7] text-[var(--ink-2)] md:text-[1.125rem]">
            {t('intro')}
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <h3 className="mx-smallcaps text-[11px] tracking-[0.12em] text-[var(--ink-3)]">
              {t('objetoSocialLabel')}
            </h3>
            <blockquote className="mx-body-long mt-4 border-l-2 border-[var(--rubric-2)] pl-4 text-[0.9375rem] leading-[1.7] text-[var(--ink-1)] italic md:text-[1rem]">
              &ldquo;{t('objetoSocial')}&rdquo;
            </blockquote>
            <p
              className="mt-4 font-mono text-[11px] tracking-[0.02em] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {t('objetoSocialSource')}
            </p>
          </div>

          <div>
            <h3 className="mx-smallcaps text-[11px] tracking-[0.12em] text-[var(--ink-3)]">
              {t('legalDataLabel')}
            </h3>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {dataItems.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <dt className="mx-smallcaps text-[10px] tracking-[0.12em] text-[var(--ink-4)]">
                    {item.label}
                  </dt>
                  <dd
                    className="mt-1 font-mono text-[13px] font-medium tracking-[0.02em] text-[var(--ink-1)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
