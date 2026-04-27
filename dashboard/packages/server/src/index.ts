import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { createPool } from "./db.js";
import { ActivityRepository } from "./repositories/activityRepo.js";
import { SleepRepository } from "./repositories/sleepRepo.js";
import { HeartRateRepository } from "./repositories/heartRateRepo.js";
import { WeightRepository } from "./repositories/weightRepo.js";
import { HrvRepository } from "./repositories/hrvRepo.js";
import { ExerciseLogRepository } from "./repositories/exerciseLogRepo.js";
import { IngestRepository } from "./repositories/ingestRepo.js";
import { SupplementRepository } from "./repositories/supplementRepo.js";
import { MedicationRepository } from "./repositories/medicationRepo.js";
import { DossierRepository } from "./repositories/dossierRepo.js";
import { HealthDataService } from "./services/healthDataService.js";
import { IngestService } from "./services/ingestService.js";
import { SupplementService } from "./services/supplementService.js";
import { MedicationService } from "./services/medicationService.js";
import { LlmClient } from "./services/llmClient.js";
import { DossierService } from "./services/dossierService.js";
import { AnalyticsService } from "./services/analyticsService.js";
import { HealthController } from "./controllers/healthController.js";
import { IngestController } from "./controllers/ingestController.js";
import { SupplementController } from "./controllers/supplementController.js";
import { MedicationController } from "./controllers/medicationController.js";
import { DossierController } from "./controllers/dossierController.js";
import { AnalyticsController } from "./controllers/analyticsController.js";
import { createHealthRoutes } from "./routes/health.js";
import { createIngestRoutes } from "./routes/ingest.js";
import { createSupplementRoutes } from "./routes/supplement.js";
import { createMedicationRoutes } from "./routes/medication.js";
import { createDossierRoutes } from "./routes/dossier.js";
import { createAnalyticsRoutes } from "./routes/analytics.js";
import { createConfigRoutes } from "./routes/config.js";

const config = loadConfig();
const pool = createPool(config.db);

pool.on("error", (err) => {
  logger.error({ err }, "Database pool error");
});

// Repositories
const activityRepo = new ActivityRepository(pool);
const sleepRepo = new SleepRepository(pool);
const heartRateRepo = new HeartRateRepository(pool);
const weightRepo = new WeightRepository(pool);
const hrvRepo = new HrvRepository(pool);
const exerciseLogRepo = new ExerciseLogRepository(pool);
const ingestRepo = new IngestRepository(pool);
const supplementRepo = new SupplementRepository(pool);
const medicationRepo = new MedicationRepository(pool);
const dossierRepo = new DossierRepository(pool);

// Ensure user-input tables exist before serving traffic
await supplementRepo.ensureTables();
await medicationRepo.ensureTables();
await dossierRepo.ensureTables();

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
const supplementService = new SupplementService(supplementRepo);
const medicationService = new MedicationService(medicationRepo);
const llmClient = new LlmClient({
  baseUrl: config.llm.baseUrl,
  apiKey: config.llm.apiKey,
});
const dossierService = new DossierService(
  dossierRepo,
  supplementService,
  medicationService,
  llmClient,
  { model: config.llm.dossierModel },
);
const analyticsService = new AnalyticsService(
  supplementRepo,
  medicationRepo,
  activityRepo,
  sleepRepo,
  heartRateRepo,
  hrvRepo,
  { userTimezone: config.userTimezone },
);

// Controllers
const healthController = new HealthController(healthDataService, {
  userTimezone: config.userTimezone,
});
const ingestController = new IngestController(ingestService);
const supplementController = new SupplementController(supplementService);
const medicationController = new MedicationController(medicationService);
const dossierController = new DossierController(dossierService);
const analyticsController = new AnalyticsController(analyticsService, {
  userTimezone: config.userTimezone,
});

// App
const app: Express = express();
app.use(cors());
app.use(express.json());
app.use(requestLogger);

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
app.use("/api/config", createConfigRoutes({ userTimezone: config.userTimezone }));
app.use("/api/health", createHealthRoutes(healthController));
app.use("/api/ingest", createIngestRoutes(ingestController));
app.use("/api/supplements", createSupplementRoutes(supplementController));
app.use("/api/medications", createMedicationRoutes(medicationController));
app.use("/api/dossier", createDossierRoutes(dossierController));
app.use("/api/analytics", createAnalyticsRoutes(analyticsController));

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
  logger.info({ port: config.port }, "Server started");
});

export { app };
