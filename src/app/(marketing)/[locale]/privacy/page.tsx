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
    <div className="bg-[var(--paper-0)]">
      <article className="mx-auto w-full max-w-[64rem] px-6 py-16 md:px-8 md:py-24">
        {/* Page header */}
        <header className="mb-16 max-w-[42rem] space-y-5 border-b border-[var(--paper-4)] pb-10">
          <p
            className="mx-smallcaps text-[11px] tracking-[0.12em] text-[var(--rubric-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            MORFX S.A.S.
          </p>
          <h1 className="mx-display text-[2.5rem] leading-[1.02] tracking-[-0.02em] text-[var(--ink-1)] md:text-[3.5rem] lg:text-[4rem]">
            {t('pageTitle')}
          </h1>
          <p
            className="text-[12px] tracking-[0.02em] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {t('lastUpdated')}
          </p>
        </header>

        {preamble ? (
          <div className="mb-12 max-w-[42rem]">
            <p className="mx-body-long text-[1rem] leading-[1.7] text-[var(--ink-2)]">
              {preamble}
            </p>
          </div>
        ) : null}

        {/* TOC editorial */}
        <nav
          aria-label={t('toc')}
          className="mb-16 max-w-[42rem] border-l-2 border-[var(--ink-2)] bg-[var(--paper-1)] p-6"
        >
          <h2
            className="mx-smallcaps mb-4 text-[11px] tracking-[0.12em] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {t('toc')}
          </h2>
          <ol className="space-y-2">
            {sections.map(({ key, data }, idx) => (
              <li
                key={key}
                className="flex gap-3 text-[14px] leading-[1.6] text-[var(--ink-2)]"
              >
                <span
                  className="mx-marginalia shrink-0 text-[var(--ink-4)]"
                  aria-hidden
                >
                  {`§ ${idx + 1}`}
                </span>
                <a
                  href={`#${data.id}`}
                  className="underline-offset-[3px] hover:text-[var(--ink-1)] hover:underline"
                >
                  {data.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections with marginalia + ornaments */}
        <div className="space-y-16">
          {sections.map(({ key, data }, idx) => (
            <LegalSection
              key={key}
              id={data.id}
              sectionNumber={`§ ${idx + 1}`}
              heading={data.heading}
              paragraphs={data.paragraphs}
              bullets={data.bullets}
              subsections={data.subsections}
              showOrnament={idx < sections.length - 1}
            />
          ))}
        </div>

        {/* Footer nav */}
        <footer className="mt-20 flex flex-col gap-4 border-t border-[var(--paper-4)] pt-8 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <LocaleLink
            href="/terms"
            className="text-[var(--ink-2)] underline-offset-[3px] hover:text-[var(--ink-1)] hover:underline"
          >
            {t('seeTerms')}
          </LocaleLink>
          <LocaleLink
            href="/"
            className="text-[var(--ink-2)] underline-offset-[3px] hover:text-[var(--ink-1)] hover:underline"
          >
            {t('backToLanding')}
          </LocaleLink>
        </footer>
      </article>
    </div>
  );
}
