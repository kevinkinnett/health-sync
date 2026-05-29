import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { InsightController } from "../controllers/insightController.js";
import { createInsightRoutes } from "../routes/insights.js";
import { errorMapper } from "../middleware/errorMapper.js";

/**
 * Why this exists: `InsightController` has 8 handlers and ~10
 * branching paths (404 on missing id, 400 on bad payload, 500 on
 * service throw). None of those branches were covered before audit
 * Phase 5.2.
 *
 * Mounts the routes against in-memory fake collaborators so each
 * status-code path can be exercised cheaply.
 */

interface FakeJob {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  progress: number;
  statusMessage: string;
  categories: Array<{ key: string; title: string; status: string; rounds: number; toolsCalled: string[] }>;
}

class FakeRepo {
  generations: Array<{
    generationId: string;
    category: string;
    title: string;
    content: string;
    dateFrom: string;
    dateTo: string;
    createdAt: string;
  }> = [];
  conversationMessages: Array<{
    role: "user" | "assistant" | "tool";
    content: string | null;
    createdAt: string;
  }> = [];
  conversationSummaries: Array<{
    conversationId: string;
    preview: string;
    messageCount: number;
    lastMessageAt: string;
  }> = [];

  async listGenerations() {
    const seen = new Set<string>();
    return this.generations
      .filter((r) => !seen.has(r.generationId) && seen.add(r.generationId))
      .map((r) => ({
        generationId: r.generationId,
        createdAt: r.createdAt,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
        categoryCount: this.generations.filter(
          (g) => g.generationId === r.generationId,
        ).length,
      }));
  }
  async getGeneration(id: string) {
    return this.generations.filter((r) => r.generationId === id).map((r) => ({
      ...r,
      id: 1,
    }));
  }
  async deleteGeneration(id: string) {
    const before = this.generations.length;
    this.generations = this.generations.filter((r) => r.generationId !== id);
    return before - this.generations.length;
  }
  async getDisplayConversation(_id: string) {
    return this.conversationMessages.map((r) => ({
      id: 1,
      conversationId: _id,
      role: r.role,
      content: r.content,
      toolCalls: null,
      toolCallId: null,
      toolName: null,
      createdAt: r.createdAt,
    }));
  }
  async listConversations() {
    return this.conversationSummaries;
  }
  async deleteConversation(_id: string) {
    return this.conversationSummaries.length > 0 ? 1 : 0;
  }
}

class FakeJobs {
  jobs = new Map<string, FakeJob>();
  start = vi.fn(() => {
    const jobId = `job-${this.jobs.size + 1}`;
    this.jobs.set(jobId, {
      jobId,
      status: "running",
      startedAt: new Date().toISOString(),
      progress: 10,
      statusMessage: "Analyzing…",
      categories: [],
    });
    return jobId;
  });
  get(jobId: string) {
    return this.jobs.get(jobId);
  }
}

class FakeChat {
  send = vi.fn(async (input: { conversationId?: string; message: string }) => ({
    conversationId: input.conversationId ?? "conv-new",
    message: { role: "assistant" as const, content: `Echo: ${input.message}` },
    meta: { sanitized: false, placeholder: false, toolsCalled: [], rounds: 1 },
  }));
}

function buildApp(repo: FakeRepo, jobs: FakeJobs, chat: FakeChat) {
  const controller = new InsightController(
    repo as never,
    jobs as never,
    chat as never,
  );
  const app = express();
  app.use(express.json());
  app.use("/api/insights", createInsightRoutes(controller));
  app.use(errorMapper);
  return app;
}

