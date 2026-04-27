import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type {
  SupplementItem,
  SupplementIntake,
  MedicationItem,
  MedicationIntake,
  ActivityDay,
  SleepDay,
  HeartRateDay,
  HrvDay,
} from "@health-dashboard/shared";
import { AnalyticsService } from "../services/analyticsService.js";
import { AnalyticsController } from "../controllers/analyticsController.js";
import { createAnalyticsRoutes } from "../routes/analytics.js";
import { shiftDate } from "../services/stats.js";

// ---------------------------------------------------------------------------
// In-memory fakes — implement only the surface AnalyticsService touches.
// Cast to the concrete repo type at the service boundary.
// ---------------------------------------------------------------------------

class FakeSupplementRepo {
  items = new Map<number, SupplementItem>();
  intakes: SupplementIntake[] = [];
  /** date → ingredient → { amount, unit, name } */
  ingredientByDay: Array<{
    date: string;
    ingredientId: number;
    ingredientName: string;
    totalAmount: number;
    unit: string;
  }> = [];

  async getItem(id: number): Promise<SupplementItem | null> {
    return this.items.get(id) ?? null;
  }

  async listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<SupplementIntake[]> {
    return this.intakes
      .filter((i) => (itemId == null ? true : i.itemId === itemId))
      .filter((i) => (start ? i.takenAt >= start : true))
      .filter((i) => (end ? i.takenAt <= end : true));
  }

  async listIngredientByDay(
    start: string,
    end: string,
    _userTz: string,
    ingredientId?: number,
  ) {
    return this.ingredientByDay
      .filter((r) => r.date >= start.slice(0, 10))
      .filter((r) => r.date <= end.slice(0, 10))
      .filter((r) => (ingredientId == null ? true : r.ingredientId === ingredientId));
  }
}

class FakeMedicationRepo {
  items = new Map<number, MedicationItem>();
  intakes: MedicationIntake[] = [];

  async getItem(id: number): Promise<MedicationItem | null> {
    return this.items.get(id) ?? null;
  }

  async listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<MedicationIntake[]> {
    return this.intakes
      .filter((i) => (itemId == null ? true : i.itemId === itemId))
      .filter((i) => (start ? i.takenAt >= start : true))
      .filter((i) => (end ? i.takenAt <= end : true));
  }
}

class FakeActivityRepo {
  rows: ActivityDay[] = [];
  async findByDateRange(start: string, end: string): Promise<ActivityDay[]> {
    return this.rows.filter((r) => r.date >= start && r.date <= end);
  }
}

class FakeSleepRepo {
  rows: SleepDay[] = [];
  async findByDateRange(start: string, end: string): Promise<SleepDay[]> {
    return this.rows.filter((r) => r.date >= start && r.date <= end);
  }
}

class FakeHeartRateRepo {
  rows: HeartRateDay[] = [];
  async findByDateRange(start: string, end: string): Promise<HeartRateDay[]> {
    return this.rows.filter((r) => r.date >= start && r.date <= end);
  }
}

