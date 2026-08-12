import { useState } from "react";
import type { MedicationItem } from "@health-dashboard/shared";
import {
  IntakeConfirmPanel,
  IntakeTimelineSection,
  QuickLogGrid,
} from "../intake/IntakeLogUi";
import type { HistoryRange } from "../intake/logModel";
import { MedicationCalendar } from "./MedicationCalendar";
import { useMedicationLog } from "./useMedicationLog";

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

export function MedicationLog() {
  const [selected, setSelected] = useState<MedicationItem | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("30d");
  const log = useMedicationLog(historyRange);

  return (
    <div className="space-y-6">
      {selected && (
        <IntakeConfirmPanel
          key={selected.id}
          item={selected}
          icon="prescriptions"
          iconClass="text-tertiary"
          notesPlaceholder="e.g. with food"
          saving={log.logging}
          error={log.logError}
          onResetError={log.resetLogError}
          onClose={() => {
            log.resetLogError();
            setSelected(null);
          }}
          onConfirm={log.logIntake}
        />
      )}

      <QuickLogGrid
        noun="medication"
        icon="prescriptions"
        iconClass="text-tertiary"
        hoverClass="hover:bg-tertiary/10"
        items={log.items}
        loading={log.itemsLoading}
        error={log.itemsError}
        onRetry={log.retryItems}
        onSelect={(item) => {
          log.resetLogError();
          setSelected(item);
        }}
      />

      <IntakeTimelineSection
        title="Today"
        emptyMessage="Nothing logged yet today."
        entries={log.todayIntakes}
        icon="prescriptions"
        iconClass="text-tertiary"
        loading={log.intakesLoading}
        error={log.intakesError}
        onRetry={log.retryIntakes}
        deletingId={log.deletingId}
        onDelete={log.deleteIntake}
        formatTime={timeOnly}
      />

      {log.items.length > 0 && <MedicationCalendar items={log.items} />}

      <IntakeTimelineSection
        title="History"
        emptyMessage="No history in this range."
        entries={log.historyIntakes}
        icon="prescriptions"
        iconClass="text-tertiary"
        loading={log.intakesLoading}
        error={log.intakesError}
        onRetry={log.retryIntakes}
        deletingId={log.deletingId}
        onDelete={log.deleteIntake}
        formatTime={dateAndTime}
        range={historyRange}
        onRangeChange={setHistoryRange}
      />
    </div>
  );
}
