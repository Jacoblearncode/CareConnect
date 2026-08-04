import { human } from "@careconnect/core";
import {
  BuddyLinkStatus,
  BuddyMessageType,
  CoachLinkStatus,
  GoalStatus,
  InviteStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

/** Same drift guard as policy/category-sync.test.ts, doses/status-sync.test.ts, wellness/type-sync.test.ts. */
describe("Phase 5 enums stay in sync with the Prisma schema", () => {
  it("matches InviteStatus", () => {
    expect([...human.INVITE_STATUSES].sort()).toEqual(Object.keys(InviteStatus).sort());
  });

  it("matches BuddyLinkStatus", () => {
    expect([...human.BUDDY_LINK_STATUSES].sort()).toEqual(Object.keys(BuddyLinkStatus).sort());
  });

  it("matches BuddyMessageType", () => {
    expect([...human.BUDDY_MESSAGE_TYPES].sort()).toEqual(Object.keys(BuddyMessageType).sort());
  });

  it("matches GoalStatus", () => {
    expect([...human.GOAL_STATUSES].sort()).toEqual(Object.keys(GoalStatus).sort());
  });

  it("matches CoachLinkStatus", () => {
    expect([...human.COACH_LINK_STATUSES].sort()).toEqual(Object.keys(CoachLinkStatus).sort());
  });
});
