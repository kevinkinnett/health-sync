export type HistoryRange = "7d" | "30d" | "90d" | "all";

export const HISTORY_PRESETS: ReadonlyArray<{
  label: string;
  value: HistoryRange;
}> = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

export interface IntakeLogItemBase {
  id: number;
  name: string;
  brand: string | null;
  defaultAmount: number | null;
  defaultUnit: string;
}

export interface IntakeLogEntryBase {
  id: number;
  itemName: string;
  takenAt: string;
  amount: number;
  unit: string;
  notes: string | null;
}

export interface IntakeDraft {
  amount: string;
  unit: string;
  notes: string;
  useCustomTime: boolean;
  takenAt: Date;
}

export interface IntakeDraftPayload {
  itemId: number;
  takenAt?: string;
  amount?: number;
  unit: string;
  notes: string | null;
}

export type IntakeDraftErrors = Partial<
  Record<"amount" | "unit" | "takenAt", string>
>;

export function historyRangeStart(
  range: HistoryRange,
  now = new Date(),
): string | undefined {
  if (range === "all") return undefined;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  ).toISOString();
}

export function partitionIntakes<T extends { takenAt: string }>(
  intakes: T[],
  now = new Date(),
): { today: T[]; history: T[] } {
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return intakes.reduce<{ today: T[]; history: T[] }>(
    (result, intake) => {
      if (new Date(intake.takenAt).getTime() >= todayStart) {
        result.today.push(intake);
      } else {
        result.history.push(intake);
      }
      return result;
    },
    { today: [], history: [] },
  );
}

export function newIntakeDraft(
  item: IntakeLogItemBase,
  now = new Date(),
): IntakeDraft {
  return {
    amount: item.defaultAmount == null ? "" : String(item.defaultAmount),
    unit: item.defaultUnit,
    notes: "",
    useCustomTime: false,
    takenAt: now,
  };
}

export function validateIntakeDraft(
  draft: IntakeDraft,
  item: IntakeLogItemBase,
): IntakeDraftErrors {
  const errors: IntakeDraftErrors = {};
  const amount = draft.amount.trim();
  if (!amount && item.defaultAmount == null) {
    errors.amount = "Amount is required because this item has no default dose.";
  } else if (amount) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.amount = "Amount must be zero or greater.";
    }
  }
  if (!draft.unit.trim()) errors.unit = "Unit is required.";
  if (draft.useCustomTime && !Number.isFinite(draft.takenAt.getTime())) {
    errors.takenAt = "Choose a valid date and time.";
  }
  return errors;
}

export function intakeDraftToPayload(
  itemId: number,
  draft: IntakeDraft,
): IntakeDraftPayload {
  const amount = draft.amount.trim();
  return {
    itemId,
    ...(draft.useCustomTime ? { takenAt: draft.takenAt.toISOString() } : {}),
    ...(amount ? { amount: Number(amount) } : {}),
    unit: draft.unit.trim(),
    notes: draft.notes.trim() || null,
  };
}
