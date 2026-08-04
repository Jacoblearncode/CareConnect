import { auth as coreAuth } from "@careconnect/core";
import { PrismaClient } from "@prisma/client";

/**
 * Demo/seed data (§21 "seed/demo data" deliverable). Idempotent: wipes and
 * regenerates every table each run, in FK-safe order, so `pnpm db:seed` is
 * safe to re-run at any point during development.
 *
 * Three patients, two buddies, one coach, 30 days of realistic history —
 * enough that adherence percentages, charts, and trend screens have
 * non-trivial data on first launch (Phase 0 requirement, Build Plan §5).
 */

const prisma = new PrismaClient();

// Deterministic PRNG so re-running seed produces the same demo data.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;

async function resetDatabase() {
  await prisma.$transaction([
    prisma.aiMessage.deleteMany(),
    prisma.escalationEvent.deleteMany(),
    prisma.aiConversation.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.notificationPreference.deleteMany(),
    prisma.coachNote.deleteMany(),
    prisma.coachGoal.deleteMany(),
    prisma.coachLink.deleteMany(),
    prisma.coachProfile.deleteMany(),
    prisma.buddyMessage.deleteMany(),
    prisma.accountabilityGoal.deleteMany(),
    prisma.buddyLink.deleteMany(),
    prisma.buddyInvite.deleteMany(),
    prisma.permissionGrant.deleteMany(),
    prisma.checkIn.deleteMany(),
    prisma.healthMetric.deleteMany(),
    prisma.doseInstance.deleteMany(),
    prisma.scheduleRule.deleteMany(),
    prisma.medicationDraft.deleteMany(),
    prisma.medication.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

async function createUser(input: {
  email: string;
  displayName: string;
  accessibilityMode?: boolean;
  isCoach?: boolean;
}) {
  // Same password for every seed account — fine for a demo, never do this in
  // a real deployment. Printed at the end so it's obvious, not hidden.
  const passwordHash = await coreAuth.hashPassword("CareConnect!Demo1");
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      accessibilityMode: input.accessibilityMode ?? false,
      isCoach: input.isCoach ?? false,
    },
  });
}

interface MedicationSpec {
  name: string;
  strength: string;
  form: string;
  instructions: string;
  timesOfDay: string[];
  /** Fraction of doses that land as TAKEN; the rest split across SKIPPED/MISSED. */
  adherenceRate: number;
}

/** Generates 30 days of DoseInstance rows for one medication + schedule. */
async function seedMedication(userId: string, spec: MedicationSpec, timezone: string) {
  const medication = await prisma.medication.create({
    data: {
      userId,
      name: spec.name,
      strength: spec.strength,
      form: spec.form,
      instructions: spec.instructions,
      startDate: new Date(Date.now() - HISTORY_DAYS * DAY_MS),
    },
  });

  await prisma.scheduleRule.create({
    data: {
      medicationId: medication.id,
      timesOfDay: spec.timesOfDay,
      daysOfWeek: [],
      timezone,
      windowMinutes: 60,
    },
  });

  const now = Date.now();
  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset--) {
    for (const time of spec.timesOfDay) {
      const [hoursStr, minutesStr] = time.split(":");
      const scheduledAt = new Date(now - dayOffset * DAY_MS);
      scheduledAt.setHours(Number(hoursStr), Number(minutesStr), 0, 0);
      if (scheduledAt.getTime() > now) continue; // don't create future-dated history

      const windowEndsAt = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
      const isPast = windowEndsAt.getTime() < now;
      let status: "TAKEN" | "SKIPPED" | "MISSED" | "PENDING";
      if (!isPast) {
        status = "PENDING";
      } else if (rand() < spec.adherenceRate) {
        status = "TAKEN";
      } else {
        status = rand() < 0.6 ? "MISSED" : "SKIPPED";
      }

      await prisma.doseInstance.create({
        data: {
          medicationId: medication.id,
          scheduledAt,
          windowEndsAt,
          status,
          recordedAt: status === "PENDING" ? null : windowEndsAt,
        },
      });
    }
  }

  return medication;
}

