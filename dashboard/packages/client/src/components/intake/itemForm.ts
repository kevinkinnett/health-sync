export interface IntakeItemBase {
  id: number;
  name: string;
  brand: string | null;
  form: string | null;
  defaultAmount: number | null;
  defaultUnit: string;
  notes: string | null;
  isActive: boolean;
}

export interface IntakeItemFormState {
  name: string;
  brand: string;
  form: string;
  defaultAmount: string;
  defaultUnit: string;
  notes: string;
}

export interface IntakeItemPayload {
  name: string;
  brand: string | null;
  form: string | null;
  defaultAmount: number | null;
  defaultUnit: string;
  notes: string | null;
}

export type ItemFormErrors = Partial<
  Record<"name" | "defaultAmount" | "defaultUnit", string>
>;

export function emptyItemForm(): IntakeItemFormState {
  return {
    name: "",
    brand: "",
    form: "",
    defaultAmount: "",
    defaultUnit: "",
    notes: "",
  };
}

export function itemToForm(item: IntakeItemBase): IntakeItemFormState {
  return {
    name: item.name,
    brand: item.brand ?? "",
    form: item.form ?? "",
    defaultAmount:
      item.defaultAmount == null ? "" : String(item.defaultAmount),
    defaultUnit: item.defaultUnit,
    notes: item.notes ?? "",
  };
}

export function validateItemForm(form: IntakeItemFormState): ItemFormErrors {
  const errors: ItemFormErrors = {};
  const amount = form.defaultAmount.trim();

  if (!form.name.trim()) errors.name = "Name is required.";
  if (!form.defaultUnit.trim()) errors.defaultUnit = "Unit is required.";
  if (amount) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.defaultAmount = "Amount must be zero or greater.";
    }
  }

  return errors;
}

export function itemFormToPayload(
  form: IntakeItemFormState,
): IntakeItemPayload {
  const amount = form.defaultAmount.trim();
  return {
    name: form.name.trim(),
    brand: form.brand.trim() || null,
    form: form.form.trim() || null,
    defaultAmount: amount ? Number(amount) : null,
    defaultUnit: form.defaultUnit.trim(),
    notes: form.notes.trim() || null,
  };
}
