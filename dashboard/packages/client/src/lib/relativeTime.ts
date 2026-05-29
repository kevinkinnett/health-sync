/**
 * Compact "N min/h/d ago" formatter shared by the dossier drawer,
 * the Settings page's Data Sources card, and any other surface that
 * shows a relative time.
 *
 * Previously two slightly-different implementations existed
 * (`Settings.tsx:formatRelativeAgo` accepted `null | undefined`,
 * `DossierDrawer.tsx:formatRelative` covered mo/y but only accepted
 * `string`). This unified version takes the wider input type AND
 * covers the full mo/y range — strictly more capable than either
 * caller's prior local version.
 */
export function formatRelativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "—";
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
