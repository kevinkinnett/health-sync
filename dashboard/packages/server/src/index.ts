import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { ActivityRepository } from "./repositories/activityRepo.js";
import { SleepRepository } from "./repositories/sleepRepo.js";
import { HeartRateRepository } from "./repositories/heartRateRepo.js";
import { WeightRepository } from "./repositories/weightRepo.js";
import { HrvRepository } from "./repositories/hrvRepo.js";
import { ExerciseLogRepository } from "./repositories/exerciseLogRepo.js";
import { IngestRepository } from "./repositories/ingestRepo.js";
import { HealthDataService } from "./services/healthDataService.js";
import { IngestService } from "./services/ingestService.js";
import { HealthController } from "./controllers/healthController.js";
import { IngestController } from "./controllers/ingestController.js";
import { createHealthRoutes } from "./routes/health.js";
import { createIngestRoutes } from "./routes/ingest.js";

const config = loadConfig();
const pool = createPool(config.db);

// Repositories
const activityRepo = new ActivityRepository(pool);
const sleepRepo = new SleepRepository(pool);
const heartRateRepo = new HeartRateRepository(pool);
const weightRepo = new WeightRepository(pool);
const hrvRepo = new HrvRepository(pool);
const exerciseLogRepo = new ExerciseLogRepository(pool);
const ingestRepo = new IngestRepository(pool);

// Services
const healthDataService = new HealthDataService(
  activityRepo,
  sleepRepo,
  heartRateRepo,
  weightRepo,
  hrvRepo,
  exerciseLogRepo,
);
const ingestService = new IngestService(ingestRepo, config.windmill);

// Controllers
const healthController = new HealthController(healthDataService);
const ingestController = new IngestController(ingestService);

// App
const app: Express = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health-check", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", dbConnected: true });
  } catch {
    res.status(503).json({ status: "error", dbConnected: false });
  }
});

// Routes
app.use("/api/health", createHealthRoutes(healthController));
app.use("/api/ingest", createIngestRoutes(ingestController));

// Serve client static files in production (single-container mode)
// In Docker: dist/public/  In dev: ../../client/dist/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, "public");
app.use(express.static(clientDir));
app.get("/{*splat}", (_req, res, next) => {
  // Only serve index.html for non-API routes (SPA fallback)
  if (_req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDir, "index.html"), (err) => {
    if (err) next();
  });
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});

export { app };
