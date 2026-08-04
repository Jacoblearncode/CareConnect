export interface AppConfig {
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
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
  };
}
