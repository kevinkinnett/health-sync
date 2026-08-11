import { buildCurlExamples } from "./apiConsoleModel";
import {
  CodeBlock,
  ConsoleSection,
  ExternalLinkPanel,
  PanelLabel,
} from "./ApiConsoleUi";

export function QuickStartCard({ base }: { base: string }) {
  const examples = buildCurlExamples(base);

  return (
    <ConsoleSection icon="terminal" title="Quick Start">
      <div className="space-y-6 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <PanelLabel>Base URL</PanelLabel>
            <CodeBlock value={base} copyLabel="Copy base URL" />
          </div>
          <ExternalLinkPanel
            label="Interactive docs (Swagger UI)"
            href="/api/v1/docs"
            display={`${base}/docs`}
          />
          <ExternalLinkPanel
            label="OpenAPI spec (JSON)"
            href="/api/v1/openapi.json"
            display={`${base}/openapi.json`}
          />
        </div>

        <p className="text-xs leading-relaxed text-outline">
          All v1 endpoints are read-only and require no auth — access is gated
          by Tailnet membership. Pass an{" "}
          <code className="rounded border border-outline-variant/10 bg-surface-container-lowest px-1.5 py-0.5 font-mono text-on-surface-variant">
            X-Caller
          </code>{" "}
          header to label that client in recent activity.
        </p>

        <div className="space-y-4">
          {examples.map((example) => (
            <div key={example.title}>
              <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-sm font-bold text-on-surface">{example.title}</h3>
                <p className="text-xs text-outline">{example.description}</p>
              </div>
              <CodeBlock
                value={example.command}
                copyLabel={`Copy: ${example.title}`}
              />
            </div>
          ))}
        </div>
      </div>
    </ConsoleSection>
  );
}
