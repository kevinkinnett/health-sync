import { useEffect, useState } from "react";
import type {
  DossierContent,
  DossierItemType,
  DossierSection,
  DossierSectionKey,
  DossierSource,
} from "@health-dashboard/shared";
import { useDossier, useRefreshDossier } from "../../api/queries";

/**
 * Controlled right-side drawer that shows / refreshes the LLM-built dossier
 * for a given supplement or medication. Render with `target=null` to close.
 *
 * The parent owns the open/close state; this component owns nothing other
 * than which sections are collapsed in the current session.
 */
export interface DossierDrawerTarget {
  type: DossierItemType;
  id: number;
  /** Display name for the header so we don't need to re-fetch the item. */
  itemName: string;
  itemBrand?: string | null;
  itemForm?: string | null;
}

interface DossierDrawerProps {
  target: DossierDrawerTarget | null;
  onClose: () => void;
}

/** Friendly fallbacks if the LLM omits or returns a weird heading. */
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

export function DossierDrawer({ target, onClose }: DossierDrawerProps) {
  // Don't render when closed — keeps state fully reset between openings.
  if (!target) return null;
  return <DossierDrawerInner target={target} onClose={onClose} />;
}

function DossierDrawerInner({
  target,
  onClose,
}: {
  target: DossierDrawerTarget;
  onClose: () => void;
}) {
  const { type, id, itemName, itemBrand, itemForm } = target;
  const dossier = useDossier(type, id);
  const refresh = useRefreshDossier();

  // Esc to close — feels native for a drawer.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleRefresh() {
    refresh.mutate({ type, id });
  }

  const entry = dossier.data ?? null;
  const refreshing = refresh.isPending;
  const refreshError = refresh.error;

  const subtitle = [itemBrand, itemForm].filter(Boolean).join(" · ");

  return (
    <>
      {/* Scrim */}
      <button
        aria-label="Close dossier"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label={`${itemName} dossier`}
        className="fixed right-0 top-0 z-50 h-screen w-full sm:w-[28rem] lg:w-[32rem] bg-surface-container-low border-l border-outline-variant/20 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-outline-variant/15">
          <div className="min-w-0 flex-1">
            <p className="font-headline font-bold text-on-surface text-lg truncate">
              {itemName}
            </p>
            {subtitle && (
              <p className="text-xs text-on-surface-variant truncate mt-0.5">
                {subtitle}
              </p>
            )}
            {entry && (
              <p className="text-[10px] text-outline uppercase tracking-wider mt-2">
                Cached {formatRelative(entry.fetchedAt)} · {entry.model}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {entry && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Rebuild dossier"
                aria-label="Refresh dossier"
                className="h-9 px-3 text-xs font-bold rounded-lg text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-base ${
                    refreshing ? "animate-spin" : ""
                  }`}
                >
                  refresh
                </span>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 flex items-center justify-center rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {dossier.isLoading ? (
            <DrawerLoading label="Loading cached dossier…" />
          ) : refreshing ? (
            <DrawerLoading label="Building dossier — this can take 30–60 seconds…" />
          ) : refreshError ? (
            <DrawerError
              message={refreshError.message}
              onRetry={handleRefresh}
            />
          ) : entry ? (
            <DossierBody content={entry.content} />
          ) : (
            <EmptyState onBuild={handleRefresh} />
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function EmptyState({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="p-8 text-center flex flex-col items-center gap-4">
      <span
        className="material-symbols-outlined text-outline"
        style={{ fontSize: 56 }}
      >
        menu_book
      </span>
      <div>
        <p className="font-headline font-semibold text-on-surface mb-1">
          No dossier yet
        </p>
        <p className="text-sm text-on-surface-variant max-w-xs">
          Build a structured reference covering mechanism, dosing, side
          effects, interactions, and brand-specific notes — sourced from
          authoritative health references.
        </p>
      </div>
      <button
        onClick={onBuild}
        className="mt-2 px-5 py-2 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-sm">auto_awesome</span>
        Build dossier
      </button>
      <p className="text-[10px] text-outline italic">Takes 30–60 seconds.</p>
    </div>
  );
}

function DrawerLoading({ label }: { label: string }) {
  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-on-surface-variant flex items-center gap-2">
        <span className="material-symbols-outlined text-base animate-spin text-primary">
          progress_activity
        </span>
        {label}
      </p>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-surface-container-high rounded-lg p-4 animate-pulse"
          >
            <div className="h-3 w-1/3 bg-surface-container-highest rounded mb-3" />
            <div className="h-2 w-full bg-surface-container-highest rounded mb-2" />
            <div className="h-2 w-4/5 bg-surface-container-highest rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="bg-error/10 border border-error/20 rounded-lg p-4">
        <p className="text-sm font-bold text-error mb-1">
          Couldn&rsquo;t build dossier
        </p>
        <p className="text-xs text-on-surface-variant break-words">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-xs font-bold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-sm">refresh</span>
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content rendering
// ---------------------------------------------------------------------------

function DossierBody({ content }: { content: DossierContent }) {
  return (
    <div className="p-5 space-y-5">
      <div>
        <p className="text-on-surface font-headline">{content.headline}</p>
        <p className="text-xs italic text-outline mt-2">{content.disclaimer}</p>
      </div>
      <div className="space-y-2">
        {content.sections.map((section, idx) => (
          <SectionBlock
            key={section.key}
            section={section}
            sources={content.sources}
            defaultOpen={idx === 0}
          />
        ))}
      </div>
      {content.sources.length > 0 && <SourcesList sources={content.sources} />}
    </div>
  );
}

function SectionBlock({
  section,
  sources,
  defaultOpen,
}: {
  section: DossierSection;
  sources: DossierSource[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading =
    section.heading?.trim() ||
    SECTION_HEADING_FALLBACK[section.key] ||
    section.key;

  return (
    <div className="bg-surface-container rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-container-high transition-colors"
      >
        <span className="font-headline font-semibold text-sm text-on-surface">
          {heading}
        </span>
        <span
          className={`material-symbols-outlined text-base text-outline transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-outline-variant/15 text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">
          {renderBody(section.body, sources)}
        </div>
      )}
    </div>
  );
}

