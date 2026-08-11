import { describe, expect, it } from "vitest";
import {
  buildCurlExamples,
  errorRateTone,
  responseStatusTone,
} from "../components/apiConsole/apiConsoleModel";

describe("buildCurlExamples", () => {
  it("builds every command from the live API base", () => {
    const examples = buildCurlExamples("https://health.example/api/v1");

    expect(examples).toHaveLength(5);
    expect(
      examples.every((example) =>
        example.command.includes("https://health.example/api/v1"),
      ),
    ).toBe(true);
    expect(examples.some((example) => example.command.includes("X-Caller"))).toBe(true);
  });
});

describe("status tones", () => {
  it("classifies error rates at the UI thresholds", () => {
    expect(errorRateTone(0)).toBe("good");
    expect(errorRateTone(0.01)).toBe("warn");
    expect(errorRateTone(0.06)).toBe("bad");
  });

  it("classifies HTTP response families", () => {
    expect(responseStatusTone(200)).toBe("good");
    expect(responseStatusTone(404)).toBe("warn");
    expect(responseStatusTone(500)).toBe("bad");
  });
});
