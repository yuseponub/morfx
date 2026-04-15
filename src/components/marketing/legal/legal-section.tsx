import type { ReactNode } from 'react';

export interface LegalSubsection {
  id?: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
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
            <div
              key={sub.id ?? idx}
              id={sub.id}
              className="scroll-mt-24 space-y-4"
            >
              <h3 className="text-xl font-semibold tracking-tight text-foreground">
                {sub.heading}
              </h3>
              <Paragraphs items={sub.paragraphs} />
              <Bullets items={sub.bullets} />
            </div>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}
