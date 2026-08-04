/**
 * Generates the scheduled dose times a ScheduleRule implies over a date
 * range (Build Plan §3.2): DoseInstance rows are materialized ahead of time
 * from this, rather than the schedule being evaluated live on every read.
 *
 * Known simplification: `timesOfDay` is interpreted as wall-clock time in
 * whatever timezone the JS Date runtime is in, not the rule's stored `timezone`
 * field. Correct IANA-timezone-aware scheduling (handling DST, a user whose
 * timezone differs from the server's) needs a library (e.g. Luxon) and is
 * out of scope for this prototype — noted here rather than silently wrong.
 */

export interface ScheduleRuleInput {
  timesOfDay: string[]; // "HH:MM", 24-hour
  daysOfWeek: number[]; // 0 (Sunday) - 6; empty = every day
  windowMinutes: number;
}

export interface GeneratedDoseTime {
  scheduledAt: Date;
  windowEndsAt: Date;
}

export function generateDoseTimes(
  rule: ScheduleRuleInput,
  rangeStart: Date,
  rangeEnd: Date,
): GeneratedDoseTime[] {
  if (rangeStart > rangeEnd) {
    return [];
  }

  const results: GeneratedDoseTime[] = [];
  const dayCursor = new Date(rangeStart);
  dayCursor.setHours(0, 0, 0, 0);

  while (dayCursor <= rangeEnd) {
    const dow = dayCursor.getDay();
    if (rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(dow)) {
      for (const time of rule.timesOfDay) {
        const [hoursStr, minutesStr] = time.split(":");
        const scheduledAt = new Date(dayCursor);
        scheduledAt.setHours(Number(hoursStr), Number(minutesStr), 0, 0);
        if (scheduledAt >= rangeStart && scheduledAt <= rangeEnd) {
          const windowEndsAt = new Date(scheduledAt.getTime() + rule.windowMinutes * 60_000);
          results.push({ scheduledAt, windowEndsAt });
        }
      }
    }
    dayCursor.setDate(dayCursor.getDate() + 1);
  }

  return results.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}
