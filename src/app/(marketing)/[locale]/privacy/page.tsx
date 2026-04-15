import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link as LocaleLink } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  LegalSection,
  type LegalSubsection,
} from '@/components/marketing/legal/legal-section';

const SECTION_KEYS = [
  'section7',
  'section8',
  'sectionContact',
  'sectionEffective',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

interface SectionData {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEs = locale === 'es';
  return {
    title: isEs
      ? 'Política de Privacidad — MORFX'
      : 'Privacy Policy — MORFX',
    description: isEs
      ? 'Política de Privacidad y Tratamiento de Datos Personales de MORFX S.A.S. conforme a la Ley 1581 de 2012.'
      : 'MORFX S.A.S. Privacy Policy and Personal Data Processing under Colombian Law 1581 of 2012.',
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Privacy');

  const sections: Array<{ key: SectionKey; data: SectionData }> =
    SECTION_KEYS.map((key) => ({
      key,
      data: t.raw(key) as SectionData,
    }));

  const preamble = (() => {
    try {
      return t('preamble');
    } catch {
      return '';
    }
  })();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-4 border-b border-border pb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-foreground/60">
          MORFX S.A.S.
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t('pageTitle')}
        </h1>
        <p className="text-sm text-foreground/60">{t('lastUpdated')}</p>
      </header>

      {preamble ? (
        <div className="pt-8">
          <p className="text-foreground/80 leading-relaxed">{preamble}</p>
        </div>
      ) : null}

      <nav
        aria-label={t('toc')}
        className="mt-10 rounded-lg border border-border bg-muted/30 p-6"
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground/70">
          {t('toc')}
        </h2>
        <ol className="space-y-2 text-sm">
          {sections.map(({ key, data }) => (
            <li key={key}>
              <a
                href={`#${data.id}`}
                className="text-foreground/80 hover:text-foreground hover:underline"
              >
                {data.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        {sections.map(({ key, data }) => (
          <LegalSection
            key={key}
            id={data.id}
            heading={data.heading}
            paragraphs={data.paragraphs}
            bullets={data.bullets}
            subsections={data.subsections}
          />
        ))}
      </div>

      <footer className="mt-16 flex flex-col gap-4 border-t border-border pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <LocaleLink
          href="/terms"
          className="text-foreground/80 hover:text-foreground hover:underline"
        >
          {t('seeTerms')}
        </LocaleLink>
        <LocaleLink
          href="/"
          className="text-foreground/80 hover:text-foreground hover:underline"
        >
          {t('backToLanding')}
        </LocaleLink>
      </footer>
    </div>
  );
}
