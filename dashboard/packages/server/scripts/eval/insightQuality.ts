/**
 * Insight-quality evaluation: runs the CURRENT experiment and recovery
 * event-study engines on real data, read-only, and checks them against
 * placebo and shifted changepoints.
 *
 * Usage (from packages/server, with the dashboard .env loaded):
 *   set -a && source ../../.env && set +a
 *   pnpm exec tsx scripts/eval/insightQuality.ts --refresh   # fetch/refresh the snapshot
 *   pnpm exec tsx scripts/eval/insightQuality.ts             # re-run on the cached snapshot
 *
 * Options: --today YYYY-MM-DD (default: the snapshot's date, America/New_York),
 *          --step N (placebo spacing in days, default 7).
 *
 * Real data lands only in `scripts/eval/.snapshot/` (gitignored): the raw
 * snapshot and the full per-run results. What is printed is aggregated.
 *
 * The real repositories run unmodified on a `SnapshotPool`, so what this
 * measures is what production computes — not a re-implementation of it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import type { Intervention, RecoveryEffectOutcome } from "@health-dashboard/shared";
import { SnapshotPool, type Snapshot } from "../../src/services/evaluation/snapshotPool.js";
import {
  eventStudyNull,
  eventStudyPower,
  peakOffset,
  placeboDates,
  placeboExceedance,
  placeboIntervention,
  quantile,
  runPlacebos,
  runShifted,
  summarizePlacebos,
  type PlaceboRun,
  type ShiftRow,
} from "../../src/services/evaluation/counterfactuals.js";
import { fetchViaWindmill } from "./windmillFetch.js";
import { ActivityRepository } from "../../src/repositories/activityRepo.js";
import { SleepRepository } from "../../src/repositories/sleepRepo.js";
import { HeartRateRepository } from "../../src/repositories/heartRateRepo.js";
import { WeightRepository } from "../../src/repositories/weightRepo.js";
import { HrvRepository } from "../../src/repositories/hrvRepo.js";
import { ExerciseLogRepository } from "../../src/repositories/exerciseLogRepo.js";
import { Spo2Repository } from "../../src/repositories/spo2Repo.js";
import { BreathingRateRepository } from "../../src/repositories/breathingRateRepo.js";
import { SkinTempRepository } from "../../src/repositories/skinTempRepo.js";
import { CardioScoreRepository } from "../../src/repositories/cardioScoreRepo.js";
import { EightSleepRepository } from "../../src/repositories/eightSleepRepo.js";
import { FoodRepository } from "../../src/repositories/foodRepo.js";
import { TeslaDriveRepository } from "../../src/repositories/teslaDriveRepo.js";
import { RecoveryRepository } from "../../src/repositories/recoveryRepo.js";
import { InterventionRepository } from "../../src/repositories/interventionRepo.js";
import { HealthDataService } from "../../src/services/healthDataService.js";
import { HealthSeriesSource } from "../../src/services/experiments/healthSeriesSource.js";
import { ExperimentService } from "../../src/services/experiments/experimentService.js";
import { pickHeadline } from "../../src/services/experiments/headline.js";
import { METRIC_SPECS } from "../../src/services/experiments/metricRegistry.js";
import { RecoveryAnalysisDatasetBuilder } from "../../src/services/recoveryAnalysisDataset.js";
import { RecoveryEventStudyService } from "../../src/services/recoveryEventStudyService.js";
import { RECOVERY_OUTCOMES } from "../../src/services/analysis/recoveryEffectEngine.js";
import { addDays, formatDateInTz } from "../../src/services/userTz.js";

const TZ = "America/New_York";
const here = dirname(fileURLToPath(import.meta.url));
const snapshotDir = join(here, ".snapshot");
const snapshotFile = join(snapshotDir, "snapshot.json");
const resultsFile = join(snapshotDir, "results.json");

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

function loadSnapshot(): Snapshot {
  if (!existsSync(snapshotFile)) return { takenAt: new Date().toISOString(), results: {} };
  return JSON.parse(readFileSync(snapshotFile, "utf8")) as Snapshot;
}

function saveSnapshot(snapshot: Snapshot): void {
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(snapshotFile, JSON.stringify(snapshot));
}

function wire(pool: Pool) {
  const activityRepo = new ActivityRepository(pool);
  const sleepRepo = new SleepRepository(pool);
  const heartRateRepo = new HeartRateRepository(pool);
  const hrvRepo = new HrvRepository(pool);
  const exerciseLogRepo = new ExerciseLogRepository(pool);
  const eightSleepRepo = new EightSleepRepository(pool);
  const health = new HealthDataService(
    activityRepo, sleepRepo, heartRateRepo, new WeightRepository(pool), hrvRepo, exerciseLogRepo,
    new Spo2Repository(pool), new BreathingRateRepository(pool), new SkinTempRepository(pool),
    new CardioScoreRepository(pool), eightSleepRepo, new FoodRepository(pool),
    new TeslaDriveRepository(pool), { userTimezone: TZ },
  );
  const interventions = new InterventionRepository(pool);
  const series = new HealthSeriesSource(health);
  const dataset = new RecoveryAnalysisDatasetBuilder(
    new RecoveryRepository(pool), sleepRepo, heartRateRepo, hrvRepo, eightSleepRepo, exerciseLogRepo, health, TZ,
  );
  return {
    interventions,
    series,
    experiments: new ExperimentService(interventions, series),
    dataset,
    eventStudy: new RecoveryEventStudyService(dataset, TZ),
  };
}

type Wired = ReturnType<typeof wire>;

const round = (v: number | null | undefined, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Known changes the engine should see. Dates from the ground truth, not the DB. */
const KNOWN_EFFECTS = [
  { label: "Eight Sleep Pod", date: "2026-05-02", metrics: ["efficiency", "sleepMin", "wakeMin", "remMin", "inBedMin"] },
  { label: "Google Health cutover (measurement)", date: "2026-06-12", metrics: ["dailyRmssd", "efficiency"] },
  { label: "Strength training 3x/week", date: "2026-07-06", metrics: ["activeMinutes", "steps", "restingHr"] },
];

