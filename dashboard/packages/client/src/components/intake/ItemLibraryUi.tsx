import { useId, useState, type ReactNode } from "react";
import { formatAmount } from "../../lib/dose";
import type {
  IntakeItemBase,
  IntakeItemFormState,
  ItemFormErrors,
} from "./itemForm";

const inputClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";
const labelClass =
  "text-[10px] text-outline uppercase tracking-wider font-bold mb-1 block";

export interface ItemFormConfig {
  namePlaceholder: string;
  brandPlaceholder: string;
  formPlaceholder: string;
  amountPlaceholder: string;
  unitPlaceholder: string;
  notesPlaceholder: string;
  forms: string[];
  units: string[];
}

export function ItemFormFields({
  form,
  errors,
  config,
  onChange,
}: {
  form: IntakeItemFormState;
  errors: ItemFormErrors;
  config: ItemFormConfig;
  onChange: (next: IntakeItemFormState) => void;
}) {
  const formListId = useId();
  const unitListId = useId();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField label="Name" required error={errors.name}>
        <input
          type="text"
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          placeholder={config.namePlaceholder}
          aria-invalid={Boolean(errors.name)}
          className={inputClass}
        />
      </FormField>
      <FormField label="Brand">
        <input
          type="text"
          value={form.brand}
          onChange={(event) => onChange({ ...form, brand: event.target.value })}
          placeholder={config.brandPlaceholder}
          className={inputClass}
        />
      </FormField>
      <FormField label="Form">
        <input
          type="text"
          list={formListId}
          value={form.form}
          onChange={(event) => onChange({ ...form, form: event.target.value })}
          placeholder={config.formPlaceholder}
          className={inputClass}
        />
        <datalist id={formListId}>
          {config.forms.map((formName) => (
            <option key={formName} value={formName} />
          ))}
        </datalist>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Default amount" error={errors.defaultAmount}>
          <input
            type="number"
            min="0"
            step="0.001"
            value={form.defaultAmount}
            onChange={(event) =>
              onChange({ ...form, defaultAmount: event.target.value })
            }
            placeholder={config.amountPlaceholder}
            aria-invalid={Boolean(errors.defaultAmount)}
            className={`${inputClass} tabular-nums`}
          />
        </FormField>
        <FormField label="Default unit" required error={errors.defaultUnit}>
          <input
            type="text"
            list={unitListId}
            value={form.defaultUnit}
            onChange={(event) =>
              onChange({ ...form, defaultUnit: event.target.value })
            }
            placeholder={config.unitPlaceholder}
            aria-invalid={Boolean(errors.defaultUnit)}
            className={inputClass}
          />
          <datalist id={unitListId}>
            {config.units.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
        </FormField>
      </div>
      <FormField label="Notes" className="md:col-span-2">
        <input
          type="text"
          value={form.notes}
          onChange={(event) => onChange({ ...form, notes: event.target.value })}
          placeholder={config.notesPlaceholder}
          className={inputClass}
        />
      </FormField>
    </div>
  );
}

