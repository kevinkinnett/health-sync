import { useState } from "react";
import { useHealthCheck, useIngestState } from "../api/queries";
import { useUnitsStore } from "../stores/unitsStore";
import type { UnitSystem } from "../lib/units";
import { formatRelativeAgo } from "../lib/relativeTime";
import { NotificationSettingsCard } from "../components/NotificationSettingsCard";
import { LlmModelSettingsCard } from "../components/LlmModelSettingsCard";
import { Card, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";

function StatusRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: "good" | "bad" | "neutral";
  detail: string;
}) {
  const tone = {
    good: "bg-secondary text-secondary",
    bad: "bg-error text-error",
    neutral: "bg-outline text-outline",
  }[state];
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-container-low p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.split(" ")[0]}`} />
        <span className="text-sm font-medium text-on-surface">{label}</span>
      </div>
      <span className={`text-xs font-semibold ${tone.split(" ")[1]}`}>{detail}</span>
    </div>
  );
}

function SystemHealthCard() {
  const health = useHealthCheck();
  const apiState = health.isLoading ? "neutral" : health.isError ? "bad" : "good";
  const databaseState = health.isLoading
    ? "neutral"
    : health.data?.dbConnected
      ? "good"
      : "bad";

  return (
    <Card className="p-6">
      <CardHeader
        title="System status"
        description="Live checks from this dashboard session."
      />
      <div className="space-y-3 mt-5">
        <StatusRow
          label="API server"
          state={apiState}
          detail={health.isLoading ? "Checking…" : health.isError ? "Unavailable" : "Online"}
        />
        <StatusRow
          label="Database"
          state={databaseState}
          detail={
            health.isLoading
              ? "Checking…"
              : health.data?.dbConnected
                ? "Connected"
                : "Disconnected"
          }
        />
        <StatusRow label="Windmill" state="neutral" detail="Managed externally" />
      </div>
    </Card>
  );
}

function UnitsCard() {
  const { units, setUnits } = useUnitsStore();
  const options: { value: UnitSystem; label: string; detail: string }[] = [
    { value: "imperial", label: "Imperial", detail: "lb · mi · °F" },
    { value: "metric", label: "Metric", detail: "kg · km · °C" },
  ];
  return (
    <Card className="p-6">
      <CardHeader title="Units" description="Changes display only; stored values remain metric." />
      <div role="radiogroup" aria-label="Measurement units" className="grid grid-cols-2 gap-3 mt-5">
        {options.map((option) => {
          const active = units === option.value;
          return (
            <button
              key={option.value}
              role="radio"
              aria-checked={active}
              onClick={() => setUnits(option.value)}
              className={`min-h-20 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? "border-primary bg-primary/10 text-on-surface"
                  : "border-outline-variant/15 bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="block text-xs mt-1 text-outline">{option.detail}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ApiAccessCard() {
  const [copied, setCopied] = useState(false);
  const endpoint = `${window.location.origin}/api`;
  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Card className="p-6">
      <CardHeader title="API access" description="The endpoint serving this exact dashboard." />
      <div className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-3 mt-5">
        <p className="break-all font-mono text-sm text-on-surface-variant">{endpoint}</p>
      </div>
      <Button variant="secondary" className="w-full mt-3" onClick={() => void copyEndpoint()}>
        {copied ? "Copied" : "Copy endpoint"}
      </Button>
      <p className="text-xs leading-relaxed text-outline mt-3">
        Database credentials are intentionally never exposed to the browser.
      </p>
    </Card>
  );
}

function SourceStatusCard() {
  const ingest = useIngestState();
  const latestSuccess = (ingest.data ?? [])
    .map((state) => state.lastSuccessAtUtc)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const detail = ingest.isLoading
    ? "Checking…"
    : ingest.isError
      ? "Status unavailable"
      : latestSuccess
        ? `Last successful sync ${formatRelativeAgo(latestSuccess)}`
        : "No successful sync recorded";

  return (
    <Card className="p-6">
      <CardHeader
        title="Health data ingestion"
        description="Read-only status from the ingestion records. Connections and credentials are managed in Windmill."
      />
      <div className="mt-5">
        <StatusRow
          label="Health data pipeline"
          state={ingest.isError ? "bad" : latestSuccess ? "good" : "neutral"}
          detail={detail}
        />
      </div>
    </Card>
  );
}

export function Settings() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Preferences, integrations, and the live status of the services behind Vitalis."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-4">
          <SystemHealthCard />
          <UnitsCard />
          <ApiAccessCard />
        </div>
        <div className="space-y-6 xl:col-span-8">
          <NotificationSettingsCard />
          <LlmModelSettingsCard />
          <SourceStatusCard />
        </div>
      </div>
    </div>
  );
}
