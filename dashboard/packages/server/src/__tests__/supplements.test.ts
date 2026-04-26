import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type {
  SupplementItem,
  SupplementIntake,
  SupplementIngredient,
  SupplementItemIngredient,
  SupplementIntakeIngredient,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIngredientBody,
  UpdateSupplementIngredientBody,
} from "@health-dashboard/shared";
import { SupplementService } from "../services/supplementService.js";
import { SupplementController } from "../controllers/supplementController.js";
import { createSupplementRoutes } from "../routes/supplement.js";

/**
 * In-memory fake repo with the full SupplementRepository surface used by
 * SupplementService, including ingredient catalog and composition.
 *
 * We model FK behavior loosely: ON DELETE CASCADE for intake →
 * intake_ingredient, ON DELETE RESTRICT for ingredient deletion when
 * referenced.
 */
class FakeRepo {
  items = new Map<number, SupplementItem>();
  intakes = new Map<number, SupplementIntake>();
  ingredients = new Map<number, SupplementIngredient>();
  /** itemId → composition list */
  composition = new Map<number, SupplementItemIngredient[]>();
  private nextItemId = 1;
  private nextIntakeId = 1;
  private nextIngredientId = 1;
  private nextIntakeIngredientId = 1;

  reset() {
    this.items.clear();
    this.intakes.clear();
    this.ingredients.clear();
    this.composition.clear();
    this.nextItemId = 1;
    this.nextIntakeId = 1;
    this.nextIngredientId = 1;
    this.nextIntakeIngredientId = 1;
  }

  async ensureTables(): Promise<void> {
    /* noop for fake */
  }

  // ---- Items --------------------------------------------------------------

  async listItems(includeInactive = false): Promise<SupplementItem[]> {
    const all = [...this.items.values()];
    return all
      .filter((it) => includeInactive || it.isActive)
      .map((it) => this.attachIngredients(it))
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async getItem(id: number): Promise<SupplementItem | null> {
    const item = this.items.get(id);
    return item ? this.attachIngredients(item) : null;
  }

  private attachIngredients(item: SupplementItem): SupplementItem {
    return { ...item, ingredients: this.composition.get(item.id) ?? [] };
  }

  async createItem(body: CreateSupplementItemBody): Promise<SupplementItem> {
    const now = new Date().toISOString();
    const item: SupplementItem = {
      id: this.nextItemId++,
      name: body.name,
      brand: body.brand ?? null,
      form: body.form ?? null,
      defaultAmount: body.defaultAmount ?? null,
      defaultUnit: body.defaultUnit,
      notes: body.notes ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ingredients: [],
    };
    this.items.set(item.id, item);
    return item;
  }

  async updateItem(
    id: number,
    body: UpdateSupplementItemBody,
  ): Promise<SupplementItem | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated: SupplementItem = {
      ...existing,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.brand !== undefined && { brand: body.brand }),
      ...(body.form !== undefined && { form: body.form }),
      ...(body.defaultAmount !== undefined && {
        defaultAmount: body.defaultAmount,
      }),
      ...(body.defaultUnit !== undefined && { defaultUnit: body.defaultUnit }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      updatedAt: new Date().toISOString(),
    };
    this.items.set(id, updated);
    return this.attachIngredients(updated);
  }

