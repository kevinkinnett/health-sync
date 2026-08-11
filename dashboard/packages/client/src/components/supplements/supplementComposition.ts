import type {
  SetSupplementItemIngredientsBody,
  SupplementItemIngredient,
} from "@health-dashboard/shared";

export interface CompositionRow {
  key: string;
  ingredientId?: number;
  ingredientName: string;
  amount: string;
  unit: string;
}

let rowKeySequence = 0;

export function newCompositionRow(unit = "mg"): CompositionRow {
  rowKeySequence += 1;
  return {
    key: `ingredient-${rowKeySequence}`,
    ingredientName: "",
    amount: "",
    unit,
  };
}

export function compositionToForm(
  ingredients: SupplementItemIngredient[],
): CompositionRow[] {
  return ingredients.map((ingredient) => ({
    ...newCompositionRow(ingredient.unit),
    ingredientId: ingredient.ingredientId,
    ingredientName: ingredient.ingredientName,
    amount: String(ingredient.amount),
  }));
}

export function buildCompositionBody(
  rows: CompositionRow[],
): SetSupplementItemIngredientsBody {
  return {
    ingredients: rows.flatMap((row, index) => {
      const ingredientName = row.ingredientName.trim();
      const amount = Number(row.amount);
      const unit = row.unit.trim();
      if (
        (!ingredientName && row.ingredientId == null) ||
        !row.amount.trim() ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        !unit
      ) {
        return [];
      }

      return [
        {
          ...(row.ingredientId == null
            ? { ingredientName }
            : { ingredientId: row.ingredientId }),
          amount,
          unit,
          sortOrder: index,
        },
      ];
    }),
  };
}

export function validateCompositionRows(rows: CompositionRow[]): string | null {
  for (const row of rows) {
    const hasIngredient =
      row.ingredientId != null || row.ingredientName.trim().length > 0;
    const hasAmount = row.amount.trim().length > 0;
    if (!hasIngredient && !hasAmount) continue;

    const amount = Number(row.amount);
    if (!hasIngredient) return "Each ingredient row needs a name.";
    if (!hasAmount || !Number.isFinite(amount) || amount < 0) {
      return "Each ingredient amount must be zero or greater.";
    }
    if (!row.unit.trim()) return "Each ingredient row needs a unit.";
  }
  return null;
}
