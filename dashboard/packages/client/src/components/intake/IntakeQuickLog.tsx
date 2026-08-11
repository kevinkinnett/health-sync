import type { ReactNode } from "react";
import { formatDose } from "../../lib/dose";
import type { IntakeLogItemBase } from "./logModel";
import { SectionError, SectionLoading } from "./IntakeSectionState";

export function QuickLogGrid<T extends IntakeLogItemBase>({
  noun,
  icon,
  iconClass,
  hoverClass,
  items,
  loading,
  error,
  onRetry,
  onSelect,
  renderBadge,
}: {
  noun: string;
  icon: string;
  iconClass: string;
  hoverClass: string;
  items: T[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (item: T) => void;
  renderBadge?: (item: T) => ReactNode;
}) {
  return (
    <section className="bg-surface-container rounded-xl p-4 sm:p-5 border border-outline-variant/10">
      <h2 className="font-headline text-lg font-semibold text-on-surface mb-4">
        Quick log
      </h2>
      {loading ? (
        <SectionLoading label={`Loading ${noun}s…`} />
      ) : error ? (
        <SectionError
          message={error}
          actionLabel={`Retry loading ${noun}s`}
          onRetry={onRetry}
        />
      ) : items.length === 0 ? (
        <p className="text-on-surface-variant text-sm">
          No {noun}s yet. Add one in the Library tab before logging a dose.
        </p>
      ) : (
        <div className="grid grid-cols-1 min-[28rem]:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              aria-label={`Quick log ${item.name}`}
              className={`min-h-32 bg-surface-container-high ${hoverClass} rounded-xl p-4 text-left transition-colors group focus:outline-none focus:ring-2 focus:ring-primary/40`}
            >
              <span
                className={`material-symbols-outlined ${iconClass} mb-2 block group-hover:scale-110 transition-transform`}
                style={{ fontVariationSettings: "'FILL' 1", fontSize: 28 }}
                aria-hidden="true"
              >
                {icon}
              </span>
              <span className="font-headline font-semibold text-on-surface truncate block">
                {item.name}
              </span>
              <span className="text-xs text-on-surface-variant tabular-nums block">
                {formatDose(item.defaultAmount, item.defaultUnit)}
              </span>
              {item.brand && (
                <span className="text-[10px] text-outline uppercase tracking-wider mt-1 truncate block">
                  {item.brand}
                </span>
              )}
              {renderBadge?.(item)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
