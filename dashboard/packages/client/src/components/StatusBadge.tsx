const statusStyles: Record<string, string> = {
  completed: "bg-secondary/10 text-secondary",
  partial: "bg-tertiary/10 text-tertiary",
  running: "bg-primary/10 text-primary",
  failed: "bg-error/10 text-error",
};

export function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? "bg-surface-container-highest text-on-surface-variant";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${style}`}>
      {status}
    </span>
  );
}