function SourcesList({ sources }: { sources: DossierSource[] }) {
  return (
    <div className="pt-3 border-t border-outline-variant/15">
      <p className="text-[10px] text-outline uppercase tracking-wider font-bold mb-2">
        Sources
      </p>
      <ol className="space-y-2">
        {sources
          .slice()
          .sort((a, b) => a.id - b.id)
          .map((src) => (
            <li
              key={src.id}
              id={`dossier-source-${src.id}`}
              className="text-xs text-on-surface-variant"
            >
              <span className="text-outline mr-1">[{src.id}]</span>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {src.title}
              </a>
              {src.publisher && (
                <span className="text-outline"> — {src.publisher}</span>
              )}
              <span className="material-symbols-outlined text-[12px] align-middle text-outline ml-1">
                open_in_new
              </span>
            </li>
          ))}
      </ol>
    </div>
  );
}

/**
 * Render a section body with [N] citations linking to the matching source.
 * The split is deliberate: we don't trust LLM output to be markdown, we just
 * recognise the citation tokens we asked for.
 */
function renderBody(body: string, sources: DossierSource[]) {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  // Tokenize on [N] citations. Even indices are plain text, odd indices are
  // citation numbers as captured strings.
  const parts = body.split(/\[(\d+)\]/g);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 0) {
      out.push(part);
    } else {
      const num = Number(part);
      const src = sourceById.get(num);
      if (src) {
        out.push(
          <a
            key={`cite-${i}`}
            href={`#dossier-source-${num}`}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(`dossier-source-${num}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            title={src.title}
            className="inline-flex items-baseline align-baseline text-primary hover:underline mx-0.5"
          >
            <sup>[{num}]</sup>
          </a>,
        );
      } else {
        out.push(`[${part}]`);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
