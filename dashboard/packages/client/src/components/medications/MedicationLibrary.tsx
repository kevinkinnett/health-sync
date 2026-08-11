import { useState } from "react";
import type { MedicationItem } from "@health-dashboard/shared";
import {
  ArchivedItemRow,
  EditorActions,
  ItemFormFields,
  ItemSummaryCard,
  LibraryScaffold,
  type ItemFormConfig,
} from "../intake/ItemLibraryUi";
import {
  emptyItemForm,
  itemFormToPayload,
  itemToForm,
  validateItemForm,
  type IntakeItemFormState,
  type ItemFormErrors,
} from "../intake/itemForm";
import {
  DossierDrawer,
  type DossierDrawerTarget,
} from "../dossier/DossierDrawer";
import {
  useMedicationLibrary,
  type MedicationLibraryState,
} from "./useMedicationLibrary";

const FORM_CONFIG: ItemFormConfig = {
  namePlaceholder: "Lisinopril",
  brandPlaceholder: "Prinivil",
  formPlaceholder: "tablet",
  amountPlaceholder: "10",
  unitPlaceholder: "mg",
  notesPlaceholder: "e.g. once daily, with food",
  forms: [
    "tablet",
    "capsule",
    "liquid",
    "injection",
    "inhaler",
    "patch",
    "cream",
    "drops",
  ],
  units: ["mg", "mcg", "g", "mL", "tablet", "capsule", "puff", "drop"],
};

export function MedicationLibrary() {
  const library = useMedicationLibrary();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dossierTarget, setDossierTarget] =
    useState<DossierDrawerTarget | null>(null);
  const editingItem =
    library.active.find((item) => item.id === editingId) ?? null;

  const openDossier = (item: MedicationItem) => {
    setDossierTarget({
      type: "medication",
      id: item.id,
      itemName: item.name,
      itemBrand: item.brand,
      itemForm: item.form,
    });
  };

  return (
    <>
      <LibraryScaffold
        noun="medication"
        icon="prescriptions"
        activeCount={library.active.length}
        archivedCount={library.archived.length}
        adding={adding}
        showArchived={showArchived}
        isLoading={library.isLoading}
        error={library.loadError ?? library.mutationError}
        onAdd={() => {
          setEditingId(null);
          setAdding(true);
        }}
        onRetry={library.retry}
        onToggleArchived={() => setShowArchived((current) => !current)}
        editor={
          adding ? (
            <MedicationEditor
              library={library}
              onClose={() => setAdding(false)}
            />
          ) : editingItem ? (
            <MedicationEditor
              item={editingItem}
              library={library}
              onClose={() => setEditingId(null)}
              onOpenDossier={() => openDossier(editingItem)}
            />
          ) : undefined
        }
        activeItems={
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {library.active.map((item) => (
              <ItemSummaryCard
                key={item.id}
                item={item}
                icon="prescriptions"
                iconClass="text-tertiary"
                onEdit={() => {
                  setAdding(false);
                  setEditingId(item.id);
                }}
                onOpenDossier={() => openDossier(item)}
              />
            ))}
          </div>
        }
        archivedItems={library.archived.map((item) => (
          <ArchivedItemRow
            key={item.id}
            item={item}
            icon="prescriptions"
            restoring={library.updating}
            onRestore={() => {
              void library.restoreItem(item.id).catch(() => undefined);
            }}
          />
        ))}
      />

      <DossierDrawer
        target={dossierTarget}
        onClose={() => setDossierTarget(null)}
      />
    </>
  );
}

function MedicationEditor({
  item,
  library,
  onClose,
  onOpenDossier,
}: {
  item?: MedicationItem;
  library: MedicationLibraryState;
  onClose: () => void;
  onOpenDossier?: () => void;
}) {
  const [form, setForm] = useState<IntakeItemFormState>(() =>
    item ? itemToForm(item) : emptyItemForm(),
  );
  const [errors, setErrors] = useState<ItemFormErrors>({});

  const save = async () => {
    const nextErrors = validateItemForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      const body = itemFormToPayload(form);
      if (item) await library.updateItem(item.id, body);
      else await library.createItem(body);
      onClose();
    } catch {
      // React Query exposes the mutation error through the library scaffold.
    }
  };

  const archive = async () => {
    if (!item) return;
    try {
      await library.archiveItem(item.id);
      onClose();
    } catch {
      // React Query exposes the mutation error through the library scaffold.
    }
  };

  return (
    <section
      aria-label={item ? `Edit ${item.name}` : "Add medication"}
      className="bg-surface-container-high rounded-xl p-5 border border-primary/25 space-y-5"
    >
      <div>
        <h3 className="font-headline font-bold text-on-surface">
          {item ? `Edit ${item.name}` : "Add medication"}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Set the default dose used by quick logging. You can still change it
          when recording an intake.
        </p>
      </div>
      <ItemFormFields
        form={form}
        errors={errors}
        config={FORM_CONFIG}
        onChange={(next) => {
          setForm(next);
          setErrors({});
        }}
      />
      <EditorActions
        itemName={item?.name}
        saving={item ? library.updating : library.creating}
        archiving={library.archiving}
        onCancel={onClose}
        onSave={() => void save()}
        onArchive={item ? () => void archive() : undefined}
        onOpenDossier={onOpenDossier}
      />
    </section>
  );
}