async function evaluate(w: Wired, today: string, step: number) {
  const all: Intervention[] = await w.interventions.findAll();

  // 1. The real reports, exactly as the API would build them.
  const real = [];
  for (const intervention of [...all].sort((a, b) => a.startedOn.localeCompare(b.startedOn))) {
    const report = await w.experiments.report(intervention.id, today);
    real.push({
      id: intervention.id,
      name: intervention.name,
      startedOn: intervention.startedOn,
      endedOn: intervention.endedOn,
      before: report.before,
      after: report.after,
      confidence: report.confidence,
      summary: report.summary,
      headline: pickHeadline(report.metrics)?.metric ?? null,
      confounds: report.confounds.map((c) => ({ kind: c.kind, severity: c.severity, date: c.date ?? null })),
      metrics: report.metrics.map((m) => ({
        metric: m.metric, beforeN: m.before.n, afterN: m.after.n, before: m.before.mean, after: m.after.mean,
        delta: m.delta, deltaPct: m.deltaPct, d: m.effectSize, meaningful: m.meaningful, improved: m.improved,
      })),
    });
  }

  // 2. Placebo changepoints across the whole history, two window lengths.
  const firstSleep = (await w.series.fetch("sleepMin", "2000-01-01", today))[0]?.date ?? "2024-01-01";
  const placebo: Record<string, { runs: PlaceboRun[]; summary: ReturnType<typeof summarizePlacebos>; cleanSummary: ReturnType<typeof summarizePlacebos> }> = {};
  const windowLengths = [...new Set([30, 90, ...real.map((x) => x.after.days)])].sort((a, b) => a - b);
  for (const windowDays of windowLengths) {
    const dates = placeboDates(addDays(firstSleep, windowDays), addDays(today, -windowDays), step);
    const runs = await runPlacebos({ series: w.series, realInterventions: all, dates, windowDays, today });
    placebo[windowDays] = {
      runs,
      summary: summarizePlacebos(runs),
      cleanSummary: summarizePlacebos(runs.filter((r) => r.clean)),
    };
  }

  // 3. Shifted changepoints around each known effect, fixed 30-day windows.
  const offsets = Array.from({ length: 57 }, (_, i) => i - 28);
  const shifted: { label: string; date: string; windowDays: number; rows: ShiftRow[]; peaks: Record<string, number | null> }[] = [];
  for (const known of KNOWN_EFFECTS) {
    for (const windowDays of [14, 30]) {
      const subject = all.find((i) => i.startedOn === known.date) ?? placeboIntervention(known.date, windowDays);
      const rows = await runShifted({ series: w.series, intervention: subject, others: all, offsets, windowDays, today });
      shifted.push({
        label: known.label,
        date: known.date,
        windowDays,
        rows,
        peaks: Object.fromEntries(known.metrics.map((m) => [m, peakOffset(rows, m)])),
      });
    }
  }

  // 4. How unusual is each known effect against clean 30-day placebos?
  const nullByMetric = new Map(placebo[30].cleanSummary.perMetric.map((m) => [m.metric, m.nullAbsEffect]));
  const exceedance = shifted.filter((s) => s.windowDays === 30).map((s) => {
    const atTrue = s.rows.find((r) => r.offset === 0);
    return {
      label: s.label,
      metrics: METRIC_SPECS.map((spec) => {
        const d = atTrue?.metrics[spec.key]?.effectSize ?? null;
        return {
          metric: spec.key,
          d,
          meaningful: atTrue?.metrics[spec.key]?.meaningful ?? false,
          exceedance: d == null ? null : round(placeboExceedance(nullByMetric.get(spec.key) ?? [], Math.abs(d)), 3),
        };
      }),
    };
  });

  // 4b. Each real report's metrics against clean placebos of its own window length.
  const realVsNull = real.map((x) => {
    const nulls = new Map(placebo[x.after.days].cleanSummary.perMetric.map((m) => [m.metric, m.nullAbsEffect]));
    return {
      name: x.name,
      windowDays: x.after.days,
      metrics: x.metrics.map((m) => ({
        metric: m.metric,
        d: m.d,
        meaningful: m.meaningful,
        nullP95: round(quantile(nulls.get(m.metric) ?? [], 0.95)),
        exceedance: m.d == null ? null : round(placeboExceedance(nulls.get(m.metric) ?? [], Math.abs(m.d)), 3),
      })),
    };
  });

  // 4c. The biggest "effects" at clean placebo dates — unlogged changes, or pure drift.
  const largestPlacebos = ["efficiency", "wakeMin", "restingHr", "dailyRmssd", "activeMinutes"].map((metric) => ({
    metric,
    top: placebo[30].runs
      .filter((run) => run.clean && run.metrics[metric]?.effectSize != null)
      .sort((a, b) => Math.abs(b.metrics[metric].effectSize!) - Math.abs(a.metrics[metric].effectSize!))
      .slice(0, 3)
      .map((run) => ({ date: run.date, d: run.metrics[metric].effectSize, delta: run.metrics[metric].delta })),
  }));

  // 5. Recovery event study: real, plus the null band at the same event count.
  const dataset = await w.dataset.build(today);
  const recovery = [];
  for (const activity of dataset.activities) {
    for (const outcome of RECOVERY_OUTCOMES) {
      const study = await w.eventStudy.get(today, activity.id, outcome.key as RecoveryEffectOutcome);
      const nullBand = study.eligibleEvents >= 3
        ? eventStudyNull(dataset.periods, {
            outcome: outcome.key as RecoveryEffectOutcome,
            eventsPerDraw: study.eligibleEvents,
            draws: 400,
            seed: `${activity.id}:${outcome.key}`,
          })
        : [];
      recovery.push({
        activity: activity.name,
        outcome: outcome.key,
        totalSessions: study.totalSessions,
        eligibleEvents: study.eligibleEvents,
        matchedPairs: study.matchedPairs,
        evidenceState: study.evidenceState,
        aggregate: study.aggregate.map((p) => {
          const band = nullBand.find((b) => b.offsetDays === p.offsetDays);
          return {
            offsetDays: p.offsetDays,
            n: p.sampleCount,
            medianDelta: p.medianDelta,
            nullP90: band?.absMedianDeltaP90 ?? null,
            nullP95: band?.absMedianDeltaP95 ?? null,
            insideNull: band?.absMedianDeltaP95 == null ? null : Math.abs(p.medianDelta) <= band.absMedianDeltaP95,
          };
        }),
        nullBand,
        matchedEstimate: study.matchedEstimate,
      });
    }
  }
  // A larger synthetic-count null, to show how the band narrows as sessions accrue.
  const nullBySize = [3, 5, 10, 20].map((events) => ({
    events,
    sleepEfficiency: eventStudyNull(dataset.periods, { outcome: "sleep_efficiency", eventsPerDraw: events, draws: 300, seed: `size:${events}` })
      .filter((p) => p.offsetDays >= 0 && p.offsetDays <= 1),
    hrv: eventStudyNull(dataset.periods, { outcome: "hrv", eventsPerDraw: events, draws: 300, seed: `size-hrv:${events}` })
      .filter((p) => p.offsetDays >= 0 && p.offsetDays <= 1),
  }));

  // Power: plant a known effect on random nights and see whether the study recovers it.
  const power = [3, 5, 10, 20].map((events) => {
    const plants = [
      { outcome: "sleep_efficiency" as const, plant: { offsetDays: 0, delta: 3 } },
      { outcome: "hrv" as const, plant: { offsetDays: 1, delta: 5 } },
    ];
    return {
      events,
      results: plants.map(({ outcome, plant }) => {
        const band = eventStudyNull(dataset.periods, { outcome, eventsPerDraw: events, draws: 300, seed: `band:${outcome}:${events}` })
          .find((p) => p.offsetDays === plant.offsetDays);
        const threshold = band?.absMedianDeltaP95 ?? Infinity;
        return {
          outcome,
          plant,
          nullP95: threshold,
          ...eventStudyPower(dataset.periods, { outcome, eventsPerDraw: events, draws: 300, seed: `power:${outcome}:${events}`, plant, threshold }),
        };
      }),
    };
  });

  return { today, real, placebo, shifted, exceedance, realVsNull, largestPlacebos, recovery, nullBySize, power, periods: dataset.periods.length };
}

