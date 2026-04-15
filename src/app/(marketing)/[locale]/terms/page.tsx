import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Link as LocaleLink } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  LegalSection,
  type LegalSubsection,
} from '@/components/marketing/legal/legal-section';

const SECTION_KEYS = [
  'section1',
  'section2',
  'section3',
  'section4',
  'section5',
  'section6',
  'section9',
  'section10',
  'section11',
  'section12',
  'section13',
  'section14',
  'section15',
  'section16',
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
      ? 'Términos y Condiciones — MORFX'
      : 'Terms of Service — MORFX',
    description: isEs
      ? 'Términos y Condiciones del Servicio de MORFX S.A.S. — Plataforma de agente conversacional con IA para e-commerce.'
      : 'MORFX S.A.S. Terms of Service — AI conversational agent platform for e-commerce.',
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Terms');

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
          href="/privacy"
          className="text-foreground/80 hover:text-foreground hover:underline"
        >
          {t('seePrivacy')}
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
