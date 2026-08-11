import { describe, expect, it } from "vitest";
import type {
  MedicationItem,
  SupplementItem,
} from "@health-dashboard/shared";
import {
  appendDossierRetryNudge,
  buildDossierPrompt,
} from "../services/dossierPrompt.js";

const timestamp = "2026-08-11T00:00:00.000Z";

const supplement: SupplementItem = {
  id: 1,
  name: "Vitamin D3",
  brand: "Example Labs",
  form: "capsule",
  defaultAmount: 1000,
  defaultUnit: "IU",
  notes: "Take with food",
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  ingredients: [
    {
      ingredientId: 10,
      ingredientName: "Cholecalciferol",
      amount: 1000,
      unit: "IU",
      sortOrder: 0,
    },
  ],
};

const medication: MedicationItem = {
  id: 2,
  name: "Lisinopril",
  brand: null,
  form: "tablet",
  defaultAmount: 10,
  defaultUnit: "mg",
  notes: null,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("buildDossierPrompt", () => {
  it("describes supplement composition and item context", () => {
    const messages = buildDossierPrompt({ type: "supplement", item: supplement });
    const prompt = messages[1].content;

    expect(messages[0]).toMatchObject({ role: "system" });
    expect(prompt).toContain("dietary supplement");
    expect(prompt).toContain("- Brand: Example Labs");
    expect(prompt).toContain("- Default dose: 1000 IU");
    expect(prompt).toContain("- User notes: Take with food");
    expect(prompt).toContain("Cholecalciferol: 1000 IU");
  });

  it("does not invent supplement-only composition for medications", () => {
    const prompt = buildDossierPrompt({ type: "medication", item: medication })[1]
      .content;

    expect(prompt).toContain("medication");
    expect(prompt).toContain("- Default dose: 10 mg");
    expect(prompt).not.toContain("Composition (per default dose)");
    expect(prompt).not.toContain("- Brand:");
    expect(prompt).not.toContain("- User notes:");
  });
});

describe("appendDossierRetryNudge", () => {
  it("retains the base prompt and caps echoed invalid content", () => {
    const base = buildDossierPrompt({ type: "medication", item: medication });
    const retried = appendDossierRetryNudge(base, "x".repeat(5000));

    expect(retried.slice(0, 2)).toEqual(base);
    expect(retried[2]).toEqual({ role: "assistant", content: "x".repeat(4000) });
    expect(retried[3].content).toContain("valid JSON block");
  });
});
