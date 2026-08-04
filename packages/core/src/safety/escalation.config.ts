/**
 * Escalation guidance (§11) — configurable per deployment, per the resolved
 * decision in README "Decision log": one config object holds a region and
 * any hotline numbers, defaulting to neutral wording when unset. No env
 * access here — core stays environment-agnostic; apps/api reads the actual
 * environment variables and constructs this object.
 */

export interface EscalationConfig {
  region?: string | undefined;
  emergencyNumber?: string | undefined;
  crisisLineName?: string | undefined;
  crisisLineNumber?: string | undefined;
}

const DEFAULT_GUIDANCE =
  "If you are in immediate danger or thinking about harming yourself, please contact your local " +
  "emergency services or a crisis line right now. You deserve support, and trained people are " +
  "available to help.";

export function escalationGuidance(config: EscalationConfig): string {
  if (!config.emergencyNumber && !config.crisisLineNumber) {
    return DEFAULT_GUIDANCE;
  }

  const parts: string[] = [
    "If you are in immediate danger or thinking about harming yourself, please reach out right now:",
  ];
  if (config.emergencyNumber) {
    parts.push(`Emergency services: ${config.emergencyNumber}.`);
  }
  if (config.crisisLineNumber) {
    parts.push(`${config.crisisLineName ?? "Crisis line"}: ${config.crisisLineNumber}.`);
  }
  parts.push("You deserve support, and trained people are available to help.");
  return parts.join(" ");
}
