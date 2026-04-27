import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type {
  DossierContent,
  DossierEntry,
  DossierItemType,
  MedicationItem,
  SupplementItem,
} from "@health-dashboard/shared";
import {
  DossierService,
  type DossierServiceOptions,
} from "../services/dossierService.js";
import { DossierController } from "../controllers/dossierController.js";
import { createDossierRoutes } from "../routes/dossier.js";
import {
  SupplementService,
  NotFoundError as SupplementNotFoundError,
} from "../services/supplementService.js";
import {
  MedicationService,
  NotFoundError as MedicationNotFoundError,
} from "../services/medicationService.js";
import type {
  DossierUsageRow,
  UpsertDossierInput,
} from "../repositories/dossierRepo.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  LlmClient,
} from "../services/llmClient.js";
import { LlmHttpError } from "../services/llmClient.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeDossierRepo {
  entries = new Map<string, DossierEntry>();
  usage: DossierUsageRow[] = [];

  reset() {
    this.entries.clear();
    this.usage.length = 0;
  }

  async ensureTables(): Promise<void> {
    /* noop */
  }

  async get(
    type: DossierItemType,
    id: number,
  ): Promise<DossierEntry | null> {
    return this.entries.get(key(type, id)) ?? null;
  }

  async upsert(input: UpsertDossierInput): Promise<DossierEntry> {
    const entry: DossierEntry = {
      itemType: input.itemType,
      itemId: input.itemId,
      itemName: input.itemName,
      itemBrand: input.itemBrand,
      itemForm: input.itemForm,
      content: input.content,
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      fetchedAt: new Date().toISOString(),
    };
    this.entries.set(key(input.itemType, input.itemId), entry);
    return entry;
  }

  async delete(
    type: DossierItemType,
    id: number,
  ): Promise<boolean> {
    return this.entries.delete(key(type, id));
  }

  async recordUsage(row: DossierUsageRow): Promise<void> {
    this.usage.push(row);
  }
}

function key(type: DossierItemType, id: number) {
  return `${type}:${id}`;
}

class FakeSupplementRepo {
  items = new Map<number, SupplementItem>();
  async ensureTables(): Promise<void> {}
  async getItem(id: number): Promise<SupplementItem | null> {
    return this.items.get(id) ?? null;
  }
}

class FakeMedicationRepo {
  items = new Map<number, MedicationItem>();
  async ensureTables(): Promise<void> {}
  async getItem(id: number): Promise<MedicationItem | null> {
    return this.items.get(id) ?? null;
  }
}

/**
 * Programmable LLM client. Each call pops the next response off the queue.
 * Tests push either a ChatCompletionResponse, a function that builds one
 * from the request, or an Error to throw.
 */
type LlmHandler =
  | ChatCompletionResponse
  | ((req: ChatCompletionRequest) => ChatCompletionResponse)
  | Error;

class FakeLlmClient implements Pick<LlmClient, "chatCompletion"> {
  queue: LlmHandler[] = [];
  calls: ChatCompletionRequest[] = [];

  reset() {
    this.queue.length = 0;
    this.calls.length = 0;
  }

