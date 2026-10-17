import type { Request, Response } from "express";
import { logger } from "../logger.js";
import type { InsightRepository } from "../repositories/insightRepo.js";
import {
  InsightJobConflictError,
  type InsightJobManager,
} from "../services/insightJobs.js";
import { addDays } from "../services/userTz.js";
import type { InsightChatService } from "../services/insightChatService.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Generation and conversation ids are server-minted UUIDs. */
function isUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Optional `YYYY-MM-DD` body field. Returns `null` for a malformed value so
 * the caller can 400 before a paid generation starts.
 */
function optionalDate(raw: unknown): string | undefined | null {
  if (raw == null || raw === "") return undefined;
  if (typeof raw !== "string" || !DATE_RE.test(raw) || addDays(raw, 0) !== raw) {
    return null;
  }
  return raw;
}

export class InsightController {
  constructor(
    private repo: InsightRepository,
    private jobs: InsightJobManager,
    private chat: InsightChatService,
  ) {}

  // ------ Reports ------------------------------------------------------

  async generate(req: Request, res: Response): Promise<void> {
    const dateFrom = optionalDate(req.body?.dateFrom);
    const dateTo = optionalDate(req.body?.dateTo);
    if (dateFrom === null || dateTo === null) {
      res.status(400).json({ error: "dateFrom and dateTo must be YYYY-MM-DD dates" });
      return;
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      res.status(400).json({ error: "dateFrom must be <= dateTo" });
      return;
    }
    try {
      const jobId = this.jobs.start({ dateFrom, dateTo });
      res.json({ jobId });
    } catch (err) {
      if (err instanceof InsightJobConflictError) {
        res.status(409).json({ error: err.message, jobId: err.jobId });
        return;
      }
      logger.error({ err }, "Failed to start insight generation");
      res.status(500).json({ error: "Failed to start generation" });
    }
  }

  async generateStatus(req: Request, res: Response): Promise<void> {
    const job = this.jobs.get(String(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  }

  async listGenerations(_req: Request, res: Response): Promise<void> {
    try {
      const list = await this.repo.listGenerations(50);
      res.json(list);
    } catch (err) {
      logger.error({ err }, "Failed to list insight generations");
      res.status(500).json({ error: "Failed to list generations" });
    }
  }

  async getGeneration(req: Request, res: Response): Promise<void> {
    if (!isUuid(req.params.generationId)) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }
    try {
      const rows = await this.repo.getGeneration(String(req.params.generationId));
      if (rows.length === 0) {
        res.status(404).json({ error: "Generation not found" });
        return;
      }
      res.json({
        generationId: String(req.params.generationId),
        dateFrom: rows[0].dateFrom,
        dateTo: rows[0].dateTo,
        createdAt: rows[0].createdAt,
        categories: rows.map((r) => ({
          key: r.category,
          title: r.title,
          content: r.content,
        })),
      });
    } catch (err) {
      logger.error({ err }, "Failed to fetch insight generation");
      res.status(500).json({ error: "Failed to fetch generation" });
    }
  }

  async deleteGeneration(req: Request, res: Response): Promise<void> {
    if (!isUuid(req.params.generationId)) {
      res.status(404).json({ error: "Generation not found" });
      return;
    }
    try {
      const n = await this.repo.deleteGeneration(String(req.params.generationId));
      if (n === 0) {
        res.status(404).json({ error: "Generation not found" });
        return;
      }
      res.json({ deleted: n });
    } catch (err) {
      logger.error({ err }, "Failed to delete insight generation");
      res.status(500).json({ error: "Failed to delete generation" });
    }
  }

  // ------ Chat --------------------------------------------------------

  async chatSend(req: Request, res: Response): Promise<void> {
    try {
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      if (!message) {
        res.status(400).json({ error: "message required" });
        return;
      }
      const rawId = req.body?.conversationId;
      if (rawId != null && !isUuid(rawId)) {
        res.status(400).json({ error: "conversationId must be a UUID" });
        return;
      }
      const conversationId = rawId ?? undefined;
      const result = await this.chat.send({ conversationId, message });
      res.json(result);
    } catch (err) {
      // Details stay in the log; the loop already turns LLM failures into
      // placeholder answers, so anything reaching here is internal.
      logger.error({ err }, "Chat completion failed");
      res.status(500).json({ error: "Chat completion failed" });
    }
  }

  async chatGetConversation(req: Request, res: Response): Promise<void> {
    if (!isUuid(req.params.conversationId)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    try {
      const conversationId = String(req.params.conversationId);
      const [rows, pendingActions] = await Promise.all([
        this.repo.getDisplayConversation(conversationId),
        this.chat.listPendingActions(conversationId),
      ]);
      res.json({
        conversationId,
        messages: rows.map((r) => ({
          role: r.role,
          content: r.content,
          createdAt: r.createdAt,
        })),
        pendingActions,
      });
    } catch (err) {
      logger.error({ err }, "Failed to fetch conversation");
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  }

  async chatListConversations(_req: Request, res: Response): Promise<void> {
    try {
      const list = await this.repo.listConversations(20);
      res.json(list);
    } catch (err) {
      logger.error({ err }, "Failed to list conversations");
      res.status(500).json({ error: "Failed to list conversations" });
    }
  }

  async chatDeleteConversation(req: Request, res: Response): Promise<void> {
    if (!isUuid(req.params.conversationId)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    try {
      const n = await this.repo.deleteConversation(String(req.params.conversationId));
      if (n === 0) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.json({ deleted: n });
    } catch (err) {
      logger.error({ err }, "Failed to delete conversation");
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  }
}
