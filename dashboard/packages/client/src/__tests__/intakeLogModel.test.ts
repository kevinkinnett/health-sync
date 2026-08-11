import { describe, expect, it } from "vitest";
import {
  historyRangeStart,
  intakeDraftToPayload,
  newIntakeDraft,
  partitionIntakes,
  validateIntakeDraft,
} from "../components/intake/logModel";
import { previewSupplementComposition } from "../components/supplements/supplementIntakeComposition";

const item = {
  id: 7,
  name: "Magnesium",
  brand: null,
  defaultAmount: 200,
  defaultUnit: "mg",
};

describe("intake log model", () => {
  it("creates stable local-midnight history boundaries", () => {
    const now = new Date(2026, 7, 11, 16, 45);
    const sevenDays = new Date(historyRangeStart("7d", now)!);

    expect(sevenDays.getFullYear()).toBe(2026);
    expect(sevenDays.getMonth()).toBe(7);
    expect(sevenDays.getDate()).toBe(4);
    expect(sevenDays.getHours()).toBe(0);
    expect(historyRangeStart("all", now)).toBeUndefined();
  });

  it("partitions intake history using the user's local day", () => {
    const now = new Date(2026, 7, 11, 12);
    const today = { id: 1, takenAt: new Date(2026, 7, 11, 1).toISOString() };
    const older = { id: 2, takenAt: new Date(2026, 7, 10, 23).toISOString() };

    expect(partitionIntakes([older, today], now)).toEqual({
      today: [today],
      history: [older],
    });
  });

  it("requires a usable amount and unit without rejecting a default fallback", () => {
    const defaultDraft = newIntakeDraft(item);
    expect(validateIntakeDraft(defaultDraft, item)).toEqual({});

    const noDefault = { ...item, defaultAmount: null };
    expect(validateIntakeDraft(newIntakeDraft(noDefault), noDefault)).toEqual({
      amount: "Amount is required because this item has no default dose.",
    });
    expect(
      validateIntakeDraft({ ...defaultDraft, amount: "-1", unit: "" }, item),
    ).toEqual({
      amount: "Amount must be zero or greater.",
      unit: "Unit is required.",
    });
  });

  it("normalizes an explicit intake payload without inventing a timestamp", () => {
    const draft = {
      ...newIntakeDraft(item, new Date("2026-08-11T14:30:00Z")),
      amount: " 250 ",
      unit: " mg ",
      notes: " after lunch ",
    };
    expect(intakeDraftToPayload(item.id, draft)).toEqual({
      itemId: 7,
      amount: 250,
      unit: "mg",
      notes: "after lunch",
    });

    expect(
      intakeDraftToPayload(item.id, { ...draft, useCustomTime: true }),
    ).toMatchObject({ takenAt: "2026-08-11T14:30:00.000Z" });
  });

  it("keeps supplement composition scaling domain-specific", () => {
    const supplement = {
      ...item,
      form: "capsule",
      notes: null,
      isActive: true,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
      defaultAmount: 1,
      defaultUnit: "capsule",
      ingredients: [
        {
          ingredientId: 11,
          ingredientName: "Ashwagandha",
          amount: 300,
          unit: "mg",
          sortOrder: 0,
        },
      ],
    };

    expect(previewSupplementComposition(supplement, 2, "capsule")[0].amount).toBe(
      600,
    );
    expect(previewSupplementComposition(supplement, 2, "tablet")).toEqual([]);
    expect(previewSupplementComposition(supplement, -1, "capsule")).toEqual([]);
  });
});
