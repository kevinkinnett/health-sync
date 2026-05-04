import { Router } from "express";
import type { InsightController } from "../controllers/insightController.js";

export function createInsightRoutes(controller: InsightController): Router {
  const router = Router();

  // Reports — async-job pattern. POST returns jobId immediately, the
  // client polls /generate/status/:jobId every 2s.
  router.post("/generate", (req, res) => controller.generate(req, res));
  router.get("/generate/status/:jobId", (req, res) =>
    controller.generateStatus(req, res),
  );
  router.get("/list", (req, res) => controller.listGenerations(req, res));
  router.get("/:generationId", (req, res) =>
    controller.getGeneration(req, res),
  );
  router.delete("/:generationId", (req, res) =>
    controller.deleteGeneration(req, res),
  );

  // Chat — single completion per POST. The conversationId rolls forward
  // turn-to-turn so the model sees the full transcript including tool
  // results from prior rounds.
  router.post("/chat", (req, res) => controller.chatSend(req, res));
  router.get("/chat/conversations", (req, res) =>
    controller.chatListConversations(req, res),
  );
  router.get("/chat/:conversationId", (req, res) =>
    controller.chatGetConversation(req, res),
  );
  router.delete("/chat/:conversationId", (req, res) =>
    controller.chatDeleteConversation(req, res),
  );

  return router;
}
