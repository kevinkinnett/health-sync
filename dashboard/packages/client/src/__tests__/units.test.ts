import { describe, it, expect } from "vitest";
import {
  convertWeight,
  convertDistance,
  formatWeight,
  formatDistance,
  formatDistanceWithSourceUnit,
  weightUnitLabel,
  distanceUnitLabel,
  defaultUnitsForLocale,
} from "../lib/units";

describe("units conversions", () => {
  describe("convertWeight", () => {
    it("returns kg unchanged in metric", () => {
      expect(convertWeight(84.5, "metric")).toBe(84.5);
    });
    it("converts kg → lb in imperial", () => {
      // 84.5 kg ≈ 186.29 lb
      expect(convertWeight(84.5, "imperial")).toBeCloseTo(186.29, 2);
    });
    it("passes nulls through", () => {
      expect(convertWeight(null, "imperial")).toBeNull();
      expect(convertWeight(undefined, "metric")).toBeNull();
    });
  });

  describe("convertDistance", () => {
    it("returns km unchanged in metric", () => {
      expect(convertDistance(6.39, "metric")).toBe(6.39);
    });
    it("converts km → mi in imperial", () => {
      // 6.39 km ≈ 3.97 mi (matches the Fitbit-app figure we cross-checked)
      expect(convertDistance(6.39, "imperial")).toBeCloseTo(3.97, 2);
    });
    it("passes nulls through", () => {
      expect(convertDistance(null, "imperial")).toBeNull();
    });
  });

  describe("format helpers attach the right unit suffix", () => {
    it("formatWeight uses 'kg' for metric", () => {
      expect(formatWeight(84.5, "metric")).toBe("84.5 kg");
    });
    it("formatWeight uses 'lb' for imperial", () => {
      expect(formatWeight(84.5, "imperial")).toBe("186.3 lb");
    });
    it("formatDistance uses 'km' for metric", () => {
      expect(formatDistance(6.39, "metric")).toBe("6.4 km");
    });
    it("formatDistance uses 'mi' for imperial", () => {
      expect(formatDistance(6.39, "imperial")).toBe("4.0 mi");
    });
    it("returns '---' for null inputs", () => {
      expect(formatWeight(null, "imperial")).toBe("---");
      expect(formatDistance(null, "metric")).toBe("---");
    });
  });

  describe("formatDistanceWithSourceUnit normalises via the source unit", () => {
    it("treats no/missing source as km", () => {
      expect(formatDistanceWithSourceUnit(5, null, "metric")).toBe("5.00 km");
      expect(formatDistanceWithSourceUnit(5, "km", "imperial")).toBe("3.11 mi");
    });
    it("converts mi-source to imperial passthrough", () => {
      // Source is already in mi: 3 mi displayed in imperial stays 3 mi.
      expect(formatDistanceWithSourceUnit(3, "mi", "imperial")).toBe("3.00 mi");
    });
    it("converts mi-source back to km in metric", () => {
      // 3 mi ≈ 4.83 km
      expect(formatDistanceWithSourceUnit(3, "mi", "metric")).toBe("4.83 km");
    });
    it("returns --- for zero or null", () => {
      expect(formatDistanceWithSourceUnit(0, "km", "metric")).toBe("---");
      expect(formatDistanceWithSourceUnit(null, "km", "metric")).toBe("---");
    });
  });

  describe("unit labels", () => {
    it("weightUnitLabel maps system → suffix", () => {
      expect(weightUnitLabel("metric")).toBe("kg");
      expect(weightUnitLabel("imperial")).toBe("lb");
    });
    it("distanceUnitLabel maps system → suffix", () => {
      expect(distanceUnitLabel("metric")).toBe("km");
      expect(distanceUnitLabel("imperial")).toBe("mi");
    });
  });

  describe("defaultUnitsForLocale", () => {
    it("imperial for US", () => {
      expect(defaultUnitsForLocale("en-US")).toBe("imperial");
    });
    it("imperial for Liberia and Myanmar — the other holdouts", () => {
      expect(defaultUnitsForLocale("en-LR")).toBe("imperial");
      expect(defaultUnitsForLocale("my-MM")).toBe("imperial");
    });
    it("metric for everywhere else", () => {
      expect(defaultUnitsForLocale("en-GB")).toBe("metric");
      expect(defaultUnitsForLocale("de-DE")).toBe("metric");
      expect(defaultUnitsForLocale("ja-JP")).toBe("metric");
    });
    it("metric for locales without a region tag", () => {
      expect(defaultUnitsForLocale("en")).toBe("metric");
    });
  });
});