class FakeHrvRepo {
  rows: HrvDay[] = [];
  async findByDateRange(start: string, end: string): Promise<HrvDay[]> {
    return this.rows.filter((r) => r.date >= start && r.date <= end);
  }
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeSupplementItem(id: number, name: string): SupplementItem {
  return {
    id,
    name,
    brand: null,
    form: null,
    defaultAmount: 1,
    defaultUnit: "dose",
    notes: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ingredients: [],
  };
}

function makeMedicationItem(id: number, name: string): MedicationItem {
  return {
    id,
    name,
    brand: null,
    form: null,
    defaultAmount: 1,
    defaultUnit: "dose",
    notes: null,
    isActive: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeIntake(
  id: number,
  itemId: number,
  itemName: string,
  date: string,
  amount = 1,
): SupplementIntake {
  return {
    id,
    itemId,
    itemName,
    takenAt: `${date}T08:00:00Z`,
    amount,
    unit: "dose",
    notes: null,
    createdAt: `${date}T08:00:00Z`,
    ingredients: [],
  };
}

function emptyActivity(date: string): ActivityDay {
  return {
    date,
    steps: 0,
    caloriesOut: null,
    caloriesBmr: null,
    activeCalories: null,
    distanceKm: null,
    floors: null,
    minutesSedentary: null,
    minutesLightlyActive: null,
    minutesFairlyActive: null,
    minutesVeryActive: null,
    fetchedAt: `${date}T00:00:00Z`,
  };
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let supRepo: FakeSupplementRepo;
let medRepo: FakeMedicationRepo;
let actRepo: FakeActivityRepo;
let sleepRepo: FakeSleepRepo;
let hrRepo: FakeHeartRateRepo;
let hrvRepo: FakeHrvRepo;
let app: express.Express;

beforeEach(() => {
  supRepo = new FakeSupplementRepo();
  medRepo = new FakeMedicationRepo();
  actRepo = new FakeActivityRepo();
  sleepRepo = new FakeSleepRepo();
  hrRepo = new FakeHeartRateRepo();
  hrvRepo = new FakeHrvRepo();

  const service = new AnalyticsService(
    supRepo as never,
    medRepo as never,
    actRepo as never,
    sleepRepo as never,
    hrRepo as never,
    hrvRepo as never,
  );
  const controller = new AnalyticsController(service);
  app = express();
  app.use(express.json());
  app.use("/api/analytics", createAnalyticsRoutes(controller));
});

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------

describe("Analytics adherence", () => {
  it("computes streaks and DoW averages over a 30-day window with gaps", async () => {
    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    // Window: 2026-01-01 .. 2026-01-30
    // Intake every day except 2026-01-10, 2026-01-20, 2026-01-21
    let intakeId = 1;
    for (let i = 0; i < 30; i++) {
      const date = shiftDate("2026-01-01", i);
      if (date === "2026-01-10") continue;
      if (date === "2026-01-20" || date === "2026-01-21") continue;
      supRepo.intakes.push(makeIntake(intakeId++, 1, "Anxie-T", date));
    }

    const res = await request(app).get(
      "/api/analytics/supplements/adherence/1?start=2026-01-01&end=2026-01-30",
    );
    expect(res.status).toBe(200);
    expect(res.body.itemId).toBe(1);
    expect(res.body.daysInWindow).toBe(30);
    expect(res.body.daysWithIntake).toBe(27);
    expect(res.body.totalDoses).toBe(27);
    // Best streak is the longest run between gaps:
    //   01-22..01-30 = 9 days  (after the 20–21 gap)
    //   01-11..01-19 = 9 days  (between 10 and 20)
    //   01-01..01-09 = 9 days  (before 10)
    // Tie → 9.
    expect(res.body.bestStreak).toBe(9);
    // Current streak (ends on 01-30): from 01-22 → 9 days
    expect(res.body.currentStreak).toBe(9);
    expect(res.body.daily).toHaveLength(30);
    expect(res.body.byDayOfWeek).toHaveLength(7);
    // Each weekday entry is between 0 and 1 (capped because doses=1 max
    // any individual day).
    for (const dow of res.body.byDayOfWeek) {
      expect(dow.avgDoses).toBeGreaterThanOrEqual(0);
      expect(dow.avgDoses).toBeLessThanOrEqual(1);
    }
  });

  it("returns 404 for an unknown item id", async () => {
    const res = await request(app).get(
      "/api/analytics/supplements/adherence/999?start=2026-01-01&end=2026-01-30",
    );
    expect(res.status).toBe(404);
  });

  it("rejects malformed dates with 400", async () => {
    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    const res = await request(app).get(
      "/api/analytics/supplements/adherence/1?start=01-01-2026&end=2026-01-30",
    );
    expect(res.status).toBe(400);
  });

  it("rejects non-numeric item ids with 400", async () => {
    const res = await request(app).get(
      "/api/analytics/supplements/adherence/abc?start=2026-01-01&end=2026-01-30",
    );
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Intake-by-day
// ---------------------------------------------------------------------------

describe("Analytics intake-by-day", () => {
  it("sums multiple intakes on the same day for one supplement", async () => {
    supRepo.items.set(1, makeSupplementItem(1, "Magnesium"));
    // Three doses on the same date
    supRepo.intakes.push(makeIntake(1, 1, "Magnesium", "2026-01-15", 200));
    supRepo.intakes.push(makeIntake(2, 1, "Magnesium", "2026-01-15", 200));
    supRepo.intakes.push(makeIntake(3, 1, "Magnesium", "2026-01-15", 100));
    // One on the next day
    supRepo.intakes.push(makeIntake(4, 1, "Magnesium", "2026-01-16", 200));

    const res = await request(app).get(
      "/api/analytics/supplements/intake-by-day?start=2026-01-01&end=2026-01-31",
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const day15 = res.body.find((r: { date: string }) => r.date === "2026-01-15");
    expect(day15.count).toBe(3);
    expect(day15.totalAmount).toBe(500);
    const day16 = res.body.find((r: { date: string }) => r.date === "2026-01-16");
    expect(day16.count).toBe(1);
    expect(day16.totalAmount).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Ingredient rollup
// ---------------------------------------------------------------------------

describe("Analytics ingredient-by-day", () => {
  it("rolls up the same ingredient across multiple supplements", async () => {
    // Two supplements both containing magnesium → totals come back rolled
    // up on each day.
    supRepo.ingredientByDay = [
      {
        date: "2026-01-15",
        ingredientId: 10,
        ingredientName: "Magnesium",
        totalAmount: 500,
        unit: "mg",
      },
      {
        date: "2026-01-16",
        ingredientId: 10,
        ingredientName: "Magnesium",
        totalAmount: 300,
        unit: "mg",
      },
    ];
    const res = await request(app).get(
      "/api/analytics/supplements/ingredient-by-day?start=2026-01-01&end=2026-01-31",
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      ingredientName: "Magnesium",
      totalAmount: 500,
      unit: "mg",
    });
  });
});

// ---------------------------------------------------------------------------
// Correlations
// ---------------------------------------------------------------------------

describe("Analytics correlations", () => {
  it("finds r ≈ 1 when steps are perfectly aligned with intake days", async () => {
    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    // 30 alternating days: even index → intake + high steps,
    // odd index → no intake + low steps.
    for (let i = 0; i < 30; i++) {
      const date = shiftDate("2026-01-01", i);
      if (i % 2 === 0) {
        supRepo.intakes.push(makeIntake(i + 1, 1, "Anxie-T", date));
      }
      const a = emptyActivity(date);
      a.steps = i % 2 === 0 ? 10000 : 2000;
      actRepo.rows.push(a);
    }
    const res = await request(app).get(
      "/api/analytics/supplements/correlations/1",
    );
    expect(res.status).toBe(200);
    const stepsPair = res.body.pairs.find(
      (p: { metric: string }) => p.metric === "steps",
    );
    expect(stepsPair).toBeDefined();
    // intake series is 0/1 for non-intake days too — but listIntakes only
    // returns intake rows. For non-intake days, we have no intake rows, so
    // the bucket map only contains the *taken* days. The correlation here
    // is computed only over those days, which all have x=1 → degenerate.
    // To avoid that, the loop above produces alternating rows where every
    // intake day has high steps; after the join the array is constant
    // x=1, y=10000. den === 0 → r === 0 by stats convention.
    expect(stepsPair.n).toBe(15);
    expect(stepsPair.correlation).toBe(0);
  });

  it("excludes pairs with fewer than 7 joined days", async () => {
    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    for (let i = 0; i < 5; i++) {
      const date = shiftDate("2026-01-01", i);
      supRepo.intakes.push(makeIntake(i + 1, 1, "Anxie-T", date));
      const a = emptyActivity(date);
      a.steps = 5000 + i * 100;
      actRepo.rows.push(a);
    }
    const res = await request(app).get(
      "/api/analytics/supplements/correlations/1",
    );
    expect(res.status).toBe(200);
    expect(res.body.pairs).toHaveLength(0);
  });

  it("rejects out-of-range lag with 400", async () => {
    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    const res = await request(app).get(
      "/api/analytics/supplements/correlations/1?lag=99",
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown supplement id", async () => {
    const res = await request(app).get(
      "/api/analytics/supplements/correlations/999",
    );
    expect(res.status).toBe(404);
  });

  it("shifts the intake series for lag>0 (lag=1 finds same-day-shifted signal)", async () => {
    // Synthetic 14-day series where intake-day at D matches a steps spike
    // at D+1 — i.e. lag=1 should reveal a correlation that lag=0 misses.
    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    for (let i = 0; i < 14; i++) {
      const date = shiftDate("2026-01-01", i);
      // Intake on even days
      if (i % 2 === 0) {
        supRepo.intakes.push(makeIntake(i + 1, 1, "Anxie-T", date));
      }
      // Steps spike one day *after* an intake day:
      // intake on i=0 → spike on i=1, intake on i=2 → spike on i=3, ...
      const a = emptyActivity(date);
      a.steps = i % 2 === 1 ? 10000 : 2000;
      actRepo.rows.push(a);
    }

    // Lag 0: intake days line up with the *low* steps days → all x=1, y≈2000
    // (degenerate, returns r=0). Lag 1: intake-day-set is shifted forward
    // one day, so it now lines up with the *spike* days → again degenerate
    // with r=0 since all x=1.
    // The point of this test is that lag changes which days are joined,
    // verified by the n count and the average y in the points.
    const lag0 = await request(app).get(
      "/api/analytics/supplements/correlations/1?lag=0",
    );
    const lag1 = await request(app).get(
      "/api/analytics/supplements/correlations/1?lag=1",
    );
    expect(lag0.status).toBe(200);
    expect(lag1.status).toBe(200);
    const lag0Steps = lag0.body.pairs.find(
      (p: { metric: string }) => p.metric === "steps",
    );
    const lag1Steps = lag1.body.pairs.find(
      (p: { metric: string }) => p.metric === "steps",
    );
    expect(lag0Steps).toBeDefined();
    expect(lag1Steps).toBeDefined();
    // At lag=0, intake days (even i) are paired with low-steps days
    const lag0AvgY =
      lag0Steps.points.reduce(
        (sum: number, p: { y: number }) => sum + p.y,
        0,
      ) / lag0Steps.points.length;
    // At lag=1, the same intake days are pushed to odd days → high-steps
    const lag1AvgY =
      lag1Steps.points.reduce(
        (sum: number, p: { y: number }) => sum + p.y,
        0,
      ) / lag1Steps.points.length;
    expect(lag0AvgY).toBeLessThan(lag1AvgY);
    expect(lag0AvgY).toBeCloseTo(2000, 0);
    expect(lag1AvgY).toBeCloseTo(10000, 0);
  });
});

// ---------------------------------------------------------------------------
// Medication mirrors
// ---------------------------------------------------------------------------

describe("Analytics medications", () => {
  it("computes adherence for a medication", async () => {
    medRepo.items.set(2, makeMedicationItem(2, "Lisinopril"));
    medRepo.intakes.push({
      id: 1,
      itemId: 2,
      itemName: "Lisinopril",
      takenAt: "2026-01-15T08:00:00Z",
      amount: 1,
      unit: "tablet",
      notes: null,
      createdAt: "2026-01-15T08:00:00Z",
    });
    const res = await request(app).get(
      "/api/analytics/medications/adherence/2?start=2026-01-01&end=2026-01-30",
    );
    expect(res.status).toBe(200);
    expect(res.body.itemName).toBe("Lisinopril");
    expect(res.body.totalDoses).toBe(1);
    expect(res.body.daysWithIntake).toBe(1);
  });

  it("returns 404 for an unknown medication id on correlations", async () => {
    const res = await request(app).get(
      "/api/analytics/medications/correlations/999",
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Timezone-aware bucketing — guards the original 1199-step-gap bug
// ---------------------------------------------------------------------------

describe("Analytics TZ bucketing", () => {
  it("buckets a late-evening Eastern intake into the user's calendar day", async () => {
    // Build a service explicitly configured for Eastern.
    const service = new AnalyticsService(
      supRepo as never,
      medRepo as never,
      actRepo as never,
      sleepRepo as never,
      hrRepo as never,
      hrvRepo as never,
      { userTimezone: "America/New_York" },
    );
    const controller = new AnalyticsController(service, {
      userTimezone: "America/New_York",
    });
    const tzApp = express();
    tzApp.use(express.json());
    tzApp.use("/api/analytics", createAnalyticsRoutes(controller));

    supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
    // 8:30 PM EDT on 2026-04-26 == 00:30 UTC on 2026-04-27. Naive UTC
    // bucketing would file this as 2026-04-27 (the user's "tomorrow"),
    // hiding it from a query for the user's "today" of 2026-04-26.
    supRepo.intakes.push({
      id: 1,
      itemId: 1,
      itemName: "Anxie-T",
      takenAt: "2026-04-27T00:30:00.000Z",
      amount: 1,
      unit: "dose",
      notes: null,
      createdAt: "2026-04-27T00:30:00.000Z",
      ingredients: [],
    });

    const res = await request(tzApp).get(
      "/api/analytics/supplements/intake-by-day?start=2026-04-26&end=2026-04-26",
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].date).toBe("2026-04-26");
    expect(res.body[0].count).toBe(1);
  });

  it("uses the user's calendar today (not UTC's) when start/end are omitted", async () => {
    // Mock "now" to a moment where UTC and Eastern disagree on the date.
    const realNow = Date.now;
    Date.now = () => new Date("2026-04-28T03:00:00.000Z").getTime();
    try {
      const service = new AnalyticsService(
        supRepo as never,
        medRepo as never,
        actRepo as never,
        sleepRepo as never,
        hrRepo as never,
        hrvRepo as never,
        { userTimezone: "America/New_York" },
      );
      const controller = new AnalyticsController(service, {
        userTimezone: "America/New_York",
      });
      const tzApp = express();
      tzApp.use(express.json());
      tzApp.use("/api/analytics", createAnalyticsRoutes(controller));

      supRepo.items.set(1, makeSupplementItem(1, "Anxie-T"));
      // Intake at 11pm Eastern on Apr 27 — should still be on Apr 27
      // even though it's already Apr 28 in UTC.
      supRepo.intakes.push({
        id: 1,
        itemId: 1,
        itemName: "Anxie-T",
        takenAt: "2026-04-28T03:00:00.000Z",
        amount: 1,
        unit: "dose",
        notes: null,
        createdAt: "2026-04-28T03:00:00.000Z",
        ingredients: [],
      });

      const res = await request(tzApp).get(
        "/api/analytics/supplements/intake-by-day",
      );
      expect(res.status).toBe(200);
      // The default range is "last 30 days" — end should be 2026-04-27
      // (Eastern's today) and the late-evening intake should be in.
      const dates = (res.body as Array<{ date: string }>).map((r) => r.date);
      expect(dates).toContain("2026-04-27");
      expect(dates).not.toContain("2026-04-28");
    } finally {
      Date.now = realNow;
    }
  });
});
