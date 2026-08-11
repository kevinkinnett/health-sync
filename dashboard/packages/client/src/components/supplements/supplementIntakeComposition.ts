import type {
  SupplementItem,
  SupplementItemIngredient,
} from "@health-dashboard/shared";

/**
 * Mirrors the server composition rule for a live intake preview. Composition
 * scales only when the intake and default units match and the default amount
 * can provide a meaningful ratio.
 */
export function previewSupplementComposition(
  item: SupplementItem,
  intakeAmount: number | null,
  intakeUnit: string,
): SupplementItemIngredient[] {
  if (item.ingredients.length === 0) return [];
  if (intakeAmount == null || !Number.isFinite(intakeAmount) || intakeAmount < 0) {
    return [];
  }
  if (item.defaultAmount == null || item.defaultAmount <= 0) return [];
  if (intakeUnit !== item.defaultUnit) return [];
  const ratio = intakeAmount / item.defaultAmount;
  return item.ingredients.map((ingredient) => ({
    ...ingredient,
    amount: Math.round(ingredient.amount * ratio * 1000) / 1000,
  }));
}
