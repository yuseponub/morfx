import type { ReactNode } from 'react';

export interface LegalSubsection {
  id?: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
}

export interface LegalSectionProps {
  id: string;
  heading: string;
  sectionNumber?: string;
  subtitle?: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
  showOrnament?: boolean;
  children?: ReactNode;
}

function Paragraphs({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-4">
      {items.map((p, i) => (
        <p
          key={i}
          className="mx-body-long text-[1rem] leading-[1.7] text-[var(--ink-2)]"
        >
          {p}
        </p>
      ))}
    </div>
  );
}

function Bullets({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="mx-body-long list-disc space-y-2 pl-6 text-[1rem] leading-[1.7] text-[var(--ink-2)] marker:text-[var(--ink-4)]">
      {items.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

function Subsection({
  sub,
  level,
}: {
  sub: LegalSubsection;
  level: number;
}) {
  // level 0 -> h3 (mx-h3), level 1+ -> h4 en smallcaps (editorial pattern)
  const HeadingTag = level === 0 ? 'h3' : 'h4';
  const headingClass =
    level === 0
      ? 'mx-h3 text-[1.25rem] md:text-[1.375rem] text-[var(--ink-1)]'
      : 'mx-smallcaps text-[12px] tracking-[0.12em] text-[var(--ink-2)]';
  return (
    <div id={sub.id} className="scroll-mt-24 space-y-4">
      <HeadingTag className={headingClass}>{sub.heading}</HeadingTag>
      <Paragraphs items={sub.paragraphs} />
      <Bullets items={sub.bullets} />
      {sub.subsections && sub.subsections.length > 0 ? (
        <div className="space-y-5 border-l border-[var(--paper-4)] pt-1 pl-4">
          {sub.subsections.map((child, idx) => (
            <Subsection
              key={child.id ?? idx}
              sub={child}
              level={level + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LegalSection({
  id,
  heading,
  sectionNumber,
  subtitle,
  paragraphs,
  bullets,
  subsections,
  showOrnament = true,
  children,
}: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="grid grid-cols-[1fr] gap-6 md:grid-cols-[6rem_1fr] md:gap-10">
        {/* Marginalia column (md+): section number in italic serif */}
        {sectionNumber ? (
          <aside
            aria-hidden
            className="mx-marginalia sticky top-24 hidden self-start pt-1 text-right text-[var(--ink-3)] md:block"
          >
            {sectionNumber}
          </aside>
        ) : (
          <div aria-hidden className="hidden md:block" />
        )}

        <div className="space-y-5">
          {/* Title + optional subtitle */}
          <header className="space-y-2">
            <h2 className="mx-h2 text-[1.5rem] text-[var(--ink-1)] md:text-[1.875rem]">
              {heading}
            </h2>
            {subtitle ? (
              <p className="mx-smallcaps text-[11px] tracking-[0.12em] text-[var(--ink-3)]">
                {subtitle}
              </p>
            ) : null}
          </header>

          {/* Body */}
          <div className="max-w-[42rem] space-y-4">
            <Paragraphs items={paragraphs} />
            <Bullets items={bullets} />
            {subsections && subsections.length > 0 ? (
              <div className="space-y-8 pt-2">
                {subsections.map((sub, idx) => (
                  <Subsection key={sub.id ?? idx} sub={sub} level={0} />
                ))}
              </div>
            ) : null}
            {children}
          </div>
        </div>
      </div>

      {/* Rule ornament between sections */}
      {showOrnament ? (
        <div className="mt-10 mb-2 flex justify-center">
          <span className="mx-smallcaps text-[12px] tracking-[0.12em] text-[var(--ink-4)]">
            — ❦ —
          </span>
        </div>
      ) : null}
    </section>
  );
}
