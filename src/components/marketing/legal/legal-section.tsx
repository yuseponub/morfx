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
  paragraphs?: string[];
  bullets?: string[];
  subsections?: LegalSubsection[];
  children?: ReactNode;
}

function Paragraphs({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-4">
      {items.map((p, i) => (
        <p key={i} className="text-foreground/80 leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}

function Bullets({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="list-disc space-y-2 pl-6 text-foreground/80 leading-relaxed marker:text-foreground/40">
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
  // level 0 -> h3, level 1+ -> h4
  const HeadingTag = level === 0 ? 'h3' : 'h4';
  const headingClass =
    level === 0
      ? 'text-xl font-semibold tracking-tight text-foreground'
      : 'text-base font-semibold tracking-tight text-foreground';
  return (
    <div id={sub.id} className="scroll-mt-24 space-y-4">
      <HeadingTag className={headingClass}>{sub.heading}</HeadingTag>
      <Paragraphs items={sub.paragraphs} />
      <Bullets items={sub.bullets} />
      {sub.subsections && sub.subsections.length > 0 ? (
        <div className="space-y-5 pt-1 pl-4 border-l border-border">
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
  paragraphs,
  bullets,
  subsections,
  children,
}: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {heading}
      </h2>
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
    </section>
  );
}
