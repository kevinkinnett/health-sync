import { describe, expect, it } from "vitest";
import type { DossierContent } from "@health-dashboard/shared";
import {
  decodeDossierResponse,
  DossierResponseError,
  extractJsonBlock,
} from "../services/dossierResponse.js";

function validContent(): DossierContent {
  return {
    version: 1,
    headline: "Reference headline",
    disclaimer: "Reference information only.",
    sections: [
      {
        key: "interactions",
        heading: "Interactions",
        body: "Interaction details [1].",
        sourceIds: [1],
      },
      {
        key: "summary",
        heading: "Summary",
        body: "Summary details [1].",
        sourceIds: [1],
      },
    ],
    sources: [
      { id: 1, title: "Reference", url: "https://example.com/reference" },
    ],
  };
}

describe("extractJsonBlock", () => {
  it("extracts fenced and unfenced JSON", () => {
    expect(extractJsonBlock('```json\n{"version":1}\n```')).toBe(
      '{"version":1}',
    );
    expect(extractJsonBlock('prose {"version":1} prose')).toBe(
      '{"version":1}',
    );
  });

  it("removes leaked tool output before extracting the payload", () => {
    const payload = JSON.stringify(validContent());
    const response = `<tool_response>{"fake":true}</tool_response>\n\`\`\`json\n${payload}\n\`\`\``;

    expect(extractJsonBlock(response)).toBe(payload);
  });
});

describe("decodeDossierResponse", () => {
  it("validates content and applies canonical section ordering", () => {
    const decoded = decodeDossierResponse(
      `\`\`\`json\n${JSON.stringify(validContent())}\n\`\`\``,
    );

    expect(decoded.sections.map((section) => section.key)).toEqual([
      "summary",
      "interactions",
    ]);
  });

  it.each([null, "", "not json"])(
    "classifies %j as a parse failure",
    (response) => {
      expectResponseError(response, "parse_error");
    },
  );

  it("distinguishes schema failures from parse failures", () => {
    expectResponseError(
      '```json\n{"version":1}\n```',
      "validation_error",
    );
  });
});

function expectResponseError(
  response: unknown,
  status: DossierResponseError["status"],
): void {
  try {
    decodeDossierResponse(response);
    throw new Error("Expected dossier decoding to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(DossierResponseError);
    expect((error as DossierResponseError).status).toBe(status);
  }
}
