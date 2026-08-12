import type { ReactNode } from "react";
import { SidePanelDialog } from "../ui/SidePanelDialog";

interface DossierDialogProps {
  title: string;
  subtitle?: string;
  metadata?: string;
  actions?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

/** Accessible modal shell for the dossier's right-side drawer. */
export function DossierDialog({
  title,
  subtitle,
  metadata,
  actions,
  children,
  onClose,
}: DossierDialogProps) {
  return (
    <SidePanelDialog
      title={title}
      subtitle={subtitle}
      metadata={metadata}
      actions={actions}
      closeLabel="Close dossier"
      onClose={onClose}
    >
      {children}
    </SidePanelDialog>
  );
}
