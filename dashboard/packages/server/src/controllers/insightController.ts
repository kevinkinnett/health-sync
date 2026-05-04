import type { Request, Response } from "express";
import { logger } from "../logger.js";
import type { InsightRepository } from "../repositories/insightRepo.js";
import type { InsightJobManager } from "../services/insightJobs.js";
import type { InsightChatService } from "../services/insightChatService.js";

export class InsightController {
  constructor(
    private repo: InsightRepository,
    private jobs: InsightJobManager,
    private chat: InsightChatService,
  ) {}

  // ------ Reports ------------------------------------------------------

  async generate(req: Request, res: Response): Promise<void> {
    try {
      const dateFrom = typeof req.body?.dateFrom === "string" ? req.body.dateFrom : undefined;
      const dateTo = typeof req.body?.dateTo === "string" ? req.body.dateTo : undefined;
      const jobId = this.jobs.start({ dateFrom, dateTo });
      res.json({ jobId });
    } catch (err) {
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
      const conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;
      const result = await this.chat.send({ conversationId, message });
      res.json(result);
    } catch (err) {
      logger.error({ err }, "Chat completion failed");
      res.status(500).json({ error: "Chat completion failed", message: (err as Error).message });
    }
  }

  async chatGetConversation(req: Request, res: Response): Promise<void> {
    try {
      const rows = await this.repo.getDisplayConversation(String(req.params.conversationId));
      res.json({
        conversationId: String(req.params.conversationId),
        messages: rows.map((r) => ({
          role: r.role,
          content: r.content,
          createdAt: r.createdAt,
        })),
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
