import type { PrismaClient } from "@prisma/client";

/** True if `a` and `b` currently have an active buddy link or active coach link, in either direction. */
export async function hasActiveRelationship(
  db: PrismaClient,
  a: string,
  b: string,
): Promise<boolean> {
  const [buddyLink, coachLinkAB, coachLinkBA] = await Promise.all([
    db.buddyLink.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { userAId: a, userBId: b },
          { userAId: b, userBId: a },
        ],
      },
      select: { id: true },
    }),
    db.coachLink.findFirst({
      where: { status: "ACTIVE", coachUserId: a, patientUserId: b },
      select: { id: true },
    }),
    db.coachLink.findFirst({
      where: { status: "ACTIVE", coachUserId: b, patientUserId: a },
      select: { id: true },
    }),
  ]);
  return Boolean(buddyLink || coachLinkAB || coachLinkBA);
}