  async chatCompletion(
    req: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (!next) throw new Error("FakeLlmClient: no queued response");
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(req);
    return next;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidContent(overrides?: Partial<DossierContent>): DossierContent {
  return {
    version: 1,
    headline: "Vitamin D3 supports bone health and immunity.",
    disclaimer: "This is reference information, not medical advice.",
    sections: [
      {
        key: "summary",
        heading: "Summary",
        body: "Vitamin D3 (cholecalciferol) is a fat-soluble vitamin [1].",
        sourceIds: [1],
      },
      {
        key: "mechanism",
        heading: "Mechanism",
        body: "Hydroxylated in liver and kidney to active form [1].",
        sourceIds: [1],
      },
      {
        key: "dosing",
        heading: "Typical dosing",
        body: "Adults: 600–800 IU/day RDA [1]; up to 4000 IU UL [2].",
        sourceIds: [1, 2],
      },
      {
        key: "sideEffects",
        heading: "Side effects",
        body: "Rare at typical doses; hypercalcemia at very high doses [1].",
        sourceIds: [1],
      },
      {
        key: "interactions",
        heading: "Interactions",
        body: "Statins, thiazide diuretics, glucocorticoids [2].",
        sourceIds: [2],
      },
    ],
    sources: [
      { id: 1, title: "NIH ODS Vitamin D Fact Sheet", url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/", publisher: "NIH ODS" },
      { id: 2, title: "Drugs.com Vitamin D3", url: "https://www.drugs.com/mtm/vitamin-d3.html", publisher: "Drugs.com" },
    ],
    ...overrides,
  };
}

function makeAssistantResponse(content: string): ChatCompletionResponse {
  return {
    model: "qwen3-max-2026-01-23",
    choices: [
      {
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 1234,
      completion_tokens: 567,
      total_tokens: 1801,
    },
  };
}

function fenceJson(obj: unknown): string {
  return "```json\n" + JSON.stringify(obj) + "\n```";
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const dossierRepo = new FakeDossierRepo();
const supplementRepo = new FakeSupplementRepo();
const medicationRepo = new FakeMedicationRepo();
const llm = new FakeLlmClient();

const supplementService = new SupplementService(supplementRepo as any);
const medicationService = new MedicationService(medicationRepo as any);

const opts: DossierServiceOptions = {
  model: "qwen3-max-2026-01-23",
  retryDelayMs: 0,
};

const dossierService = new DossierService(
  dossierRepo as any,
  supplementService,
  medicationService,
  llm as unknown as LlmClient,
  opts,
);
const controller = new DossierController(dossierService);
const app = express();
app.use(express.json());
app.use("/api/dossier", createDossierRoutes(controller));

const sampleSupplement: SupplementItem = {
  id: 123,
  name: "Vitamin D3",
  brand: "Now Foods",
  form: "capsule",
  defaultAmount: 1000,
  defaultUnit: "IU",
  notes: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ingredients: [
    {
      ingredientId: 1,
      ingredientName: "Cholecalciferol",
      amount: 1000,
      unit: "IU",
      sortOrder: 0,
    },
  ],
};

const sampleMedication: MedicationItem = {
  id: 7,
  name: "Lisinopril",
  brand: null,
  form: "tablet",
  defaultAmount: 10,
  defaultUnit: "mg",
  notes: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  dossierRepo.reset();
  supplementRepo.items.clear();
  medicationRepo.items.clear();
  llm.reset();
  supplementRepo.items.set(sampleSupplement.id, sampleSupplement);
  medicationRepo.items.set(sampleMedication.id, sampleMedication);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Dossier API", () => {
  describe("GET /:type/:id", () => {
    it("returns null when no dossier is cached", async () => {
      const res = await request(app)
        .get("/api/dossier/supplement/123")
        .expect(200);
      expect(res.body).toBeNull();
    });

    it("returns the cached entry when present", async () => {
      await dossierRepo.upsert({
        itemType: "supplement",
        itemId: 123,
        itemName: "Vitamin D3",
        itemBrand: "Now Foods",
        itemForm: "capsule",
        content: makeValidContent(),
        model: "qwen3-max-2026-01-23",
        inputTokens: 100,
        outputTokens: 200,
      });
      const res = await request(app)
        .get("/api/dossier/supplement/123")
        .expect(200);
      expect(res.body).toMatchObject({
        itemType: "supplement",
        itemId: 123,
        itemName: "Vitamin D3",
        content: { version: 1 },
      });
    });

    it("rejects unknown :type with 400", async () => {
      const res = await request(app)
        .get("/api/dossier/widget/123")
        .expect(400);
      expect(res.body.error).toMatch(/Invalid type/);
    });

    it("rejects non-numeric :id with 400", async () => {
      await request(app)
        .get("/api/dossier/supplement/abc")
        .expect(400);
    });
  });

  describe("POST /:type/:id/refresh", () => {
    it("calls the LLM, persists the dossier, logs ok usage", async () => {
      llm.queue.push(
        makeAssistantResponse(fenceJson(makeValidContent())),
      );

      const res = await request(app)
        .post("/api/dossier/supplement/123/refresh")
        .expect(200);

      expect(res.body).toMatchObject({
        itemType: "supplement",
        itemId: 123,
        itemName: "Vitamin D3",
        itemBrand: "Now Foods",
        model: "qwen3-max-2026-01-23",
        content: {
          version: 1,
          headline: expect.any(String),
          sections: expect.any(Array),
        },
      });
      expect(res.body.content.sections.length).toBeGreaterThanOrEqual(5);

      // Cached afterwards
      const cached = await dossierRepo.get("supplement", 123);
      expect(cached).not.toBeNull();

      // Single LLM call, status=ok logged
      expect(llm.calls).toHaveLength(1);
      expect(dossierRepo.usage).toHaveLength(1);
      expect(dossierRepo.usage[0]).toMatchObject({
        itemType: "supplement",
        itemId: 123,
        status: "ok",
        promptTokens: 1234,
        completionTokens: 567,
      });
    });

    it("retries once when first response is unparseable, succeeds second time", async () => {
      llm.queue.push(makeAssistantResponse("Sorry, I cannot help with that."));
      llm.queue.push(makeAssistantResponse(fenceJson(makeValidContent())));

      await request(app)
        .post("/api/dossier/supplement/123/refresh")
        .expect(200);

      expect(llm.calls).toHaveLength(2);
      expect(dossierRepo.usage.map((u) => u.status)).toEqual([
        "parse_error",
        "ok",
      ]);
    });

    it("strips hallucinated <tool_response> wrappers before parsing", async () => {
      const noisy =
        "<tool_response>{\"fake\":true}</tool_response>\n" +
        fenceJson(makeValidContent());
      llm.queue.push(makeAssistantResponse(noisy));

      const res = await request(app)
        .post("/api/dossier/supplement/123/refresh")
        .expect(200);
      expect(res.body.content.version).toBe(1);
      expect(llm.calls).toHaveLength(1);
      expect(dossierRepo.usage[0].status).toBe("ok");
    });

    it("returns 502 when both attempts fail validation", async () => {
      // First reply: parseable JSON but missing required fields
      const bad = { version: 1, headline: "x" }; // no sections, no sources, no disclaimer
      llm.queue.push(makeAssistantResponse(fenceJson(bad)));
      llm.queue.push(makeAssistantResponse(fenceJson(bad)));

      const res = await request(app)
        .post("/api/dossier/supplement/123/refresh")
        .expect(502);

      expect(res.body.error).toMatch(/schema|JSON/i);
      expect(llm.calls).toHaveLength(2);
      expect(dossierRepo.usage).toHaveLength(2);
      expect(dossierRepo.usage.every((u) => u.status === "validation_error"))
        .toBe(true);
    });

    it("returns 502 immediately on HTTP failure (no retry)", async () => {
      llm.queue.push(new LlmHttpError(500, "boom"));

      await request(app)
        .post("/api/dossier/supplement/123/refresh")
        .expect(502);

      expect(llm.calls).toHaveLength(1);
      expect(dossierRepo.usage).toHaveLength(1);
      expect(dossierRepo.usage[0].status).toBe("http_error");
    });

    it("returns 404 when the supplement is missing", async () => {
      llm.queue.push(makeAssistantResponse(fenceJson(makeValidContent())));
      const res = await request(app)
        .post("/api/dossier/supplement/9999/refresh")
        .expect(404);
      expect(res.body.error).toMatch(/not found/i);
      expect(llm.calls).toHaveLength(0); // never reached the LLM
    });

    it("works for medications", async () => {
      llm.queue.push(makeAssistantResponse(fenceJson(makeValidContent({
        headline: "Lisinopril is an ACE inhibitor.",
      }))));

      const res = await request(app)
        .post("/api/dossier/medication/7/refresh")
        .expect(200);

      expect(res.body.itemType).toBe("medication");
      expect(res.body.itemId).toBe(7);
      expect(res.body.content.headline).toMatch(/Lisinopril/);
    });

    it("rejects unknown :type with 400 before any LLM call", async () => {
      await request(app)
        .post("/api/dossier/widget/123/refresh")
        .expect(400);
      expect(llm.calls).toHaveLength(0);
    });
  });

  describe("DELETE /:type/:id", () => {
    it("removes a cached entry and returns 204", async () => {
      await dossierRepo.upsert({
        itemType: "supplement",
        itemId: 123,
        itemName: "Vitamin D3",
        itemBrand: "Now Foods",
        itemForm: "capsule",
        content: makeValidContent(),
        model: "qwen3-max-2026-01-23",
        inputTokens: null,
        outputTokens: null,
      });

      await request(app)
        .delete("/api/dossier/supplement/123")
        .expect(204);

      expect(await dossierRepo.get("supplement", 123)).toBeNull();
    });

    it("is idempotent — DELETE on missing entry still returns 204", async () => {
      await request(app)
        .delete("/api/dossier/supplement/999")
        .expect(204);
    });
  });
});

// Make sure NotFoundError imports aren't dead weight (silence unused).
void SupplementNotFoundError;
void MedicationNotFoundError;