  async archiveItem(id: number): Promise<boolean> {
    const existing = this.items.get(id);
    if (!existing) return false;
    this.items.set(id, {
      ...existing,
      isActive: false,
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  // ---- Intakes ------------------------------------------------------------

  async listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<SupplementIntake[]> {
    return [...this.intakes.values()]
      .filter((i) => (itemId == null ? true : i.itemId === itemId))
      .filter((i) => (start ? i.takenAt >= start : true))
      .filter((i) => (end ? i.takenAt <= end : true))
      .sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
  }

  async createIntake(body: {
    itemId: number;
    takenAt: string;
    amount: number;
    unit: string;
    notes: string | null;
    breakdown: Array<{
      ingredientId: number;
      ingredientName: string;
      amount: number;
      unit: string;
    }>;
  }): Promise<SupplementIntake> {
    const item = this.items.get(body.itemId);
    if (!item) throw new Error("item missing in fake repo");
    const ingredients: SupplementIntakeIngredient[] = body.breakdown.map(
      (b) => ({
        id: this.nextIntakeIngredientId++,
        ingredientId: b.ingredientId,
        ingredientName: b.ingredientName,
        amount: b.amount,
        unit: b.unit,
      }),
    );
    const intake: SupplementIntake = {
      id: this.nextIntakeId++,
      itemId: body.itemId,
      itemName: item.name,
      takenAt: body.takenAt,
      amount: body.amount,
      unit: body.unit,
      notes: body.notes,
      createdAt: new Date().toISOString(),
      ingredients,
    };
    this.intakes.set(intake.id, intake);
    return intake;
  }

  async deleteIntake(id: number): Promise<boolean> {
    return this.intakes.delete(id);
  }

  // ---- Ingredient catalog -------------------------------------------------

  async listIngredients(): Promise<SupplementIngredient[]> {
    return [...this.ingredients.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async getIngredient(id: number): Promise<SupplementIngredient | null> {
    return this.ingredients.get(id) ?? null;
  }

  async findIngredientByName(
    name: string,
  ): Promise<SupplementIngredient | null> {
    const lower = name.toLowerCase();
    for (const ing of this.ingredients.values()) {
      if (ing.name.toLowerCase() === lower) return ing;
    }
    return null;
  }

  async createIngredient(
    body: CreateSupplementIngredientBody,
  ): Promise<SupplementIngredient> {
    const existing = await this.findIngredientByName(body.name);
    if (existing) return existing; // mirror ON CONFLICT DO UPDATE semantics
    const now = new Date().toISOString();
    const ing: SupplementIngredient = {
      id: this.nextIngredientId++,
      name: body.name,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.ingredients.set(ing.id, ing);
    return ing;
  }

  async updateIngredient(
    id: number,
    body: UpdateSupplementIngredientBody,
  ): Promise<SupplementIngredient | null> {
    const existing = this.ingredients.get(id);
    if (!existing) return null;
    const updated: SupplementIngredient = {
      ...existing,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.notes !== undefined && { notes: body.notes }),
      updatedAt: new Date().toISOString(),
    };
    this.ingredients.set(id, updated);
    return updated;
  }

  async deleteIngredient(id: number): Promise<boolean> {
    if (!this.ingredients.has(id)) return false;
    // Mimic FK: refuse if referenced anywhere
    for (const comp of this.composition.values()) {
      if (comp.some((c) => c.ingredientId === id)) {
        const err = new Error("FK violation") as Error & { code: string };
        err.code = "23503";
        throw err;
      }
    }
    for (const intake of this.intakes.values()) {
      if (intake.ingredients.some((c) => c.ingredientId === id)) {
        const err = new Error("FK violation") as Error & { code: string };
        err.code = "23503";
        throw err;
      }
    }
    this.ingredients.delete(id);
    return true;
  }

  // ---- Composition --------------------------------------------------------

  async getItemIngredients(itemId: number): Promise<SupplementItemIngredient[]> {
    return this.composition.get(itemId) ?? [];
  }

  async setItemIngredients(
    itemId: number,
    rows: Array<{
      ingredientId: number;
      amount: number;
      unit: string;
      sortOrder: number;
    }>,
  ): Promise<SupplementItemIngredient[]> {
    const list: SupplementItemIngredient[] = rows.map((r) => {
      const ing = this.ingredients.get(r.ingredientId);
      if (!ing) throw new Error("ingredient missing in fake repo");
      return {
        ingredientId: r.ingredientId,
        ingredientName: ing.name,
        amount: r.amount,
        unit: r.unit,
        sortOrder: r.sortOrder,
      };
    });
    list.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.ingredientName.localeCompare(b.ingredientName),
    );
    this.composition.set(itemId, list);
    return list;
  }
}

const fakeRepo = new FakeRepo();
const service = new SupplementService(fakeRepo as any);
const controller = new SupplementController(service);
const app = express();
app.use(express.json());
app.use("/api/supplements", createSupplementRoutes(controller));

beforeEach(() => {
  fakeRepo.reset();
});

describe("Supplement API", () => {
  describe("items", () => {
    it("POST /items creates an item and GET /items returns it", async () => {
      const create = await request(app)
        .post("/api/supplements/items")
        .send({
          name: "Vitamin D3",
          brand: "Now Foods",
          form: "capsule",
          defaultAmount: 1000,
          defaultUnit: "IU",
        })
        .expect(201);
      expect(create.body).toMatchObject({
        id: expect.any(Number),
        name: "Vitamin D3",
        defaultAmount: 1000,
        defaultUnit: "IU",
        isActive: true,
        ingredients: [],
      });

      const list = await request(app).get("/api/supplements/items").expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].name).toBe("Vitamin D3");
      expect(list.body[0].ingredients).toEqual([]);
    });

    it("POST /items rejects missing name with 400 + zod issues", async () => {
      const res = await request(app)
        .post("/api/supplements/items")
        .send({ defaultUnit: "IU" })
        .expect(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.issues).toBeInstanceOf(Array);
    });

    it("POST /items rejects missing defaultUnit with 400", async () => {
      await request(app)
        .post("/api/supplements/items")
        .send({ name: "Mystery powder" })
        .expect(400);
    });

    it("PATCH /items/:id updates fields", async () => {
      const created = await request(app)
        .post("/api/supplements/items")
        .send({ name: "Creatine", defaultAmount: 5, defaultUnit: "g" });
      const id = created.body.id;
      const updated = await request(app)
        .patch(`/api/supplements/items/${id}`)
        .send({ defaultAmount: 5.5, brand: "Optimum" })
        .expect(200);
      expect(updated.body.defaultAmount).toBe(5.5);
      expect(updated.body.brand).toBe("Optimum");
      expect(updated.body.name).toBe("Creatine"); // unchanged
    });

    it("DELETE /items/:id soft-archives and excludes from default list", async () => {
      const created = await request(app)
        .post("/api/supplements/items")
        .send({ name: "Magnesium", defaultUnit: "mg" });
      await request(app)
        .delete(`/api/supplements/items/${created.body.id}`)
        .expect(204);
      const def = await request(app).get("/api/supplements/items");
      expect(def.body).toEqual([]);
      const all = await request(app).get(
        "/api/supplements/items?includeInactive=true",
      );
      expect(all.body).toHaveLength(1);
      expect(all.body[0].isActive).toBe(false);
    });

    it("DELETE /items/:id returns 404 for missing item", async () => {
      await request(app).delete("/api/supplements/items/999").expect(404);
    });
  });

  describe("intakes", () => {
    it("POST /intakes uses item defaults when amount/unit omitted", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Vitamin D3",
        defaultAmount: 1000,
        defaultUnit: "IU",
      });
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: item.body.id })
        .expect(201);
      expect(res.body).toMatchObject({
        itemId: item.body.id,
        itemName: "Vitamin D3",
        amount: 1000,
        unit: "IU",
        ingredients: [],
      });
      expect(res.body.takenAt).toBeDefined();
    });

