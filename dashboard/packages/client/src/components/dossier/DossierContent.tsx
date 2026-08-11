import { useState, type ReactNode } from "react";
import type {
  DossierContent as DossierContentValue,
  DossierSection,
  DossierSectionKey,
  DossierSource,
} from "@health-dashboard/shared";
import { parseDossierBody, sourceHost } from "./dossierContentModel";

const SECTION_HEADING_FALLBACK: Record<DossierSectionKey, string> = {
  summary: "Summary",
  activeIngredients: "Active ingredients",
  mechanism: "How it works",
  indications: "Common uses",
  dosing: "Typical dosing",
  sideEffects: "Side effects",
  interactions: "Interactions",
  brandNotes: "Brand notes",
  quality: "Quality",
};

const IMPORTANT_SECTION_KEYS = new Set<DossierSectionKey>([
  "summary",
  "dosing",
  "sideEffects",
  "interactions",
]);

const SAFETY_SECTION_KEYS = new Set<DossierSectionKey>([
  "sideEffects",
  "interactions",
]);

export function DossierContent({ content }: { content: DossierContentValue }) {
  return (
    <article className="space-y-6 p-5">
      <header className="rounded-xl border border-outline-variant/10 bg-surface-container px-4 py-4">
        <p className="font-headline text-lg font-semibold leading-snug text-on-surface">
          {content.headline}
        </p>
        <p className="mt-2 text-xs italic leading-relaxed text-outline">
          {content.disclaimer}
        </p>
      </header>

      <div className="space-y-3">
        {content.sections.map((section) => (
          <DossierSectionBlock
            key={section.key}
            section={section}
            sources={content.sources}
            defaultOpen={IMPORTANT_SECTION_KEYS.has(section.key)}
          />
        ))}
      </div>

      {content.sources.length > 0 && <DossierSources sources={content.sources} />}
    </article>
  );
}

function DossierSectionBlock({
  section,
  sources,
  defaultOpen,
}: {
  section: DossierSection;
  sources: DossierSource[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = section.heading?.trim() || SECTION_HEADING_FALLBACK[section.key];
  const safety = SAFETY_SECTION_KEYS.has(section.key);

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-surface-container ${
        safety ? "border-tertiary/30" : "border-outline-variant/10"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2">
          {safety && (
            <span className="material-symbols-outlined text-base text-tertiary" aria-hidden="true">
              health_and_safety
            </span>
          )}
          <span className="font-headline text-sm font-semibold text-on-surface">
            {heading}
          </span>
        </span>
        <span
          className={`material-symbols-outlined text-base text-outline transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="border-t border-outline-variant/15 px-4 pb-4 pt-3 text-sm leading-relaxed text-on-surface-variant whitespace-pre-wrap">
          <DossierBodyText body={section.body} sources={sources} />
        </div>
      )}
    </section>
  );
}

function DossierBodyText({
  body,
  sources,
}: {
  body: string;
  sources: DossierSource[];
}) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const output: ReactNode[] = [];

  parseDossierBody(body).forEach((segment, segmentIndex) => {
    if (segment.kind === "text") {
      output.push(segment.value);
      return;
    }

    output.push(
      <sup key={`citations-${segmentIndex}`} className="mx-0.5 whitespace-nowrap">
        [
        {segment.ids.map((id, idIndex) => {
          const source = sourceById.get(id);
          return (
            <span key={`${id}-${idIndex}`}>
              {idIndex > 0 && ", "}
              {source ? (
                <a
                  href={`#dossier-source-${id}`}
                  onClick={(event) => focusSource(event, id)}
                  title={source.title}
                  className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {id}
                </a>
              ) : (
                id
              )}
            </span>
          );
        })}
        ]
      </sup>,
    );
  });

  return output;
}

function focusSource(event: React.MouseEvent<HTMLAnchorElement>, id: number) {
  event.preventDefault();
  const source = document.getElementById(`dossier-source-${id}`);
  source?.scrollIntoView({ behavior: "smooth", block: "center" });
  source?.focus({ preventScroll: true });
}

function DossierSources({ sources }: { sources: DossierSource[] }) {
  return (
    <section className="border-t border-outline-variant/15 pt-5" aria-labelledby="dossier-sources-heading">
      <h2
        id="dossier-sources-heading"
        className="mb-3 text-[10px] font-bold uppercase tracking-wider text-outline"
      >
        Sources
      </h2>
      <ol className="space-y-2">
        {[...sources]
          .sort((left, right) => left.id - right.id)
          .map((source) => (
            <li
              key={source.id}
              id={`dossier-source-${source.id}`}
              tabIndex={-1}
              className="grid grid-cols-[auto_1fr] gap-2 rounded-lg px-2 py-2 text-xs text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <span className="text-outline">[{source.id}]</span>
              <div className="min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {source.title}
                  <span className="material-symbols-outlined ml-1 align-middle text-[12px] text-outline" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
                <p className="mt-0.5 truncate text-[11px] text-outline">
                  {source.publisher || sourceHost(source.url)}
                </p>
              </div>
            </li>
          ))}
      </ol>
    </section>
  );
}
