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
