import { wellness } from "@careconnect/core";
import { MetricSource, MetricType } from "@prisma/client";
import { describe, expect, it } from "vitest";

/** Same drift guard as policy/category-sync.test.ts and doses/status-sync.test.ts. */
describe("MetricType / MetricSource stay in sync with the Prisma schema", () => {
  it("matches MetricType", () => {
    expect([...wellness.METRIC_TYPES].sort()).toEqual(Object.keys(MetricType).sort());
  });

  it("matches MetricSource", () => {
    expect([...wellness.METRIC_SOURCES].sort()).toEqual(Object.keys(MetricSource).sort());
  });
});