async function seedHealthMetrics(userId: string) {
  const now = Date.now();
  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset--) {
    const recordedAt = new Date(now - dayOffset * DAY_MS);

    await prisma.healthMetric.create({
      data: {
        userId,
        type: "HEART_RATE",
        value: randInt(62, 88),
        unit: "bpm",
        source: rand() < 0.5 ? "DEVICE" : "SELF_REPORTED",
        recordedAt,
      },
    });
    await prisma.healthMetric.create({
      data: {
        userId,
        type: "BLOOD_PRESSURE",
        value: randInt(112, 135),
        valueSecondary: randInt(72, 88),
        unit: "mmHg",
        source: "SELF_REPORTED",
        recordedAt,
      },
    });
    await prisma.healthMetric.create({
      data: {
        userId,
        type: "SLEEP_HOURS",
        value: Number((5.5 + rand() * 3).toFixed(1)),
        unit: "hours",
        source: rand() < 0.7 ? "DEVICE" : "SELF_REPORTED",
        recordedAt,
      },
    });
    await prisma.healthMetric.create({
      data: {
        userId,
        type: "STEPS",
        value: randInt(1500, 9500),
        unit: "steps",
        source: "DEVICE",
        recordedAt,
      },
    });
    await prisma.healthMetric.create({
      data: {
        userId,
        type: "HYDRATION_ML",
        value: randInt(900, 2400),
        unit: "ml",
        source: "SELF_REPORTED",
        recordedAt,
      },
    });
  }
}

async function seedCheckIns(userId: string) {
  const now = Date.now();
  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset--) {
    const date = new Date(now - dayOffset * DAY_MS);
    date.setHours(0, 0, 0, 0);
    await prisma.checkIn.create({
      data: {
        userId,
        date,
        mood: randInt(2, 5),
        energy: randInt(2, 5),
        sleepQuality: randInt(2, 5),
        stress: randInt(1, 4),
        pain: randInt(1, 3),
        medicationAdherence: randInt(3, 5),
        physicalActivity: randInt(1, 5),
        generalWellbeing: randInt(2, 5),
      },
    });
  }
}