    it("POST /intakes snapshots explicit amount/unit", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Creatine",
        defaultAmount: 5,
        defaultUnit: "g",
      });
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: item.body.id, amount: 10, unit: "g" })
        .expect(201);
      expect(res.body.amount).toBe(10);
      expect(res.body.unit).toBe("g");
    });

    it("POST /intakes returns 404 for missing item", async () => {
      await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: 9999 })
        .expect(404);
    });

    it("POST /intakes returns 400 when item is archived", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Old supplement",
        defaultAmount: 1,
        defaultUnit: "tab",
      });
      await request(app).delete(`/api/supplements/items/${item.body.id}`);
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: item.body.id })
        .expect(400);
      expect(res.body.error).toMatch(/archived/i);
    });

    it("POST /intakes returns 400 when no default amount and amount omitted", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Variable dose",
        defaultUnit: "mL",
      });
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: item.body.id })
        .expect(400);
      expect(res.body.error).toMatch(/default amount/i);
    });

    it("DELETE /intakes/:id removes the row", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Vitamin D3",
        defaultAmount: 1000,
        defaultUnit: "IU",
      });
      const intake = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: item.body.id });
      await request(app)
        .delete(`/api/supplements/intakes/${intake.body.id}`)
        .expect(204);
      const list = await request(app).get("/api/supplements/intakes");
      expect(list.body).toEqual([]);
    });

    it("GET /intakes filters by itemId", async () => {
      const a = await request(app).post("/api/supplements/items").send({
        name: "A",
        defaultAmount: 1,
        defaultUnit: "tab",
      });
      const b = await request(app).post("/api/supplements/items").send({
        name: "B",
        defaultAmount: 1,
        defaultUnit: "tab",
      });
      await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: a.body.id });
      await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: b.body.id });
      const filtered = await request(app)
        .get(`/api/supplements/intakes?itemId=${a.body.id}`)
        .expect(200);
      expect(filtered.body).toHaveLength(1);
      expect(filtered.body[0].itemId).toBe(a.body.id);
    });
  });

  describe("ingredients", () => {
    it("POST /ingredients creates a new ingredient", async () => {
      const res = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "Ashwagandha" })
        .expect(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: "Ashwagandha",
        notes: null,
      });
    });

    it("POST /ingredients with case-different name returns existing", async () => {
      const first = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "L-Theanine" })
        .expect(201);
      const second = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "l-theanine" })
        .expect(201);
      expect(second.body.id).toBe(first.body.id);
    });

    it("GET /ingredients lists all sorted", async () => {
      await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "Zinc" });
      await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "Ashwagandha" });
      const list = await request(app)
        .get("/api/supplements/ingredients")
        .expect(200);
      expect(list.body.map((i: SupplementIngredient) => i.name)).toEqual([
        "Ashwagandha",
        "Zinc",
      ]);
    });

    it("PATCH /ingredients/:id updates the row", async () => {
      const created = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "GABA" });
      const updated = await request(app)
        .patch(`/api/supplements/ingredients/${created.body.id}`)
        .send({ notes: "Inhibitory neurotransmitter" })
        .expect(200);
      expect(updated.body.notes).toBe("Inhibitory neurotransmitter");
    });

    it("DELETE /ingredients/:id rejects when referenced by composition", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Anxie-T Plus",
        defaultAmount: 1,
        defaultUnit: "capsule",
      });
      const ing = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "Kava Kava" });
      await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({
          ingredients: [
            { ingredientId: ing.body.id, amount: 100, unit: "mg" },
          ],
        })
        .expect(200);
      const res = await request(app)
        .delete(`/api/supplements/ingredients/${ing.body.id}`)
        .expect(400);
      expect(res.body.error).toMatch(/referenced/i);
    });
  });

  describe("composition", () => {
    it("PUT /items/:id/ingredients accepts mixed name+id refs and creates new", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Anxie-T Plus",
        defaultAmount: 1,
        defaultUnit: "capsule",
      });
      const existing = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "Ashwagandha" });

      const res = await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({
          ingredients: [
            { ingredientId: existing.body.id, amount: 300, unit: "mg" },
            { ingredientName: "L-Theanine", amount: 200, unit: "mg" },
            { ingredientName: "Kava Kava", amount: 100, unit: "mg" },
          ],
        })
        .expect(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.map((r: SupplementItemIngredient) => r.ingredientName))
        .toContain("L-Theanine");

      // Item now exposes its composition on read
      const item2 = await request(app)
        .get(`/api/supplements/items/${item.body.id}`)
        .expect(200);
      expect(item2.body.ingredients).toHaveLength(3);
    });

    it("PUT /items/:id/ingredients rejects duplicates", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Anxie-T Plus",
        defaultAmount: 1,
        defaultUnit: "capsule",
      });
      const res = await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({
          ingredients: [
            { ingredientName: "Ashwagandha", amount: 300, unit: "mg" },
            { ingredientName: "ashwagandha", amount: 200, unit: "mg" },
          ],
        })
        .expect(400);
      expect(res.body.error).toMatch(/multiple times/i);
    });

    it("PUT /items/:id/ingredients rejects rows without id or name", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Anxie-T Plus",
        defaultAmount: 1,
        defaultUnit: "capsule",
      });
      await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({
          ingredients: [{ amount: 300, unit: "mg" }],
        })
        .expect(400);
    });

    it("PUT /items/:id/ingredients on missing item returns 404", async () => {
      await request(app)
        .put("/api/supplements/items/9999/ingredients")
        .send({ ingredients: [] })
        .expect(404);
    });

    it("PUT /items/:id/ingredients can clear composition", async () => {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Anxie-T Plus",
        defaultAmount: 1,
        defaultUnit: "capsule",
      });
      await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({
          ingredients: [
            { ingredientName: "Ashwagandha", amount: 300, unit: "mg" },
          ],
        });
      await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({ ingredients: [] })
        .expect(200);
      const item2 = await request(app).get(
        `/api/supplements/items/${item.body.id}`,
      );
      expect(item2.body.ingredients).toEqual([]);
    });
  });

  describe("intake breakdown", () => {
    async function setupAnxieT(): Promise<{ id: number; ingredientIds: number[] }> {
      const item = await request(app).post("/api/supplements/items").send({
        name: "Anxie-T Plus",
        defaultAmount: 1,
        defaultUnit: "capsule",
      });
      const ash = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "Ashwagandha" });
      const lth = await request(app)
        .post("/api/supplements/ingredients")
        .send({ name: "L-Theanine" });
      await request(app)
        .put(`/api/supplements/items/${item.body.id}/ingredients`)
        .send({
          ingredients: [
            { ingredientId: ash.body.id, amount: 300, unit: "mg" },
            { ingredientId: lth.body.id, amount: 200, unit: "mg" },
          ],
        });
      return { id: item.body.id, ingredientIds: [ash.body.id, lth.body.id] };
    }

    it("POST /intakes snapshots breakdown at default dose", async () => {
      const { id } = await setupAnxieT();
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: id })
        .expect(201);
      expect(res.body.ingredients).toHaveLength(2);
      const ash = res.body.ingredients.find(
        (r: SupplementIntakeIngredient) => r.ingredientName === "Ashwagandha",
      );
      expect(ash).toMatchObject({ amount: 300, unit: "mg" });
    });

    it("POST /intakes scales breakdown when amount differs", async () => {
      const { id } = await setupAnxieT();
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: id, amount: 2, unit: "capsule" })
        .expect(201);
      const ash = res.body.ingredients.find(
        (r: SupplementIntakeIngredient) => r.ingredientName === "Ashwagandha",
      );
      const lth = res.body.ingredients.find(
        (r: SupplementIntakeIngredient) => r.ingredientName === "L-Theanine",
      );
      expect(ash.amount).toBe(600);
      expect(lth.amount).toBe(400);
    });

    it("POST /intakes skips breakdown when units differ from item default", async () => {
      const { id } = await setupAnxieT();
      const res = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: id, amount: 1, unit: "scoop" })
        .expect(201);
      expect(res.body.ingredients).toEqual([]);
    });

    it("DELETE /intakes/:id cascades to breakdown rows", async () => {
      // Fake repo doesn't enforce FK cascade explicitly; we verify the
      // intake disappears from list (which is what the user observes).
      const { id } = await setupAnxieT();
      const intake = await request(app)
        .post("/api/supplements/intakes")
        .send({ itemId: id });
      expect(intake.body.ingredients).toHaveLength(2);
      await request(app)
        .delete(`/api/supplements/intakes/${intake.body.id}`)
        .expect(204);
      const list = await request(app).get("/api/supplements/intakes");
      expect(list.body).toEqual([]);
    });
  });
});
