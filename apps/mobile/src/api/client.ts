import type {
  AdherenceReport,
  AuthResponse,
  AuthUser,
  DoseInstance,
  ErrorResponse,
  Medication,
  RecordableStatus,
} from "@careconnect/contracts";

/**
 * The API base URL comes from EXPO_PUBLIC_API_URL (Expo inlines any
 * EXPO_PUBLIC_-prefixed env var into the client bundle at build time —
 * see .env.example), not a hardcoded host, since apps/api can run against a
 * local dev server or a deployed one without a code change.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;

/** Called after login/logout; kept as simple in-memory state — session persistence across app restarts is a follow-up, not required by §12's accessibility scope. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as (T & ErrorResponse) | null;

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    const code = body?.error?.code ?? "unknown_error";
    throw new ApiError(response.status, code, message);
  }

  return body as T;
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe(): Promise<{ user: AuthUser }> {
  return request("/auth/me");
}

export function updateAccessibilityMode(accessibilityMode: boolean): Promise<{ user: AuthUser }> {
  return request("/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ accessibilityMode }),
  });
}

export function fetchMedications(): Promise<{ medications: Medication[] }> {
  return request("/medications");
}

export function fetchTodaysDoses(): Promise<{ doses: DoseInstance[] }> {
  return request("/doses/today");
}

export function fetchAdherence(): Promise<AdherenceReport> {
  return request("/medications/adherence");
}

export function recordDose(doseId: string, status: RecordableStatus): Promise<{ dose: DoseInstance }> {
  return request(`/doses/${doseId}/record`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