function printReport(r: Awaited<ReturnType<typeof evaluate>>): void {
  const out: string[] = [];
  out.push(`# Insight-quality run — today=${r.today}`);
  out.push("\n## Real interventions");
  for (const x of r.real) {
    out.push(`\n### ${x.name} (${x.startedOn}${x.endedOn ? `→${x.endedOn}` : "→"}) windows ${x.before.start}..${x.before.end} | ${x.after.start}..${x.after.end} (${x.after.days}d)`);
    out.push(`confidence=${x.confidence} headline=${x.headline} summary="${x.summary}"`);
    out.push(`confounds: ${x.confounds.map((c) => `${c.kind}/${c.severity}${c.date ? `@${c.date}` : ""}`).join(", ") || "none"}`);
    out.push("| metric | n b/a | before | after | Δ | Δ% | d | meaningful |");
    out.push("|---|---|---|---|---|---|---|---|");
    for (const m of x.metrics) {
      out.push(`| ${m.metric} | ${m.beforeN}/${m.afterN} | ${m.before} | ${m.after} | ${m.delta} | ${m.deltaPct} | ${m.d} | ${m.meaningful ? (m.improved ? "YES ↑good" : "YES ↓bad") : ""} |`);
    }
  }

  for (const [windowDays, p] of Object.entries(r.placebo)) {
    for (const [label, s] of [["all", p.summary], ["clean", p.cleanSummary]] as const) {
      out.push(`\n## Placebo ${windowDays}-day windows (${label}): runs=${s.runs} usable=${s.usable} headline=${pct(s.headlineRate)} solidHeadline=${pct(s.solidHeadlineRate)} conf=${JSON.stringify(s.confidence)}`);
      out.push("| metric | judged | meaningful | meaningful & moderate+ | null |d| p50 | p90 | p95 |");
      out.push("|---|---|---|---|---|---|---|");
      for (const m of s.perMetric) {
        out.push(`| ${m.metric} | ${m.judged} | ${pct(m.meaningfulRate)} | ${pct(m.solidRate)} | ${round(quantile(m.nullAbsEffect, 0.5))} | ${round(quantile(m.nullAbsEffect, 0.9))} | ${round(quantile(m.nullAbsEffect, 0.95))} |`);
      }
    }
  }

  out.push("\n## Shifted changepoints (peak offset of |d|; 0 = true date)");
  for (const s of r.shifted) {
    out.push(`\n### ${s.label} @ ${s.date}, ${s.windowDays}-day windows — peaks ${JSON.stringify(s.peaks)}`);
    const metrics = Object.keys(s.peaks);
    out.push(`| offset | ${metrics.join(" | ")} |`);
    out.push(`|---|${metrics.map(() => "---").join("|")}|`);
    for (const row of s.rows.filter((x) => x.offset % 4 === 0 || Math.abs(x.offset) <= 3)) {
      out.push(`| ${row.offset} | ${metrics.map((m) => {
        const o = row.metrics[m];
        return o ? `${o.effectSize}${o.meaningful ? "*" : ""}` : "";
      }).join(" | ")} |`);
    }
  }

  out.push("\n## Known effects vs clean 30-day placebo null (exceedance = share of placebos with |d| ≥ observed)");
  for (const e of r.exceedance) {
    out.push(`- ${e.label}: ${e.metrics.filter((m) => m.d != null).map((m) => `${m.metric} d=${m.d}${m.meaningful ? "*" : ""} p=${m.exceedance}`).join("; ")}`);
  }

  out.push("\n## Real reports vs clean placebos of the same window length (p = share of placebos with |d| ≥ observed)");
  for (const x of r.realVsNull) {
    out.push(`- ${x.name} (${x.windowDays}d): ${x.metrics.map((m) => `${m.metric} d=${m.d}${m.meaningful ? "*" : ""} p95=${m.nullP95} p=${m.exceedance}`).join("; ")}`);
  }
  out.push("\n## Largest clean-placebo effects (30-day windows)");
  for (const x of r.largestPlacebos) {
    out.push(`- ${x.metric}: ${x.top.map((t) => `${t.date} d=${t.d} Δ=${t.delta}`).join("; ")}`);
  }

  out.push(`\n## Recovery event study (periods=${r.periods})`);
  for (const x of r.recovery) {
    out.push(`- ${x.activity} / ${x.outcome}: sessions=${x.totalSessions} eligible=${x.eligibleEvents} matched=${x.matchedPairs} state=${x.evidenceState} ` +
      `aggregate(d0..d3)=${x.aggregate.filter((p) => p.offsetDays >= 0 && p.offsetDays <= 3).map((p) => `${p.offsetDays}:${p.medianDelta}(n${p.n}, null95 ${p.nullP95})`).join(" ")}`);
  }
  out.push("\n### Event-study null band vs event count (|median delta| p95 at offsets 0/1)");
  for (const s of r.nullBySize) {
    out.push(`- ${s.events} events: efficiency ${s.sleepEfficiency.map((p) => `${p.offsetDays}:${p.absMedianDeltaP95}`).join(" ")}; hrv ${s.hrv.map((p) => `${p.offsetDays}:${p.absMedianDeltaP95}`).join(" ")}`);
  }
  out.push("\n### Event-study power: planted effect recovered beyond the null p95");
  for (const p of r.power) {
    out.push(`- ${p.events} events: ${p.results.map((x) => `${x.outcome} +${x.plant.delta}@d${x.plant.offsetDays}: recovered ${x.recoveredMedian}, null95 ${x.nullP95}, power ${pct(x.power)}`).join("; ")}`);
  }
  console.log(out.join("\n"));
}

