/** Canonical entry in the ingredient catalog. */
export interface SupplementIngredient {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One ingredient row in a supplement's composition.
 *
 * The amount is "per one default dose of the parent" — i.e. taking the
 * supplement's `defaultAmount` of `defaultUnit` delivers this much
 * ingredient. When an intake logs a different amount (with matching
 * unit), the breakdown is scaled by `intake.amount / item.defaultAmount`.
 */
export interface SupplementItemIngredient {
  ingredientId: number;
  ingredientName: string;
  amount: number;
  unit: string;
  sortOrder: number;
}

/** Snapshot of one ingredient amount stored against an intake. */
export interface SupplementIntakeIngredient {
  id: number;
  ingredientId: number;
  ingredientName: string;
  amount: number;
  unit: string;
}

export interface SupplementItem {
  id: number;
  name: string;
  brand: string | null;
  form: string | null;
  defaultAmount: number | null;
  defaultUnit: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Composition rows; empty for single-substance supplements. */
  ingredients: SupplementItemIngredient[];
}

export interface SupplementIntake {
  id: number;
  itemId: number;
  itemName: string;
  takenAt: string;
  amount: number;
  unit: string;
  notes: string | null;
  createdAt: string;
  /** Snapshot breakdown; empty for items without a composition. */
  ingredients: SupplementIntakeIngredient[];
}

export interface CreateSupplementItemBody {
  name: string;
  brand?: string | null;
  form?: string | null;
  defaultAmount?: number | null;
  defaultUnit: string;
  notes?: string | null;
}

export interface UpdateSupplementItemBody {
  name?: string;
  brand?: string | null;
  form?: string | null;
  defaultAmount?: number | null;
  defaultUnit?: string;
  notes?: string | null;
  isActive?: boolean;
}

export interface CreateSupplementIntakeBody {
  itemId: number;
  takenAt?: string;
  amount?: number;
  unit?: string;
  notes?: string | null;
}

export interface CreateSupplementIngredientBody {
  name: string;
  notes?: string | null;
}

export interface UpdateSupplementIngredientBody {
  name?: string;
  notes?: string | null;
}

/**
 * Replace-all body for an item's composition. Each entry can either
 * reference an existing ingredient by id, or supply a name to look up
 * (or create) by name.
 */
export interface SetSupplementItemIngredientsBody {
  ingredients: Array<{
    ingredientId?: number;
    ingredientName?: string;
    amount: number;
    unit: string;
    sortOrder?: number;
  }>;
}
