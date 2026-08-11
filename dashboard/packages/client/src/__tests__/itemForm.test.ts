import { describe, expect, it } from "vitest";
import {
  emptyItemForm,
  itemFormToPayload,
  itemToForm,
  validateItemForm,
} from "../components/intake/itemForm";
import {
  buildCompositionBody,
  newCompositionRow,
  validateCompositionRows,
} from "../components/supplements/supplementComposition";

describe("intake item form rules", () => {
  it("normalizes an existing item into editable string fields", () => {
    expect(
      itemToForm({
        id: 7,
        name: " Creatine ",
        brand: null,
        form: "powder",
        defaultAmount: 5,
        defaultUnit: "g",
        notes: null,
        isActive: true,
      }),
    ).toEqual({
      name: " Creatine ",
      brand: "",
      form: "powder",
      defaultAmount: "5",
      defaultUnit: "g",
      notes: "",
    });
  });

  it("validates required fields and non-negative numeric amounts", () => {
    expect(validateItemForm(emptyItemForm())).toEqual({
      name: "Name is required.",
      defaultUnit: "Unit is required.",
    });
    expect(
      validateItemForm({
        ...emptyItemForm(),
        name: "Magnesium",
        defaultUnit: "mg",
        defaultAmount: "-1",
      }),
    ).toEqual({ defaultAmount: "Amount must be zero or greater." });
  });

  it("builds the shared API payload with trimmed nullable fields", () => {
    expect(
      itemFormToPayload({
        name: "  Magnesium ",
        brand: " ",
        form: " capsule ",
        defaultAmount: " 200 ",
        defaultUnit: " mg ",
        notes: " evening ",
      }),
    ).toEqual({
      name: "Magnesium",
      brand: null,
      form: "capsule",
      defaultAmount: 200,
      defaultUnit: "mg",
      notes: "evening",
    });
  });

  it("keeps supplement composition feature-specific and validates partial rows", () => {
    const valid = {
      ...newCompositionRow(),
      ingredientId: 12,
      ingredientName: "Ashwagandha",
      amount: "300",
    };
    expect(validateCompositionRows([valid])).toBeNull();
    expect(buildCompositionBody([valid])).toEqual({
      ingredients: [
        { ingredientId: 12, amount: 300, unit: "mg", sortOrder: 0 },
      ],
    });
    expect(
      validateCompositionRows([
        { ...newCompositionRow(), ingredientName: "L-Theanine" },
      ]),
    ).toMatch(/amount/i);
  });
});