async function main() {
  console.log("Resetting database...");
  await resetDatabase();

  console.log("Creating users...");
  const maria = await createUser({ email: "maria.alvarez@example.com", displayName: "Maria Alvarez" });
  const james = await createUser({ email: "james.whitfield@example.com", displayName: "James Whitfield" });
  const priya = await createUser({
    email: "priya.nair@example.com",
    displayName: "Priya Nair",
    accessibilityMode: true, // demonstrates Senior/Accessibility Mode (§12) out of the box
  });

  const alex = await createUser({ email: "alex.chen@example.com", displayName: "Alex Chen" });
  const sam = await createUser({ email: "sam.rivera@example.com", displayName: "Sam Rivera" });

  const drBrooks = await createUser({
    email: "dr.brooks@example.com",
    displayName: "Dr. Taylor Brooks",
    isCoach: true,
  });
  await prisma.coachProfile.create({
    data: {
      userId: drBrooks.id,
      bio: "Wellness coach focused on chronic-condition adherence and lifestyle goals.",
      credentials: "Certified Health & Wellness Coach (NBHWC)",
    },
  });

  console.log("Seeding medications and dose history...");
  await seedMedication(
    maria.id,
    {
      name: "Lisinopril",
      strength: "10 mg",
      form: "tablet",
      instructions: "Take once daily in the morning.",
      timesOfDay: ["08:00"],
      adherenceRate: 0.95,
    },
    maria.timezone,
  );
  await seedMedication(
    maria.id,
    {
      name: "Metformin",
      strength: "500 mg",
      form: "tablet",
      instructions: "Take with breakfast and dinner.",
      timesOfDay: ["08:00", "19:00"],
      adherenceRate: 0.9,
    },
    maria.timezone,
  );
  await seedMedication(
    james.id,
    {
      name: "Atorvastatin",
      strength: "20 mg",
      form: "tablet",
      instructions: "Take once daily in the evening.",
      timesOfDay: ["20:00"],
      adherenceRate: 0.85,
    },
    james.timezone,
  );
  await seedMedication(
    priya.id,
    {
      name: "Levothyroxine",
      strength: "75 mcg",
      form: "tablet",
      instructions: "Take on an empty stomach, 30 minutes before breakfast.",
      timesOfDay: ["07:00"],
      adherenceRate: 0.97,
    },
    priya.timezone,
  );

  console.log("Seeding wellness metrics and check-ins...");
  for (const user of [maria, james, priya]) {
    await seedHealthMetrics(user.id);
    await seedCheckIns(user.id);
  }

  console.log("Seeding buddy relationships...");
  const mariaAlexInvite = await prisma.buddyInvite.create({
    data: { fromUserId: maria.id, toUserId: alex.id, status: "ACCEPTED", respondedAt: new Date() },
  });
  const mariaAlexLink = await prisma.buddyLink.create({
    data: { userAId: maria.id, userBId: alex.id },
  });
  await prisma.buddyMessage.create({
    data: {
      buddyLinkId: mariaAlexLink.id,
      senderId: alex.id,
      type: "ENCOURAGEMENT",
      body: "Hey! Just checking in. Hope you're doing okay ❤️",
    },
  });
  await prisma.accountabilityGoal.create({
    data: {
      buddyLinkId: mariaAlexLink.id,
      createdByUserId: maria.id,
      title: "Walk 20 minutes, 5 days a week",
      status: "ACTIVE",
    },
  });

  const jamesSamInvite = await prisma.buddyInvite.create({
    data: { fromUserId: sam.id, toUserId: james.id, status: "ACCEPTED", respondedAt: new Date() },
  });
  const jamesSamLink = await prisma.buddyLink.create({
    data: { userAId: james.id, userBId: sam.id },
  });
  void mariaAlexInvite;
  void jamesSamInvite;

  // Default buddy grant is clinical detail (README "Buddy visibility"): the
  // buddy can see medications and adherence, not just engagement signals.
  for (const [ownerId, granteeId] of [
    [maria.id, alex.id],
    [james.id, sam.id],
  ] as const) {
    for (const category of ["MEDICATIONS", "ADHERENCE", "WELLNESS_METRICS"] as const) {
      await prisma.permissionGrant.create({
        data: { ownerId, granteeId, category, level: "VIEW" },
      });
    }
  }
  void jamesSamLink;

  console.log("Seeding coach relationship...");
  const coachLink = await prisma.coachLink.create({
    data: { coachUserId: drBrooks.id, patientUserId: maria.id, status: "ACTIVE" },
  });
  await prisma.coachNote.create({
    data: {
      coachLinkId: coachLink.id,
      authorUserId: drBrooks.id,
      body: "Maria is responding well to the morning walk goal. Adherence trending upward this month.",
    },
  });
  await prisma.coachGoal.create({
    data: {
      coachLinkId: coachLink.id,
      title: "Reduce added sugar intake",
      description: "Non-medical dietary goal, reviewed weekly.",
      status: "ACTIVE",
    },
  });
  for (const category of ["ADHERENCE", "WELLNESS_METRICS", "CHECKINS"] as const) {
    await prisma.permissionGrant.create({
      data: { ownerId: maria.id, granteeId: drBrooks.id, category, level: "VIEW" },
    });
  }

  console.log("Seeding notification preferences...");
  for (const user of [maria, james, priya]) {
    for (const category of ["MEDICATION", "WELLNESS_CHECKIN", "HYDRATION"] as const) {
      await prisma.notificationPreference.create({
        data: {
          userId: user.id,
          category,
          enabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        },
      });
    }
  }

  console.log("\nSeed complete. Demo accounts (password for all: CareConnect!Demo1):");
  for (const u of [maria, james, priya, alex, sam, drBrooks]) {
    console.log(`  ${u.email}${u.isCoach ? "  (coach)" : ""}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
