import {
  buildV1Endpoints,
  type V1Context,
  type V1EndpointDef,
} from "../api/v1/endpoints.js";
import type { ToolDef } from "./llmClient.js";

/**
 * Bridges the v1 REST surface to the LLM tool registry. Each v1
 * endpoint becomes a callable tool, name-mapped from `/foo/bar` to
 * `query_foo_bar`. The shared definition stops drift: when a new v1
 * endpoint is added, the model can call it on the next turn with no
 * extra wiring.
 *
 * Mutating tools (none today) would belong in a separate registry —
 * see the finance pattern for `categorize_transactions` getting
 * filtered out of the read-only Insights surface.
 */

export interface HealthTool {
  name: string;
  endpoint: V1EndpointDef;
  toolDef: ToolDef;
}

const NAME_PREFIX = "query_";

function endpointToToolName(path: string): string {
  return (
    NAME_PREFIX +
    path
      .replace(/^\//, "")
      .replace(/-/g, "_")
      .replace(/\//g, "_")
  );
}

/**
 * Build the full registry — single source of truth for both the LLM
 * tool list (passed to chatCompletion) and the runtime dispatcher.
 */
export function buildHealthTools(): HealthTool[] {
  return buildV1Endpoints().map((endpoint) => {
    const name = endpointToToolName(endpoint.path);
    const toolDef: ToolDef = {
      type: "function",
      function: {
        name,
        description: endpoint.description,
        parameters: {
          type: "object",
          properties: (endpoint.parameters?.properties ?? {}) as Record<
            string,
            unknown
          >,
          required: endpoint.parameters?.required ?? [],
        },
      },
    };
    return { name, endpoint, toolDef };
  });
}

/**
 * Execute a tool by name. Always returns a JSON-stringified result —
 * OpenAI tool-call message convention is `{role:"tool", content:"<json>"}`,
 * so the agentic loop can pass our return value through verbatim.
 *
 * Errors are caught and returned as `{ error: "<message>" }` JSON so
 * a single bad tool call doesn't kill the whole loop. The model gets
 * a chance to recover (call a different tool, give up gracefully).
 */
export async function executeHealthTool(
  name: string,
  args: Record<string, unknown>,
  ctx: V1Context,
): Promise<string> {
  const registry = buildHealthTools();
  const found = registry.find((t) => t.name === name);
  if (!found) {
    return JSON.stringify({
      error: `Unknown tool '${name}'. Use one of: ${registry.map((t) => t.name).join(", ")}`,
    });
  }
  try {
    const result = await found.endpoint.handler(args, ctx);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}
