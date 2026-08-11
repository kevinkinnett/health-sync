import { useState } from "react";
import type {
  SupplementIngredient,
  SupplementItem,
  SupplementItemIngredient,
} from "@health-dashboard/shared";
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
import { formatAmount } from "../../lib/dose";
import {
  compositionToForm,
  newCompositionRow,
  validateCompositionRows,
  type CompositionRow,
} from "./supplementComposition";
import {
  useSupplementLibrary,
  type SupplementLibraryState,
} from "./useSupplementLibrary";

const inputClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";

const FORM_CONFIG: ItemFormConfig = {
  namePlaceholder: "Vitamin D3",
  brandPlaceholder: "Now Foods",
  formPlaceholder: "capsule",
  amountPlaceholder: "1000",
  unitPlaceholder: "IU",
  notesPlaceholder: "Optional details or timing guidance",
  forms: ["capsule", "tablet", "powder", "liquid", "softgel", "gummy"],
  units: ["mg", "g", "IU", "mcg", "mL", "capsule", "scoop", "drop"],
};

interface SupplementFormState extends IntakeItemFormState {
  composition: CompositionRow[];
}

export function SupplementLibrary() {
  const library = useSupplementLibrary();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dossierTarget, setDossierTarget] =
    useState<DossierDrawerTarget | null>(null);
  const editingItem =
    library.active.find((item) => item.id === editingId) ?? null;

  const openDossier = (item: SupplementItem) => {
    setDossierTarget({
      type: "supplement",
      id: item.id,
      itemName: item.name,
      itemBrand: item.brand,
      itemForm: item.form,
    });
  };

  return (
    <>
      <LibraryScaffold
        noun="supplement"
        icon="medication"
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
            <SupplementEditor
              library={library}
              onClose={() => setAdding(false)}
            />
          ) : editingItem ? (
            <SupplementEditor
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
                icon="medication"
                iconClass="text-primary"
                onEdit={() => {
                  setAdding(false);
                  setEditingId(item.id);
                }}
                onOpenDossier={() => openDossier(item)}
              >
                <CompositionPreview ingredients={item.ingredients} />
              </ItemSummaryCard>
            ))}
          </div>
        }
        archivedItems={library.archived.map((item) => (
          <ArchivedItemRow
            key={item.id}
            item={item}
            icon="medication"
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

function SupplementEditor({
  item,
  library,
  onClose,
  onOpenDossier,
}: {
  item?: SupplementItem;
  library: SupplementLibraryState;
  onClose: () => void;
  onOpenDossier?: () => void;
}) {
  const [form, setForm] = useState<SupplementFormState>(() => ({
    ...(item ? itemToForm(item) : emptyItemForm()),
    composition: item ? compositionToForm(item.ingredients) : [],
  }));
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [compositionError, setCompositionError] = useState<string | null>(null);

  const save = async () => {
    const nextErrors = validateItemForm(form);
    const nextCompositionError = validateCompositionRows(form.composition);
    setErrors(nextErrors);
    setCompositionError(nextCompositionError);
    if (Object.keys(nextErrors).length > 0 || nextCompositionError) return;

    try {
      const body = itemFormToPayload(form);
      if (item) {
        await library.updateItem(item.id, body, form.composition);
      } else {
        await library.createItem(body, form.composition);
      }
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

  const setBaseForm = (next: IntakeItemFormState) => {
    setForm({ ...next, composition: form.composition });
    setErrors({});
  };

  return (
    <section
      aria-label={item ? `Edit ${item.name}` : "Add supplement"}
      className="bg-surface-container-high rounded-xl p-5 border border-primary/25 space-y-5"
    >
      <div>
        <h3 className="font-headline font-bold text-on-surface">
          {item ? `Edit ${item.name}` : "Add supplement"}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          Define the default dose and, for blends, the ingredients delivered by
          that dose.
        </p>
      </div>
      <ItemFormFields
        form={form}
        errors={errors}
        config={FORM_CONFIG}
        onChange={setBaseForm}
      />
      <CompositionEditor
        rows={form.composition}
        catalog={library.ingredientCatalog}
        error={compositionError}
        onChange={(composition) => {
          setForm({ ...form, composition });
          setCompositionError(null);
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

function CompositionEditor({
  rows,
  catalog,
  error,
  onChange,
}: {
  rows: CompositionRow[];
  catalog: SupplementIngredient[];
  error: string | null;
  onChange: (next: CompositionRow[]) => void;
}) {
  const update = (index: number, patch: Partial<CompositionRow>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const syncIngredient = (index: number, name: string) => {
    const match = catalog.find(
      (ingredient) =>
        ingredient.name.toLowerCase() === name.trim().toLowerCase(),
    );
    update(index, { ingredientName: name, ingredientId: match?.id });
  };

  return (
    <fieldset className="border-t border-outline-variant/15 pt-4">
      <legend className="sr-only">Ingredients per default dose</legend>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <p className="text-xs text-on-surface font-bold">
          Ingredients per default dose ({rows.length})
        </p>
        <button
          type="button"
          onClick={() =>
            onChange([
              ...rows,
              newCompositionRow(rows[rows.length - 1]?.unit ?? "mg"),
            ])
          }
          className="text-xs text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold self-start"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
          Add ingredient
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-outline italic">
          Leave this empty for a single-substance item, or list every
          ingredient in a blend.
        </p>
      ) : (
        <div className="space-y-3">
          <datalist id="supplement-ingredient-catalog">
            {catalog.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.name} />
            ))}
          </datalist>
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto] gap-2 items-end bg-surface-container/60 sm:bg-transparent rounded-lg p-3 sm:p-0"
            >
              <label className="flex flex-col">
                <span className="text-[10px] text-outline sm:sr-only">Ingredient</span>
                <input
                  type="text"
                  list="supplement-ingredient-catalog"
                  value={row.ingredientName}
                  onChange={(event) => syncIngredient(index, event.target.value)}
                  placeholder="Ashwagandha"
                  aria-label={`Ingredient ${index + 1} name`}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] text-outline sm:sr-only">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={row.amount}
                  onChange={(event) => update(index, { amount: event.target.value })}
                  placeholder="300"
                  aria-label={`Ingredient ${index + 1} amount`}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] text-outline sm:sr-only">Unit</span>
                <input
                  type="text"
                  value={row.unit}
                  onChange={(event) => update(index, { unit: event.target.value })}
                  placeholder="mg"
                  aria-label={`Ingredient ${index + 1} unit`}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
                aria-label={`Remove ingredient ${index + 1}`}
                className="h-10 w-10 rounded-lg text-outline hover:text-error hover:bg-error/10 flex items-center justify-center"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-error mt-2">{error}</p>}
    </fieldset>
  );
}

function CompositionPreview({
  ingredients,
}: {
  ingredients: SupplementItemIngredient[];
}) {
  if (ingredients.length === 0) return <div className="flex-1" />;
  return (
    <div className="mt-3 pt-3 border-t border-outline-variant/15 flex-1">
      <p className="text-[10px] text-outline uppercase tracking-wider font-bold mb-1">
        Contains
      </p>
      <ul className="space-y-0.5">
        {ingredients.map((ingredient) => (
          <li
            key={ingredient.ingredientId}
            className="text-xs text-on-surface-variant tabular-nums flex items-baseline justify-between gap-2"
          >
            <span className="truncate">{ingredient.ingredientName}</span>
            <span className="text-outline whitespace-nowrap">
              {formatAmount(ingredient.amount)} {ingredient.unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
