import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatDose } from "../../lib/dose";
import { DateTimePicker } from "../DateTimePicker";
import {
  intakeDraftToPayload,
  newIntakeDraft,
  validateIntakeDraft,
  type IntakeDraft,
  type IntakeDraftErrors,
  type IntakeDraftPayload,
  type IntakeLogItemBase,
} from "./logModel";

const inputClass =
  "w-full rounded-lg bg-surface-container-lowest border border-outline-variant/20 px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";
const labelClass =
  "text-[10px] text-outline uppercase tracking-wider font-bold mb-1 block";

export function IntakeConfirmPanel<T extends IntakeLogItemBase>({
  item,
  icon,
  iconClass,
  notesPlaceholder,
  saving,
  error,
  onResetError,
  onClose,
  onConfirm,
  renderPreview,
}: {
  item: T;
  icon: string;
  iconClass: string;
  notesPlaceholder: string;
  saving: boolean;
  error: string | null;
  onResetError: () => void;
  onClose: () => void;
  onConfirm: (payload: IntakeDraftPayload) => Promise<unknown>;
  renderPreview?: (draft: IntakeDraft) => ReactNode;
}) {
  const [draft, setDraft] = useState<IntakeDraft>(() => newIntakeDraft(item));
  const [errors, setErrors] = useState<IntakeDraftErrors>({});
  const headingId = useId();
  const amountErrorId = useId();
  const unitErrorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const changeDraft = (next: IntakeDraft) => {
    setDraft(next);
    setErrors({});
    onResetError();
  };

  const confirm = async () => {
    const nextErrors = validateIntakeDraft(draft, item);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      await onConfirm(intakeDraftToPayload(item.id, draft));
      onClose();
    } catch {
      // The mutation error remains visible in this panel for a safe retry.
    }
  };

  return (
    <section
      role="region"
      aria-labelledby={headingId}
      className="bg-surface-container-high rounded-2xl p-4 sm:p-5 border border-primary/25 shadow-sm"
    >
      <div className="flex items-center gap-3 mb-5">
        <span
          className={`material-symbols-outlined ${iconClass}`}
          style={{ fontVariationSettings: "'FILL' 1", fontSize: 28 }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h3
            ref={headingRef}
            id={headingId}
            tabIndex={-1}
            className="font-headline font-bold text-on-surface outline-none"
          >
            Logging {item.name}
          </h3>
          <p className="text-xs text-outline">
            Default: {formatDose(item.defaultAmount, item.defaultUnit)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <label className="flex flex-col">
          <span className={labelClass}>Amount</span>
          <input
            type="number"
            min="0"
            step="0.001"
            value={draft.amount}
            disabled={saving}
            onChange={(event) =>
              changeDraft({ ...draft, amount: event.target.value })
            }
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? amountErrorId : undefined}
            className={`${inputClass} tabular-nums`}
          />
          {errors.amount && (
            <span id={amountErrorId} className="text-xs text-error mt-1">
              {errors.amount}
            </span>
          )}
        </label>
        <label className="flex flex-col">
          <span className={labelClass}>Unit</span>
          <input
            type="text"
            value={draft.unit}
            disabled={saving}
            onChange={(event) =>
              changeDraft({ ...draft, unit: event.target.value })
            }
            aria-invalid={Boolean(errors.unit)}
            aria-describedby={errors.unit ? unitErrorId : undefined}
            className={inputClass}
          />
          {errors.unit && (
            <span id={unitErrorId} className="text-xs text-error mt-1">
              {errors.unit}
            </span>
          )}
        </label>
      </div>

      <label className="flex flex-col mb-4">
        <span className={labelClass}>Notes (optional)</span>
        <input
          type="text"
          value={draft.notes}
          disabled={saving}
          onChange={(event) =>
            changeDraft({ ...draft, notes: event.target.value })
          }
          placeholder={notesPlaceholder}
          className={inputClass}
        />
      </label>

      <div className="mb-4">
        {draft.useCustomTime ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={labelClass}>Taken at</span>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  changeDraft({ ...draft, useCustomTime: false })
                }
                className="text-xs text-outline hover:text-on-surface px-2 py-1"
              >
                Use current time
              </button>
            </div>
            <DateTimePicker
              value={draft.takenAt}
              onChange={(takenAt) => changeDraft({ ...draft, takenAt })}
              disabled={saving}
            />
            {errors.takenAt && (
              <p role="alert" className="text-xs text-error mt-2">
                {errors.takenAt}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              changeDraft({
                ...draft,
                useCustomTime: true,
                takenAt: new Date(),
              })
            }
            className="text-xs text-outline hover:text-on-surface flex items-center gap-1 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              schedule
            </span>
            Logging as <span className="text-on-surface font-semibold">now</span>
            <span aria-hidden="true">·</span> Adjust time
          </button>
        )}
      </div>

      {renderPreview?.(draft)}

      {error && (
        <div
          role="alert"
          className="mb-4 p-3 rounded-lg bg-error/10 text-xs text-error"
        >
          Could not log this dose: {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2.5 text-xs font-bold rounded-lg text-outline hover:bg-surface-container-highest disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={saving}
          className="px-5 py-2.5 text-xs font-bold rounded-lg bg-linear-to-br from-primary to-primary-container text-on-primary-fixed shadow-lg shadow-primary/10 disabled:opacity-50"
        >
          {saving ? "Logging…" : error ? "Try again" : "Confirm"}
        </button>
      </div>
    </section>
  );
}
