import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">{eyebrow}</p>
        )}
        <h1 className="font-headline text-3xl sm:text-4xl font-bold tracking-tight text-on-surface">{title}</h1>
        {description && (
          <p className="text-base leading-relaxed text-on-surface-variant mt-2">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
