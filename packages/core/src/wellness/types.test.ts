import { describe, expect, it } from "vitest";
import { METRIC_TYPES, metricCategoryFor } from "./types.js";

describe("metricCategoryFor", () => {
  it("routes MOOD to the MOOD category", () => {
    expect(metricCategoryFor("MOOD")).toBe("MOOD");
  });

  it("routes every other metric type to WELLNESS_METRICS", () => {
    for (const type of METRIC_TYPES) {
      if (type === "MOOD") continue;
      expect(metricCategoryFor(type)).toBe("WELLNESS_METRICS");
    }
  });
});
