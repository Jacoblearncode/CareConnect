import { doses } from "@careconnect/core";
import { DoseStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

/** Same drift guard as policy/category-sync.test.ts, for the dose status enum. */
describe("DoseStatus stays in sync with the Prisma schema", () => {
  it("matches DoseStatus", () => {
    expect([...doses.DOSE_STATUSES].sort()).toEqual(Object.keys(DoseStatus).sort());
  });
});
