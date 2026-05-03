import type { ReactNode } from "react";

/**
 * Style tokens for the analytics tables. Exported so the per-metric
 * screens that wrap {@link DataTable} can reuse the exact same row
 * and cell classnames without re-declaring them.
 */
export const thClass =
  "text-left py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider";
export const thRightClass =
  "text-right py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider";
export const tdClass = "py-3 px-6 text-on-surface tabular-nums";
export const tdRightClass = "text-right py-3 px-6 text-on-surface-variant tabular-nums";
export const trClass =
  "border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors";
export const trHeadClass =
  "bg-surface-container-low border-b border-outline-variant/10";

/**
 * Standard analytics-tab table card with a title bar.
 *
 * The first header is left-aligned (intended for the date column);
 * the rest are right-aligned for tabular numbers.
 */
export function DataTable({
  title,
  headers,
  children,
}: {
  title: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="bg-surface-container rounded-xl overflow-hidden">
      <div className="p-6">
        <h3 className="font-headline font-semibold text-lg text-on-surface">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={trHeadClass}>
              <th className={thClass}>{headers[0]}</th>
              {headers.slice(1).map((h) => (
                <th key={h} className={thRightClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