function FormField({
  label,
  required = false,
  error,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col ${className}`}>
      <span className={labelClass}>
        {label} {required && <span aria-hidden="true">*</span>}
      </span>
      {children}
      {error && <span className="text-xs text-error mt-1">{error}</span>}
    </label>
  );
}

export function LibraryScaffold({
  noun,
  icon,
  activeCount,
  archivedCount,
  adding,
  showArchived,
  isLoading,
  error,
  onAdd,
  onRetry,
  onToggleArchived,
  editor,
  activeItems,
  archivedItems,
}: {
  noun: string;
  icon: string;
  activeCount: number;
  archivedCount: number;
  adding: boolean;
  showArchived: boolean;
  isLoading: boolean;
  error: string | null;
  onAdd: () => void;
  onRetry: () => void;
  onToggleArchived: () => void;
  editor?: ReactNode;
  activeItems: ReactNode;
  archivedItems: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-on-surface-variant text-sm" aria-live="polite">
          {activeCount} active · {archivedCount} archived
        </p>
        {!adding && (
          <button
            type="button"
            onClick={onAdd}
            className="w-full sm:w-auto justify-center px-5 py-2.5 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">add</span>
            Add {noun}
          </button>
        )}
      </div>

      {editor}

      {error && (
        <div
          role="alert"
          className="bg-error/10 border border-error/25 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <span className="text-sm text-error">{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-bold text-error underline underline-offset-2 self-start"
          >
            Try again
          </button>
        </div>
      )}

      {isLoading ? (
        <div role="status" className="bg-surface-container rounded-xl p-8 text-center text-on-surface-variant">
          Loading {noun}s…
        </div>
      ) : activeCount === 0 && !adding ? (
        <div className="bg-surface-container rounded-xl p-8 text-center border border-outline-variant/10">
          <span className="material-symbols-outlined text-outline mb-2 block text-4xl" aria-hidden="true">
            {icon}
          </span>
          <p className="text-on-surface-variant">
            No active {noun}s. Add one to start tracking it.
          </p>
        </div>
      ) : (
        activeItems
      )}

      {archivedCount > 0 && (
        <section className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
          <button
            type="button"
            onClick={onToggleArchived}
            aria-expanded={showArchived}
            className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors w-full text-left"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {showArchived ? "expand_less" : "expand_more"}
            </span>
            <span className="font-headline font-semibold text-sm">
              Archived ({archivedCount})
            </span>
          </button>
          {showArchived && <div className="mt-4 space-y-2">{archivedItems}</div>}
        </section>
      )}
    </div>
  );
}

export function ItemSummaryCard({
  item,
  icon,
  iconClass,
  onEdit,
  onOpenDossier,
  children,
}: {
  item: IntakeItemBase;
  icon: string;
  iconClass: string;
  onEdit: () => void;
  onOpenDossier: () => void;
  children?: ReactNode;
}) {
  return (
    <article className="bg-surface-container-high rounded-xl p-5 border border-transparent hover:border-outline-variant/20 transition-colors flex flex-col min-h-52">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className={`material-symbols-outlined ${iconClass}`}
          aria-hidden="true"
          style={{ fontVariationSettings: "'FILL' 1", fontSize: 28 }}
        >
          {icon}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenDossier}
            aria-label={`View ${item.name} dossier`}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-outline hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">menu_book</span>
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${item.name}`}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-outline hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">edit</span>
          </button>
        </div>
      </div>
      <p className="font-headline font-semibold text-on-surface">{item.name}</p>
      <p className="text-xs text-on-surface-variant tabular-nums mt-0.5">
        {item.defaultAmount != null
          ? `${formatAmount(item.defaultAmount)} ${item.defaultUnit}`
          : `Variable · ${item.defaultUnit}`}
      </p>
      {item.brand && (
        <p className="text-[10px] text-outline uppercase tracking-wider mt-2">
          {item.brand}
          {item.form ? ` · ${item.form}` : ""}
        </p>
      )}
      {item.notes && (
        <p className="text-xs text-on-surface-variant mt-2 italic line-clamp-2">
          {item.notes}
        </p>
      )}
      {children}
    </article>
  );
}

export function ArchivedItemRow({
  item,
  icon,
  restoring,
  onRestore,
}: {
  item: IntakeItemBase;
  icon: string;
  restoring: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
      <span className="material-symbols-outlined text-outline" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface-variant truncate">{item.name}</p>
        <p className="text-xs text-outline">
          {item.defaultAmount == null ? "Variable" : formatAmount(item.defaultAmount)}{" "}
          {item.defaultUnit}
        </p>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={restoring}
        aria-label={`Restore ${item.name}`}
        className="text-xs font-bold text-primary hover:text-on-primary-fixed hover:bg-primary px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {restoring ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}

export function EditorActions({
  itemName,
  saving,
  archiving,
  onCancel,
  onSave,
  onArchive,
  onOpenDossier,
}: {
  itemName?: string;
  saving: boolean;
  archiving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onArchive?: () => void;
  onOpenDossier?: () => void;
}) {
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {onArchive && itemName &&
          (confirmingArchive ? (
            <>
              <span className="text-xs text-on-surface-variant">
                Archive {itemName}?
              </span>
              <button
                type="button"
                onClick={onArchive}
                disabled={archiving}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-error/10 text-error hover:bg-error/20 disabled:opacity-50"
              >
                {archiving ? "Archiving…" : "Confirm archive"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingArchive(false)}
                className="px-3 py-1.5 text-xs font-bold text-outline"
              >
                Keep item
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingArchive(true)}
              className="text-xs text-outline hover:text-error transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">archive</span>
              Archive
            </button>
          ))}
        {onOpenDossier && (
          <button
            type="button"
            onClick={onOpenDossier}
            className="text-xs text-outline hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">menu_book</span>
            View dossier
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-highest"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
