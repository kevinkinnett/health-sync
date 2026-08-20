import type {
  ActivityDay,
  FoodLogDay,
  NutritionWeightReport,
  TrainingSummary,
  WeightEntry,
} from "@health-dashboard/shared";
import { buildNutritionWeightReport } from "./nutritionWeightAnalysis.js";

export interface DateRangeReader<T> {
  findByDateRange(start: string, end: string): Promise<T[]>;
}

export interface TrainingSummaryReader {
  getSummary(start: string, end: string): Promise<TrainingSummary>;
}

/**
 * Fetches the four independently stored inputs and delegates all report math
 * to a pure function. The narrow ports keep storage and training-load rules
 * outside this use case.
 */
export class NutritionWeightInsightsService {
  constructor(
    private readonly food: DateRangeReader<FoodLogDay>,
    private readonly activity: DateRangeReader<ActivityDay>,
    private readonly weight: DateRangeReader<WeightEntry>,
    private readonly training: TrainingSummaryReader,
  ) {}

  async get(
    start: string,
    end: string,
    currentLocalDate: string,
  ): Promise<NutritionWeightReport> {
    const [food, activity, weights, training] = await Promise.all([
      this.food.findByDateRange(start, end),
      this.activity.findByDateRange(start, end),
      this.weight.findByDateRange(start, end),
      this.training.getSummary(start, end),
    ]);
    return buildNutritionWeightReport({
      start,
      end,
      currentLocalDate,
      food,
      activity,
      weights,
      trainingDays: training.days,
    });
  }
}
