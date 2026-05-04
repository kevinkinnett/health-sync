import { buildV1Endpoints, type V1EndpointDef } from "./endpoints.js";

/**
 * Generate an OpenAPI 3.0 spec from the v1 endpoint defs. The spec is
 * the same array of endpoints the router and Quick Start UI consume,
 * so docs cannot drift from the actual runtime — adding a new endpoint
 * to `buildV1Endpoints` automatically lights up here.
 */
export function generateOpenApiSpec(opts: {
  title?: string;
  version?: string;
  description?: string;
  serverUrl?: string;
} = {}): Record<string, unknown> {
  const endpoints = buildV1Endpoints();
  const paths: Record<string, unknown> = {};

  for (const ep of endpoints) {
    paths[ep.path] = {
      get: pathOp(ep),
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: opts.title ?? "Health API",
      version: opts.version ?? "1.0.0",
      description:
        opts.description ??
        "Read-only REST API for the personal health dashboard. All consumers are expected to be on the same Tailscale network — there is no per-call auth. Use the optional `X-Caller` header to self-identify in usage logs.",
    },
    servers: [{ url: opts.serverUrl ?? "/api/v1", description: "API v1" }],
    paths,
    components: {
      parameters: {
        XCaller: {
          name: "X-Caller",
          in: "header",
          required: false,
          schema: { type: "string" },
          description:
            "Optional caller identifier for usage tracking. Shows up in the API Console's per-caller breakdown.",
        },
      },
      schemas: {
        ApiEnvelope: {
          type: "object",
          required: ["data", "timestamp"],
          properties: {
            data: { description: "Endpoint-specific payload." },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        ApiError: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
  };
}

function pathOp(ep: V1EndpointDef): Record<string, unknown> {
  const props = ep.parameters?.properties ?? {};
  const required = new Set(ep.parameters?.required ?? []);
  const params = Object.entries(props).map(([name, schema]) => ({
    name,
    in: "query",
    required: required.has(name),
    description: schema.description ?? "",
    schema: {
      type: schema.type,
      ...(schema.enum ? { enum: [...schema.enum] } : {}),
      ...(schema.default !== undefined ? { default: schema.default } : {}),
    },
  }));
  return {
    summary: ep.summary,
    description: ep.description,
    operationId: opIdFromPath(ep.path),
    parameters: [
      ...params,
      { $ref: "#/components/parameters/XCaller" },
    ],
    responses: {
      "200": {
        description: "Successful response",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiEnvelope" },
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      "500": {
        description: "Server error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
    },
  };
}

function opIdFromPath(p: string): string {
  // "/supplements/intakes" → "supplementsIntakes"
  return p
    .replace(/^\//, "")
    .split(/[/-]+/)
    .map((part, i) =>
      i === 0
        ? part
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}
