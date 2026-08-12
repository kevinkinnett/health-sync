import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  children,
  className = "",
  as: Element = "section",
  ...props
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">) {
  return (
    <Element
      {...props}
      className={`min-w-0 bg-surface-container rounded-2xl border border-outline-variant/10 ${className}`}
    >
      {children}
    </Element>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-headline text-lg font-semibold text-on-surface">{title}</h2>
        {description && (
          <p className="text-sm leading-relaxed text-on-surface-variant mt-1">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
