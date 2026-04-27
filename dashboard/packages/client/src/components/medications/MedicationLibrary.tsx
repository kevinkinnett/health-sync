import { useState } from "react";
import type { MedicationItem } from "@health-dashboard/shared";
import {
  useMedicationItems,
  useCreateMedicationItem,
  useUpdateMedicationItem,
  useArchiveMedicationItem,
} from "../../api/queries";
import {
  DossierDrawer,
  type DossierDrawerTarget,
} from "../dossier/DossierDrawer";

const inputClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-[10px] text-outline uppercase tracking-wider font-bold mb-1 block";

const COMMON_FORMS = [
  "tablet",
  "capsule",
  "liquid",
  "injection",
  "inhaler",
  "patch",
  "cream",
  "drops",
];
const COMMON_UNITS = ["mg", "mcg", "g", "mL", "tablet", "capsule", "puff", "drop"];

interface ItemFormState {
  name: string;
  brand: string;
  form: string;
  defaultAmount: string;
  defaultUnit: string;
  notes: string;
}

function emptyForm(): ItemFormState {
  return { name: "", brand: "", form: "", defaultAmount: "", defaultUnit: "", notes: "" };
}

function fromItem(item: MedicationItem): ItemFormState {
  return {
    name: item.name,
    brand: item.brand ?? "",
    form: item.form ?? "",
    defaultAmount: item.defaultAmount != null ? String(item.defaultAmount) : "",
    defaultUnit: item.defaultUnit,
    notes: item.notes ?? "",
  };
}

