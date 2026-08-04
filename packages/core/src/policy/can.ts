import type { AccessLevel } from "./types.js";

/**
 * The single decision point for "may `actorId` view `ownerId`'s data in this
 * category?" (Build Plan §3.1). Pure and I/O-free: the caller (apps/api's
 * policy/gate.ts) resolves the grant row and relationship status from the
 * database and hands them in, so this function — and therefore the actual
 * rule — is unit-testable with no database at all.
 */

export interface CanViewInput {
  actorId: string;
  ownerId: string;
  /** The owner's grant to this actor for this category, or null if none exists. */
  grant: { level: AccessLevel } | null;
  /**
   * Whether actor and owner currently have an active relationship (an ACTIVE
   * BuddyLink or CoachLink). Irrelevant when actorId === ownerId.
   *
   * This is what makes revocation real: removing the relationship cuts off
   * access even if a PermissionGrant row with level VIEW is still sitting in
   * the table (Build Plan §3.1 — "revoking a coach ends future access").
   */
  relationshipActive: boolean;
}

export function canView(input: CanViewInput): boolean {
  if (input.actorId === input.ownerId) {
    return true;
  }
  if (!input.relationshipActive) {
    return false;
  }
  return input.grant?.level === "VIEW";
}
