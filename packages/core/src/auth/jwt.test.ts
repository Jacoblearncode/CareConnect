import { describe, expect, it } from "vitest";
import { JwtError, signJwt, verifyJwt } from "./jwt.js";

describe("jwt", () => {
  it("round-trips a payload", async () => {
    const token = await signJwt({ sub: "user-1", role: "patient" }, "test-secret", 60);
    const payload = await verifyJwt(token, "test-secret");
    expect(payload.sub).toBe("user-1");
    expect(payload["role"]).toBe("patient");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signJwt({ sub: "user-1" }, "secret-a", 60);
    await expect(verifyJwt(token, "secret-b")).rejects.toBeInstanceOf(JwtError);
  });

  it("rejects an expired token", async () => {
    const token = await signJwt({ sub: "user-1" }, "test-secret", -1);
    await expect(verifyJwt(token, "test-secret")).rejects.toThrow("expired");
  });

  it("rejects a malformed token", async () => {
    await expect(verifyJwt("not-a-jwt", "test-secret")).rejects.toBeInstanceOf(JwtError);
  });
});