async function main(): Promise<void> {
  const step = Number(option("step") ?? 7);
  let snapshot = loadSnapshot();
  const today = option("today") ?? formatDateInTz(snapshot.takenAt, TZ);

  if (flag("refresh")) {
    snapshot = { takenAt: new Date().toISOString(), results: {} };
    for (let round = 1; round <= 6; round++) {
      const pool = new SnapshotPool(snapshot);
      // A recording round sees empty results for every miss, so it can
      // trip over missing rows; what matters is which queries it asked for.
      await evaluate(wire(pool as unknown as Pool), formatDateInTz(snapshot.takenAt, TZ), step).catch(() => undefined);
      if (pool.misses.size === 0) break;
      console.error(`snapshot round ${round}: fetching ${pool.misses.size} queries`);
      Object.assign(snapshot.results, await fetchViaWindmill([...pool.misses.values()]));
      saveSnapshot(snapshot);
    }
  }

  const pool = new SnapshotPool(snapshot);
  const results = await evaluate(wire(pool as unknown as Pool), today, step);
  if (pool.misses.size > 0) {
    console.error(`WARNING: ${pool.misses.size} queries missing from the snapshot — run with --refresh`);
    for (const miss of pool.misses.values()) console.error(`  ${miss.key.slice(0, 160)}`);
  }
  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(resultsFile, JSON.stringify(results, null, 1));
  printReport(results);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
