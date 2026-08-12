import { useState } from "react";
import type {
  SupplementIntake,
  SupplementItem,
  SupplementIntakeIngredient,
} from "@health-dashboard/shared";
import {
  IntakeConfirmPanel,
  IntakeTimelineSection,
  QuickLogGrid,
} from "../intake/IntakeLogUi";
import type { HistoryRange, IntakeDraft } from "../intake/logModel";
import { formatAmount } from "../../lib/dose";
import { previewSupplementComposition } from "./supplementIntakeComposition";
import { useSupplementLog } from "./useSupplementLog";

const timeOnly = (takenAt: string) =>
  new Date(takenAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const dateAndTime = (takenAt: string) =>
  new Date(takenAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function SupplementLog() {
  const [selected, setSelected] = useState<SupplementItem | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("30d");
  const log = useSupplementLog(historyRange);

  return (
    <div className="space-y-6">
      {selected && (
        <IntakeConfirmPanel
          key={selected.id}
          item={selected}
          icon="medication"
          iconClass="text-secondary"
          notesPlaceholder="e.g. with breakfast"
          saving={log.logging}
          error={log.logError}
          onResetError={log.resetLogError}
          onClose={() => {
            log.resetLogError();
            setSelected(null);
          }}
          onConfirm={log.logIntake}
          renderPreview={(draft) => (
            <SupplementCompositionPreview item={selected} draft={draft} />
          )}
        />
      )}

      <QuickLogGrid
        noun="supplement"
        icon="medication"
        iconClass="text-secondary"
        hoverClass="hover:bg-secondary/10"
        items={log.items}
        loading={log.itemsLoading}
        error={log.itemsError}
        onRetry={log.retryItems}
        onSelect={(item) => {
          log.resetLogError();
          setSelected(item);
        }}
        renderBadge={(item) =>
          item.ingredients.length > 0 ? (
            <span className="text-[10px] text-secondary uppercase tracking-wider mt-1 font-bold block">
              {item.ingredients.length} ingredient
              {item.ingredients.length === 1 ? "" : "s"}
            </span>
          ) : null
        }
      />

      <IntakeTimelineSection
        title="Today"
        emptyMessage="Nothing logged yet today."
        entries={log.todayIntakes}
        icon="medication"
        iconClass="text-secondary"
        loading={log.intakesLoading}
        error={log.intakesError}
        onRetry={log.retryIntakes}
        deletingId={log.deletingId}
        onDelete={log.deleteIntake}
        formatTime={timeOnly}
        details={supplementIntakeDetails}
      />

      <IntakeTimelineSection
        title="History"
        emptyMessage="No history in this range."
        entries={log.historyIntakes}
        icon="medication"
        iconClass="text-secondary"
        loading={log.intakesLoading}
        error={log.intakesError}
        onRetry={log.retryIntakes}
        deletingId={log.deletingId}
        onDelete={log.deleteIntake}
        formatTime={dateAndTime}
        range={historyRange}
        onRangeChange={setHistoryRange}
        details={supplementIntakeDetails}
      />
    </div>
  );
}

function SupplementCompositionPreview({
  item,
  draft,
}: {
  item: SupplementItem;
  draft: IntakeDraft;
}) {
  if (item.ingredients.length === 0) return null;
  const amount = draft.amount.trim()
    ? Number(draft.amount)
    : item.defaultAmount;
  const ingredients = previewSupplementComposition(item, amount, draft.unit);
  const unitMismatch = draft.unit !== item.defaultUnit;
  const missingDefault = item.defaultAmount == null || item.defaultAmount <= 0;

  return (
    <div className="mb-4 bg-surface-container rounded-xl p-3 border border-outline-variant/10">
      <p className="text-[10px] text-outline uppercase tracking-wider font-bold mb-2">
        Will also log
      </p>
      {ingredients.length > 0 ? (
        <IngredientAmounts ingredients={ingredients} />
      ) : unitMismatch ? (
        <p className="text-xs text-outline italic">
          Ingredient breakdown will be skipped because the unit does not match
          the default ({item.defaultUnit}).
        </p>
      ) : missingDefault ? (
        <p className="text-xs text-outline italic">
          Ingredient breakdown cannot be scaled until this supplement has a
          positive default amount.
        </p>
      ) : (
        <p className="text-xs text-outline italic">
          Enter a valid amount to preview the ingredient breakdown.
        </p>
      )}
    </div>
  );
}

function supplementIntakeDetails(intake: SupplementIntake) {
  if (intake.ingredients.length === 0) return null;
  return {
    summary: `${intake.ingredients.length} ingredient${
      intake.ingredients.length === 1 ? "" : "s"
    }`,
    content: <IngredientAmounts ingredients={intake.ingredients} />,
  };
}

function IngredientAmounts({
  ingredients,
}: {
  ingredients: Array<
    Pick<SupplementIntakeIngredient, "ingredientId" | "ingredientName" | "amount" | "unit">
  >;
}) {
  return (
    <ul className="space-y-1">
      {ingredients.map((ingredient) => (
        <li
          key={ingredient.ingredientId}
          className="text-xs flex items-baseline justify-between gap-2 tabular-nums"
        >
          <span className="text-on-surface-variant truncate">
            {ingredient.ingredientName}
          </span>
          <span className="text-on-surface font-semibold whitespace-nowrap">
            {formatAmount(ingredient.amount)} {ingredient.unit}
          </span>
        </li>
      ))}
    </ul>
  );
}
