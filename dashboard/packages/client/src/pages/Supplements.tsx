import { useState } from "react";
import { SupplementLog } from "../components/supplements/SupplementLog";
import { SupplementLibrary } from "../components/supplements/SupplementLibrary";

const tabs = ["Log", "Library"] as const;
type Tab = (typeof tabs)[number];

export function Supplements() {
  const [activeTab, setActiveTab] = useState<Tab>("Log");

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
            Supplements
          </h1>
          <p className="text-on-surface-variant mt-1">
            Track what you take, when you take it, and how much.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-1.5 bg-surface-container-low rounded-2xl border border-outline-variant/10">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? "bg-primary text-on-primary-fixed"
                  : "text-outline hover:text-on-surface"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "Log" && <SupplementLog />}
      {activeTab === "Library" && <SupplementLibrary />}
    </div>
  );
}
