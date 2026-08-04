import type { safety } from "@careconnect/core";

export interface AiProviderConfig {
  cfAccountId?: string | undefined;
  cfWorkersAiApiToken?: string | undefined;
  groqApiKey?: string | undefined;
}

export interface AppConfig {
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  ai: AiProviderConfig;
  escalation: safety.EscalationConfig;
  corsOrigins: string[];
}

function strOrUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const jwtAccessSecret = env["JWT_ACCESS_SECRET"];
  if (!jwtAccessSecret) {
    throw new Error("JWT_ACCESS_SECRET is required.");
  }
  return {
    jwtAccessSecret,
    accessTokenTtlSeconds: Number(env["ACCESS_TOKEN_TTL_SECONDS"] ?? 900),
    refreshTokenTtlSeconds: Number(env["REFRESH_TOKEN_TTL_SECONDS"] ?? 60 * 60 * 24 * 30),
    ai: {
      cfAccountId: strOrUndefined(env["CF_ACCOUNT_ID"]),
      cfWorkersAiApiToken: strOrUndefined(env["CF_WORKERS_AI_API_TOKEN"]),
      groqApiKey: strOrUndefined(env["GROQ_API_KEY"]),
    },
    escalation: {
      region: strOrUndefined(env["ESCALATION_REGION"]),
      emergencyNumber: strOrUndefined(env["ESCALATION_EMERGENCY_NUMBER"]),
      crisisLineName: strOrUndefined(env["ESCALATION_CRISIS_LINE_NAME"]),
      crisisLineNumber: strOrUndefined(env["ESCALATION_CRISIS_LINE_NUMBER"]),
    },
    // Auth is bearer-token, not cookie-based, so a permissive CORS default
    // doesn't hand out an ambient credential the way it would for a
    // cookie-authenticated API — but it's still env-configurable so a real
    // deployment can lock it to its actual client origins (§14).
    corsOrigins: strOrUndefined(env["CORS_ORIGINS"])?.split(",").map((o) => o.trim()) ?? ["*"],
  };
}
