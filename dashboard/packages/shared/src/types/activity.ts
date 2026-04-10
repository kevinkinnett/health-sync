export interface ActivityDay {
  date: string;
  steps: number | null;
  caloriesOut: number | null;
  caloriesBmr: number | null;
  activeCalories: number | null;
  distanceKm: number | null;
  floors: number | null;
  minutesSedentary: number | null;
  minutesLightlyActive: number | null;
  minutesFairlyActive: number | null;
  minutesVeryActive: number | null;
  fetchedAt: string;
}
