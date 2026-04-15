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
      className="border-b border-border/60 bg-background py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 max-w-3xl">
          <span className="text-sm font-semibold uppercase tracking-wider text-primary">
            {t('eyebrow')}
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('heading')}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground md:text-lg">
            {t('intro')}
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('objetoSocialLabel')}
            </h3>
            <blockquote className="mt-4 border-l-2 border-primary/60 pl-4 text-sm leading-relaxed text-foreground/90 md:text-base">
              &ldquo;{t('objetoSocial')}&rdquo;
            </blockquote>
            <p className="mt-4 text-xs text-muted-foreground">
              {t('objetoSocialSource')}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('legalDataLabel')}
            </h3>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              {dataItems.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
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
