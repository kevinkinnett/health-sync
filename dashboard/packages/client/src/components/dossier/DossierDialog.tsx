import { useEffect, useId, useRef, type ReactNode } from "react";

interface DossierDialogProps {
  title: string;
  subtitle?: string;
  metadata?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Accessible modal shell for the dossier's right-side drawer. */
export function DossierDialog({
  title,
  subtitle,
  metadata,
  actions,
  children,
  onClose,
}: DossierDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const dialogElement = dialog;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const initialFocus = dialog.querySelector<HTMLElement>("[data-autofocus]");
    (initialFocus ?? dialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogElement.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
      />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-outline-variant/20 bg-surface-container-low shadow-2xl outline-none sm:w-[30rem] lg:w-[36rem]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant/15 p-5">
          <div className="min-w-0 flex-1">
            <p
              id={titleId}
              className="truncate font-headline text-xl font-bold text-on-surface"
            >
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                {subtitle}
              </p>
            )}
            {metadata && (
              <p className="mt-2 text-[10px] uppercase tracking-wider text-outline">
                {metadata}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button
              type="button"
              data-autofocus
              onClick={onClose}
              aria-label="Close dossier"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </>
  );
}
