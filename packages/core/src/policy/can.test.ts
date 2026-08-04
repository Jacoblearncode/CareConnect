import { describe, expect, it } from "vitest";
import { canView } from "./can.js";

const OWNER = "owner-1";
const ACTOR = "actor-1";

describe("canView", () => {
  it("always allows the owner to view their own data, regardless of grants", () => {
    expect(
      canView({ actorId: OWNER, ownerId: OWNER, grant: null, relationshipActive: false }),
    ).toBe(true);
  });

  it("denies a stranger with no relationship even if a stray VIEW grant exists", () => {
    // Models: relationship was removed but the grant row was never cleaned up.
    expect(
      canView({
        actorId: ACTOR,
        ownerId: OWNER,
        grant: { level: "VIEW" },
        relationshipActive: false,
      }),
    ).toBe(false);
  });

  it("denies an active relationship with no grant (default-deny)", () => {
    expect(
      canView({ actorId: ACTOR, ownerId: OWNER, grant: null, relationshipActive: true }),
    ).toBe(false);
  });

  it("denies an active relationship with an explicit NONE grant", () => {
    expect(
      canView({
        actorId: ACTOR,
        ownerId: OWNER,
        grant: { level: "NONE" },
        relationshipActive: true,
      }),
    ).toBe(false);
  });

  it("allows an active relationship with a VIEW grant", () => {
    expect(
      canView({
        actorId: ACTOR,
        ownerId: OWNER,
        grant: { level: "VIEW" },
        relationshipActive: true,
      }),
    ).toBe(true);
  });
});
