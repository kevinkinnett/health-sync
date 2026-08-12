import { useState } from "react";
import { ChatTab } from "../components/insights/ChatTab";
import { ReportsTab } from "../components/insights/ReportsTab";
import { PageHeader } from "../components/ui/PageHeader";

type Tab = "reports" | "chat";

export function Insights() {
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] min-w-0 flex-col gap-8 xl:min-h-[calc(100dvh-7rem)]">
      <PageHeader
        eyebrow="AI analysis"
        title="AI Insights"
        description="Generate health reports and ask questions grounded in measurements imported through Google Health, supplements, and medications."
        action={<TabSwitcher value={tab} onChange={setTab} />}
      />

      <div className={tab === "chat" ? "min-h-0 flex-1" : "min-w-0"}>
        {tab === "reports" ? <ReportsTab /> : <ChatTab />}
      </div>
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
      className="inline-flex w-full rounded-xl border border-outline-variant/10 bg-surface-container-low p-1 sm:w-auto"
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
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all sm:flex-none ${
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