function ItemForm({
  form,
  onChange,
}: {
  form: ItemFormState;
  onChange: (next: ItemFormState) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label className="flex flex-col">
        <span className={labelClass}>Name *</span>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="Lisinopril"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col">
        <span className={labelClass}>Brand</span>
        <input
          type="text"
          value={form.brand}
          onChange={(e) => onChange({ ...form, brand: e.target.value })}
          placeholder="Prinivil"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col">
        <span className={labelClass}>Form</span>
        <input
          type="text"
          list="medication-forms"
          value={form.form}
          onChange={(e) => onChange({ ...form, form: e.target.value })}
          placeholder="tablet"
          className={inputClass}
        />
        <datalist id="medication-forms">
          {COMMON_FORMS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className={labelClass}>Default amount</span>
          <input
            type="number"
            step="0.001"
            value={form.defaultAmount}
            onChange={(e) =>
              onChange({ ...form, defaultAmount: e.target.value })
            }
            placeholder="10"
            className={`${inputClass} tabular-nums`}
          />
        </label>
        <label className="flex flex-col">
          <span className={labelClass}>Default unit *</span>
          <input
            type="text"
            list="medication-units"
            value={form.defaultUnit}
            onChange={(e) =>
              onChange({ ...form, defaultUnit: e.target.value })
            }
            placeholder="mg"
            className={inputClass}
          />
          <datalist id="medication-units">
            {COMMON_UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="flex flex-col md:col-span-2">
        <span className={labelClass}>Notes</span>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => onChange({ ...form, notes: e.target.value })}
          placeholder="e.g. once daily, with food"
          className={inputClass}
        />
      </label>
    </div>
  );
}

function ItemEditCard({
  item,
  onCancel,
  onOpenDossier,
}: {
  item: MedicationItem;
  onCancel: () => void;
  onOpenDossier: () => void;
}) {
  const [form, setForm] = useState<ItemFormState>(fromItem(item));
  const update = useUpdateMedicationItem();
  const archive = useArchiveMedicationItem();
  const [confirming, setConfirming] = useState(false);

  function handleSave() {
    if (!form.name.trim() || !form.defaultUnit.trim()) return;
    const amount = form.defaultAmount.trim();
    update.mutate(
      {
        id: item.id,
        body: {
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          form: form.form.trim() || null,
          defaultAmount: amount === "" ? null : Number(amount),
          defaultUnit: form.defaultUnit.trim(),
          notes: form.notes.trim() || null,
        },
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <div className="bg-surface-container-high rounded-xl p-5 border border-primary/20">
      <ItemForm form={form} onChange={setForm} />
      <div className="flex items-center justify-between mt-4 gap-2">
        {confirming ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span>Archive {item.name}?</span>
            <button
              onClick={() => {
                archive.mutate(item.id, { onSuccess: onCancel });
              }}
              className="px-3 py-1 text-xs font-bold rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
            >
              Archive
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1 text-xs font-bold rounded-lg text-outline hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirming(true)}
              className="text-xs text-outline hover:text-error transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">archive</span>
              Archive
            </button>
            <button
              onClick={onOpenDossier}
              className="text-xs text-outline hover:text-primary transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">menu_book</span>
              View dossier
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              update.isPending || !form.name.trim() || !form.defaultUnit.trim()
            }
            className="px-5 py-2 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewItemCard({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<ItemFormState>(emptyForm());
  const create = useCreateMedicationItem();

  function handleSave() {
    if (!form.name.trim() || !form.defaultUnit.trim()) return;
    const amount = form.defaultAmount.trim();
    create.mutate(
      {
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        form: form.form.trim() || null,
        defaultAmount: amount === "" ? null : Number(amount),
        defaultUnit: form.defaultUnit.trim(),
        notes: form.notes.trim() || null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="bg-surface-container-high rounded-xl p-5 border border-primary/30">
      <h3 className="font-headline font-bold text-on-surface mb-4">
        Add medication
      </h3>
      <ItemForm form={form} onChange={setForm} />
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onClose}
          className="px-4 py-2 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-high transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={
            create.isPending || !form.name.trim() || !form.defaultUnit.trim()
          }
          className="px-5 py-2 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onOpenDossier,
}: {
  item: MedicationItem;
  onOpenDossier: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ItemEditCard
        item={item}
        onCancel={() => setEditing(false)}
        onOpenDossier={onOpenDossier}
      />
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className="bg-surface-container-high hover:bg-surface-container-highest rounded-xl p-5 text-left transition-colors group cursor-pointer relative"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDossier();
        }}
        aria-label="View dossier"
        title="View dossier"
        className="absolute top-3 right-3 h-8 w-8 flex items-center justify-center rounded-lg text-outline hover:text-primary hover:bg-primary/10 transition-colors"
      >
        <span className="material-symbols-outlined text-base">menu_book</span>
      </button>
      <div className="flex items-start justify-between mb-2 pr-9">
        <span
          className="material-symbols-outlined text-tertiary"
          style={{ fontVariationSettings: "'FILL' 1", fontSize: 28 }}
        >
          prescriptions
        </span>
        <span className="material-symbols-outlined text-outline group-hover:text-on-surface transition-colors text-sm opacity-0 group-hover:opacity-100">
          edit
        </span>
      </div>
      <p className="font-headline font-semibold text-on-surface">{item.name}</p>
      <p className="text-xs text-on-surface-variant tabular-nums mt-0.5">
        {item.defaultAmount != null
          ? `${Number.isInteger(item.defaultAmount) ? item.defaultAmount : item.defaultAmount.toFixed(3)} ${item.defaultUnit}`
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
    </div>
  );
}

function ArchivedRow({ item }: { item: MedicationItem }) {
  const update = useUpdateMedicationItem();
  return (
    <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
      <span className="material-symbols-outlined text-outline">prescriptions</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface-variant truncate">{item.name}</p>
        <p className="text-xs text-outline">
          {item.defaultAmount ?? "—"} {item.defaultUnit}
        </p>
      </div>
      <button
        onClick={() =>
          update.mutate({ id: item.id, body: { isActive: true } })
        }
        disabled={update.isPending}
        className="text-xs font-bold text-primary hover:text-on-primary-fixed hover:bg-primary px-3 py-1 rounded-lg transition-colors"
      >
        Restore
      </button>
    </div>
  );
}

export function MedicationLibrary() {
  const items = useMedicationItems(true);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [dossierTarget, setDossierTarget] =
    useState<DossierDrawerTarget | null>(null);

  const active = items.data?.filter((i) => i.isActive) ?? [];
  const archived = items.data?.filter((i) => !i.isActive) ?? [];

  function openDossier(item: MedicationItem) {
    setDossierTarget({
      type: "medication",
      id: item.id,
      itemName: item.name,
      itemBrand: item.brand,
      itemForm: item.form,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-on-surface-variant text-sm">
          {active.length} active · {archived.length} archived
        </p>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 active:scale-95 transition-transform flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">add</span>
            Add medication
          </button>
        )}
      </div>

      {adding && <NewItemCard onClose={() => setAdding(false)} />}

      {items.isLoading ? (
        <p className="text-on-surface-variant">Loading…</p>
      ) : active.length === 0 && !adding ? (
        <div className="bg-surface-container rounded-xl p-8 text-center">
          <span
            className="material-symbols-outlined text-outline mb-2 block"
            style={{ fontSize: 40 }}
          >
            prescriptions
          </span>
          <p className="text-on-surface-variant">
            No medications yet. Click &ldquo;Add medication&rdquo; to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onOpenDossier={() => openDossier(item)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="bg-surface-container rounded-xl p-5">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors w-full text-left"
          >
            <span className="material-symbols-outlined text-sm">
              {showArchived ? "expand_less" : "expand_more"}
            </span>
            <span className="font-headline font-semibold text-sm">
              Archived ({archived.length})
            </span>
          </button>
          {showArchived && (
            <div className="mt-4 space-y-2">
              {archived.map((item) => (
                <ArchivedRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}

      <DossierDrawer
        target={dossierTarget}
        onClose={() => setDossierTarget(null)}
      />
    </div>
  );
}
