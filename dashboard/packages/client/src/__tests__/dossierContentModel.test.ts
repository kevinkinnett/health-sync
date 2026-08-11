import { describe, expect, it } from "vitest";
import {
  parseDossierBody,
  sourceHost,
} from "../components/dossier/dossierContentModel";

describe("parseDossierBody", () => {
  it("parses single and grouped citations without treating prose as markdown", () => {
    expect(parseDossierBody("First [1], then combined [2, 3].")).toEqual([
      { kind: "text", value: "First " },
      { kind: "citations", ids: [1], raw: "[1]" },
      { kind: "text", value: ", then combined " },
      { kind: "citations", ids: [2, 3], raw: "[2, 3]" },
      { kind: "text", value: "." },
    ]);
  });

  it("leaves bracketed non-citation content untouched", () => {
    expect(parseDossierBody("Dose [daily] and range [1-3].")).toEqual([
      { kind: "text", value: "Dose [daily] and range [1-3]." },
    ]);
  });
});

describe("sourceHost", () => {
  it("returns a compact hostname and tolerates invalid URLs", () => {
    expect(sourceHost("https://www.example.com/reference")).toBe("example.com");
    expect(sourceHost("not a URL")).toBe("not a URL");
  });
});
