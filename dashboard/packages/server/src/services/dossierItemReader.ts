import type {
  DossierItemType,
  MedicationItem,
  SupplementItem,
} from "@health-dashboard/shared";

export type DossierItemContext =
  | { type: "supplement"; item: SupplementItem }
  | { type: "medication"; item: MedicationItem };

/** The item lookup capability required by the dossier workflow. */
export interface DossierItemReader {
  find(type: DossierItemType, id: number): Promise<DossierItemContext | null>;
}

interface ItemCatalog<T> {
  getItem(id: number): Promise<T | null>;
}

/** Adapts the two item catalogs into the single capability dossiers need. */
export class CatalogDossierItemReader implements DossierItemReader {
  constructor(
    private readonly supplements: ItemCatalog<SupplementItem>,
    private readonly medications: ItemCatalog<MedicationItem>,
  ) {}

  async find(
    type: DossierItemType,
    id: number,
  ): Promise<DossierItemContext | null> {
    if (type === "supplement") {
      const item = await this.supplements.getItem(id);
      return item == null ? null : { type, item };
    }

    const item = await this.medications.getItem(id);
    return item == null ? null : { type, item };
  }
}
