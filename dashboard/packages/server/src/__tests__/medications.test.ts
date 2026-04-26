import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type {
  MedicationItem,
  MedicationIntake,
  CreateMedicationItemBody,
  UpdateMedicationItemBody,
} from "@health-dashboard/shared";
import { MedicationService } from "../services/medicationService.js";
import { MedicationController } from "../controllers/medicationController.js";
import { createMedicationRoutes } from "../routes/medication.js";

/**
 * In-memory fake repo with the full MedicationRepository surface used by
 * MedicationService. Lets us exercise the controller + service + zod
 * validation end-to-end through Express, without needing Postgres.
 */
class FakeRepo {
  private items = new Map<number, MedicationItem>();
  private intakes = new Map<number, MedicationIntake>();
  private nextItemId = 1;
  private nextIntakeId = 1;

  reset() {
    this.items.clear();
    this.intakes.clear();
    this.nextItemId = 1;
    this.nextIntakeId = 1;
  }

  async ensureTables(): Promise<void> {
    /* noop for fake */
  }

  async listItems(includeInactive = false): Promise<MedicationItem[]> {
    const all = [...this.items.values()];
    return all
      .filter((it) => includeInactive || it.isActive)
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async getItem(id: number): Promise<MedicationItem | null> {
    return this.items.get(id) ?? null;
  }

  async createItem(body: CreateMedicationItemBody): Promise<MedicationItem> {
    const now = new Date().toISOString();
    const item: MedicationItem = {
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
    };
    this.items.set(item.id, item);
    return item;
  }

  async updateItem(
    id: number,
    body: UpdateMedicationItemBody,
  ): Promise<MedicationItem | null> {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated: MedicationItem = {
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
    return updated;
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

  async listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<MedicationIntake[]> {
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
  }): Promise<MedicationIntake> {
    const item = this.items.get(body.itemId);
    if (!item) throw new Error("item missing in fake repo");
    const intake: MedicationIntake = {
      id: this.nextIntakeId++,
      itemId: body.itemId,
      itemName: item.name,
      takenAt: body.takenAt,
      amount: body.amount,
      unit: body.unit,
      notes: body.notes,
      createdAt: new Date().toISOString(),
    };
    this.intakes.set(intake.id, intake);
    return intake;
  }

  async deleteIntake(id: number): Promise<boolean> {
    return this.intakes.delete(id);
  }
}

const fakeRepo = new FakeRepo();
const service = new MedicationService(fakeRepo as any);
const controller = new MedicationController(service);
const app = express();
app.use(express.json());
app.use("/api/medications", createMedicationRoutes(controller));

beforeEach(() => {
  fakeRepo.reset();
});

describe("Medication API", () => {
  describe("items", () => {
    it("POST /items creates an item and GET /items returns it", async () => {
      const create = await request(app)
        .post("/api/medications/items")
        .send({
          name: "Lisinopril",
          brand: "Prinivil",
          form: "tablet",
          defaultAmount: 10,
          defaultUnit: "mg",
        })
        .expect(201);
      expect(create.body).toMatchObject({
        id: expect.any(Number),
        name: "Lisinopril",
        defaultAmount: 10,
        defaultUnit: "mg",
        isActive: true,
      });

      const list = await request(app).get("/api/medications/items").expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].name).toBe("Lisinopril");
    });

    it("POST /items rejects missing name with 400 + zod issues", async () => {
      const res = await request(app)
        .post("/api/medications/items")
        .send({ defaultUnit: "mg" })
        .expect(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.issues).toBeInstanceOf(Array);
    });

    it("POST /items rejects missing defaultUnit with 400", async () => {
      await request(app)
        .post("/api/medications/items")
        .send({ name: "Mystery rx" })
        .expect(400);
    });

    it("PATCH /items/:id updates fields", async () => {
      const created = await request(app)
        .post("/api/medications/items")
        .send({ name: "Metformin", defaultAmount: 500, defaultUnit: "mg" });
      const id = created.body.id;
      const updated = await request(app)
        .patch(`/api/medications/items/${id}`)
        .send({ defaultAmount: 1000, brand: "Glucophage" })
        .expect(200);
      expect(updated.body.defaultAmount).toBe(1000);
      expect(updated.body.brand).toBe("Glucophage");
      expect(updated.body.name).toBe("Metformin"); // unchanged
    });

    it("DELETE /items/:id soft-archives and excludes from default list", async () => {
      const created = await request(app)
        .post("/api/medications/items")
        .send({ name: "Atorvastatin", defaultUnit: "mg" });
      await request(app)
        .delete(`/api/medications/items/${created.body.id}`)
        .expect(204);
      const def = await request(app).get("/api/medications/items");
      expect(def.body).toEqual([]);
      const all = await request(app).get(
        "/api/medications/items?includeInactive=true",
      );
      expect(all.body).toHaveLength(1);
      expect(all.body[0].isActive).toBe(false);
    });

    it("DELETE /items/:id returns 404 for missing item", async () => {
      await request(app).delete("/api/medications/items/999").expect(404);
    });
  });

  describe("intakes", () => {
    it("POST /intakes uses item defaults when amount/unit omitted", async () => {
      const item = await request(app).post("/api/medications/items").send({
        name: "Lisinopril",
        defaultAmount: 10,
        defaultUnit: "mg",
      });
      const res = await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: item.body.id })
        .expect(201);
      expect(res.body).toMatchObject({
        itemId: item.body.id,
        itemName: "Lisinopril",
        amount: 10,
        unit: "mg",
      });
      expect(res.body.takenAt).toBeDefined();
    });

    it("POST /intakes snapshots explicit amount/unit", async () => {
      const item = await request(app).post("/api/medications/items").send({
        name: "Albuterol",
        defaultAmount: 1,
        defaultUnit: "puff",
      });
      const res = await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: item.body.id, amount: 2, unit: "puff" })
        .expect(201);
      expect(res.body.amount).toBe(2);
      expect(res.body.unit).toBe("puff");
    });

    it("POST /intakes returns 404 for missing item", async () => {
      await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: 9999 })
        .expect(404);
    });

    it("POST /intakes returns 400 when item is archived", async () => {
      const item = await request(app).post("/api/medications/items").send({
        name: "Old prescription",
        defaultAmount: 1,
        defaultUnit: "tab",
      });
      await request(app).delete(`/api/medications/items/${item.body.id}`);
      const res = await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: item.body.id })
        .expect(400);
      expect(res.body.error).toMatch(/archived/i);
    });

    it("POST /intakes returns 400 when no default amount and amount omitted", async () => {
      const item = await request(app).post("/api/medications/items").send({
        name: "Variable dose",
        defaultUnit: "mL",
      });
      const res = await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: item.body.id })
        .expect(400);
      expect(res.body.error).toMatch(/default amount/i);
    });

    it("DELETE /intakes/:id removes the row", async () => {
      const item = await request(app).post("/api/medications/items").send({
        name: "Lisinopril",
        defaultAmount: 10,
        defaultUnit: "mg",
      });
      const intake = await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: item.body.id });
      await request(app)
        .delete(`/api/medications/intakes/${intake.body.id}`)
        .expect(204);
      const list = await request(app).get("/api/medications/intakes");
      expect(list.body).toEqual([]);
    });

    it("GET /intakes filters by itemId", async () => {
      const a = await request(app).post("/api/medications/items").send({
        name: "A",
        defaultAmount: 1,
        defaultUnit: "tab",
      });
      const b = await request(app).post("/api/medications/items").send({
        name: "B",
        defaultAmount: 1,
        defaultUnit: "tab",
      });
      await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: a.body.id });
      await request(app)
        .post("/api/medications/intakes")
        .send({ itemId: b.body.id });
      const filtered = await request(app)
        .get(`/api/medications/intakes?itemId=${a.body.id}`)
        .expect(200);
      expect(filtered.body).toHaveLength(1);
      expect(filtered.body[0].itemId).toBe(a.body.id);
    });
  });
});
