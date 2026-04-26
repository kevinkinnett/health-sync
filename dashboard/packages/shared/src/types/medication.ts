export interface MedicationItem {
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

export interface MedicationIntake {
  id: number;
  itemId: number;
  itemName: string;
  takenAt: string;
  amount: number;
  unit: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateMedicationItemBody {
  name: string;
  brand?: string | null;
  form?: string | null;
  defaultAmount?: number | null;
  defaultUnit: string;
  notes?: string | null;
}

export interface UpdateMedicationItemBody {
  name?: string;
  brand?: string | null;
  form?: string | null;
  defaultAmount?: number | null;
  defaultUnit?: string;
  notes?: string | null;
  isActive?: boolean;
}

export interface CreateMedicationIntakeBody {
  itemId: number;
  takenAt?: string;
  amount?: number;
  unit?: string;
  notes?: string | null;
}
