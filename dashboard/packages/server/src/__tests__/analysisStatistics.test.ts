import { describe, expect, it } from "vitest";
import {
  adjustFalseDiscoveryRate,
  circularShiftPValue,
  spearman,
} from "../services/analysis/statistics.js";

describe("analysis statistics", () => {
  it("computes rank correlation with tied values", () => {
    expect(spearman([1, 2, 2, 4], [10, 20, 20, 40])).toBe(1);
  });

  it("uses circular shifts as an autocorrelation-preserving null", () => {
    const values = Array.from({ length: 30 }, (_, index) => index);
    expect(circularShiftPValue(values, values)).toBeLessThan(0.1);
  });

  it("applies monotone Benjamini-Hochberg correction", () => {
    expect(adjustFalseDiscoveryRate([0.01, 0.04, 0.03])).toEqual([0.03, 0.04, 0.04]);
  });
});
