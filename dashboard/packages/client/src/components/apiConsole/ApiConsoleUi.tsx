import { useEffect, useRef, useState, type ReactNode } from "react";

export function ConsoleSection({
  icon,
  title,
  description,
  children,
  className = "",
}: {
  icon: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container ${className}`}
    >
      <header className="border-b border-outline-variant/10 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-headline text-lg font-semibold text-on-surface">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            {icon}
          </span>
          {title}
        </h2>
        {description && <p className="mt-1 text-xs text-outline">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);

  function copy() {
    if (!navigator.clipboard) return;
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={`rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        copied
          ? "text-secondary"
          : "text-outline hover:bg-surface-container hover:text-primary"
      }`}
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        {copied ? "check" : "content_copy"}
      </span>
    </button>
  );
}

export function CodeBlock({ value, copyLabel }: { value: string; copyLabel: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto whitespace-pre rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-3 pr-12 font-mono text-xs text-on-surface-variant">
        {value}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

export function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-outline">
      {children}
    </div>
  );
}

export function ExternalLinkPanel({
  label,
  href,
  display,
}: {
  label: string;
  href: string;
  display: string;
}) {
  return (
    <div>
      <PanelLabel>{label}</PanelLabel>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center gap-1 rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-3 font-mono text-sm text-primary transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="truncate">{display}</span>
        <span className="material-symbols-outlined shrink-0 text-xs" aria-hidden="true">
          open_in_new
        </span>
      </a>
    </div>
  );
}

export function QueryMessage({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`p-6 text-sm ${error ? "text-error" : "text-outline"}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