describe("InsightController", () => {
  let repo: FakeRepo;
  let jobs: FakeJobs;
  let chat: FakeChat;
  let app: express.Express;

  beforeEach(() => {
    repo = new FakeRepo();
    jobs = new FakeJobs();
    chat = new FakeChat();
    app = buildApp(repo, jobs, chat);
  });

  // ------ Reports -----------------------------------------------------

  describe("POST /generate", () => {
    it("kicks off a job and returns the jobId", async () => {
      const res = await request(app).post("/api/insights/generate").send({});
      expect(res.status).toBe(200);
      expect(res.body.jobId).toMatch(/^job-/);
      expect(jobs.start).toHaveBeenCalledWith({
        dateFrom: undefined,
        dateTo: undefined,
      });
    });
    it("forwards dateFrom/dateTo from the request body", async () => {
      await request(app)
        .post("/api/insights/generate")
        .send({ dateFrom: "2026-04-01", dateTo: "2026-05-01" });
      expect(jobs.start).toHaveBeenCalledWith({
        dateFrom: "2026-04-01",
        dateTo: "2026-05-01",
      });
    });
  });

  describe("GET /generate/status/:jobId", () => {
    it("returns the in-memory job state", async () => {
      const jobId = jobs.start();
      const res = await request(app).get(
        `/api/insights/generate/status/${jobId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.jobId).toBe(jobId);
      expect(res.body.status).toBe("running");
    });
    it("returns 404 when the jobId is unknown", async () => {
      const res = await request(app).get(
        "/api/insights/generate/status/job-does-not-exist",
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });
  });

  describe("GET /list", () => {
    it("returns the generation summaries", async () => {
      repo.generations.push(
        {
          generationId: "gen-1",
          category: "activity",
          title: "Activity",
          content: "a",
          dateFrom: "2026-04-01",
          dateTo: "2026-05-01",
          createdAt: "2026-05-01T12:00:00Z",
        },
      );
      const res = await request(app).get("/api/insights/list");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].generationId).toBe("gen-1");
    });
  });

  describe("GET /:generationId", () => {
    it("returns 404 when the generation has no rows", async () => {
      const res = await request(app).get("/api/insights/gen-does-not-exist");
      expect(res.status).toBe(404);
    });
    it("returns the categories payload on success", async () => {
      repo.generations.push({
        generationId: "gen-1",
        category: "activity",
        title: "Activity",
        content: "the body",
        dateFrom: "2026-04-01",
        dateTo: "2026-05-01",
        createdAt: "2026-05-01T12:00:00Z",
      });
      const res = await request(app).get("/api/insights/gen-1");
      expect(res.status).toBe(200);
      expect(res.body.generationId).toBe("gen-1");
      expect(res.body.categories[0].content).toBe("the body");
    });
  });

  describe("DELETE /:generationId", () => {
    it("returns 404 when nothing was deleted", async () => {
      const res = await request(app).delete("/api/insights/gen-does-not-exist");
      expect(res.status).toBe(404);
    });
    it("returns the deleted count when the generation existed", async () => {
      repo.generations.push({
        generationId: "gen-1",
        category: "activity",
        title: "Activity",
        content: "a",
        dateFrom: "2026-04-01",
        dateTo: "2026-05-01",
        createdAt: "2026-05-01T12:00:00Z",
      });
      const res = await request(app).delete("/api/insights/gen-1");
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(1);
    });
  });

  // ------ Chat --------------------------------------------------------

  describe("POST /chat", () => {
    it("rejects an empty message with 400", async () => {
      const res = await request(app).post("/api/insights/chat").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/message required/i);
    });
    it("rejects a whitespace-only message with 400", async () => {
      const res = await request(app)
        .post("/api/insights/chat")
        .send({ message: "    " });
      expect(res.status).toBe(400);
    });
    it("forwards to the chat service and returns its result", async () => {
      const res = await request(app)
        .post("/api/insights/chat")
        .send({ message: "How is my sleep?" });
      expect(res.status).toBe(200);
      expect(res.body.message.content).toMatch(/Echo: How is my sleep/);
      expect(chat.send).toHaveBeenCalledWith({
        conversationId: undefined,
        message: "How is my sleep?",
      });
    });
    it("forwards an existing conversationId for follow-ups", async () => {
      await request(app)
        .post("/api/insights/chat")
        .send({ conversationId: "conv-1", message: "follow up" });
      expect(chat.send).toHaveBeenCalledWith({
        conversationId: "conv-1",
        message: "follow up",
      });
    });
  });

  describe("GET /chat/:conversationId", () => {
    it("returns the display transcript", async () => {
      repo.conversationMessages.push(
        { role: "user", content: "hi", createdAt: "2026-05-01T12:00:00Z" },
        { role: "assistant", content: "hello", createdAt: "2026-05-01T12:00:01Z" },
      );
      const res = await request(app).get("/api/insights/chat/conv-1");
      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(2);
      expect(res.body.messages[0].role).toBe("user");
    });
  });

  describe("DELETE /chat/:conversationId", () => {
    it("returns 404 when no rows match", async () => {
      const res = await request(app).delete("/api/insights/chat/conv-none");
      expect(res.status).toBe(404);
    });
    it("returns the deleted count when something existed", async () => {
      repo.conversationSummaries.push({
        conversationId: "conv-1",
        preview: "hi",
        messageCount: 2,
        lastMessageAt: "2026-05-01T12:00:00Z",
      });
      const res = await request(app).delete("/api/insights/chat/conv-1");
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(1);
    });
  });
});
