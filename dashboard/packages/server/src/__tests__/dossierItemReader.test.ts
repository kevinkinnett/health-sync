import { describe, expect, it, vi } from "vitest";
import type {
  MedicationItem,
  SupplementItem,
} from "@health-dashboard/shared";
import { CatalogDossierItemReader } from "../services/dossierItemReader.js";

describe("CatalogDossierItemReader", () => {
  it("routes supplement lookups only to the supplement catalog", async () => {
    const item = { id: 4 } as SupplementItem;
    const supplements = { getItem: vi.fn().mockResolvedValue(item) };
    const medications = { getItem: vi.fn() };
    const reader = new CatalogDossierItemReader(supplements, medications);

    await expect(reader.find("supplement", 4)).resolves.toEqual({
      type: "supplement",
      item,
    });
    expect(supplements.getItem).toHaveBeenCalledWith(4);
    expect(medications.getItem).not.toHaveBeenCalled();
  });

  it("returns the medication catalog result, including a miss", async () => {
    const supplements = { getItem: vi.fn() };
    const medications = {
      getItem: vi.fn<() => Promise<MedicationItem | null>>().mockResolvedValue(null),
    };
    const reader = new CatalogDossierItemReader(supplements, medications);

    await expect(reader.find("medication", 9)).resolves.toBeNull();
    expect(medications.getItem).toHaveBeenCalledWith(9);
    expect(supplements.getItem).not.toHaveBeenCalled();
  });
});
