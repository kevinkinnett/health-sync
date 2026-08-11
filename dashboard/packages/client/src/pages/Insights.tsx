import { useState } from "react";
import { ChatTab } from "../components/insights/ChatTab";
import { ReportsTab } from "../components/insights/ReportsTab";

type Tab = "reports" | "chat";

export function Insights() {
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight mb-2 flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
            AI Insights
          </h1>
          <p className="text-on-surface-variant text-lg">
            LLM-narrated reports across six dimensions, plus open-ended chat
            grounded in your Fitbit-device data imported through Google Health,
            plus supplements and medications.
          </p>
        </div>
        <TabSwitcher value={tab} onChange={setTab} />
      </header>

      {tab === "reports" ? <ReportsTab /> : <ChatTab />}
    </div>
  );
}

function TabSwitcher({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Insights tabs"
      className="inline-flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/10"
    >
      <TabButton
        active={value === "reports"}
        icon="bar_chart"
        label="Reports"
        onClick={() => onChange("reports")}
      />
      <TabButton
        active={value === "chat"}
        icon="chat"
        label="Chat"
        onClick={() => onChange("chat")}
      />
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
        active
          ? "bg-surface-container shadow text-on-surface"
          : "text-outline hover:text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}
