import { policy } from "@careconnect/core";
import { AccessLevel, DataCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";

/**
 * packages/core can't depend on @prisma/client (it has to stay usable from
 * the mobile app), so its DataCategory/AccessLevel unions are hand-copied
 * from schema.prisma rather than imported. This test is the tripwire: if
 * someone adds a category to the schema and forgets packages/core, CI fails
 * here instead of the drift silently making some category ungrantable.
 */
describe("DataCategory / AccessLevel stay in sync with the Prisma schema", () => {
  it("matches DataCategory", () => {
    expect([...policy.DATA_CATEGORIES].sort()).toEqual(Object.keys(DataCategory).sort());
  });

  it("matches AccessLevel", () => {
    expect([...policy.ACCESS_LEVELS].sort()).toEqual(Object.keys(AccessLevel).sort());
  });
});
