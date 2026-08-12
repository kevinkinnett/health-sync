import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "panel" | "inset" | "elevated" | "outlined";

const variants: Record<CardVariant, string> = {
  panel: "rounded-2xl bg-surface-container",
  inset: "rounded-xl bg-surface-container-low",
  elevated: "rounded-2xl bg-surface-container-high shadow-xl shadow-black/15",
  outlined: "rounded-2xl border border-outline-variant/55 bg-surface-container",
};

export function Card({
  children,
  className = "",
  as: Element = "section",
  variant = "panel",
  ...props
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  variant?: CardVariant;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "className">) {
  return (
    <Element
      {...props}
      className={`min-w-0 ${variants[variant]} ${className}`}
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
