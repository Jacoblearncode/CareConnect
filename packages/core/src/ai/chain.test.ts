import { describe, expect, it } from "vitest";
import { callWithFallback, type NamedProvider } from "./chain.js";

const messages = [{ role: "user" as const, content: "hello" }];

describe("callWithFallback", () => {
  it("uses the first provider when it succeeds", async () => {
    const providers: NamedProvider[] = [
      { name: "primary", call: async () => "response from primary" },
      { name: "fallback", call: async () => "response from fallback" },
    ];
    const result = await callWithFallback(providers, messages);
    expect(result.providerUsed).toBe("primary");
    expect(result.text).toBe("response from primary");
    expect(result.attempted).toEqual(["primary"]);
  });

  it("falls through to the next provider when the first throws", async () => {
    const providers: NamedProvider[] = [
      {
        name: "primary",
        call: async () => {
          throw new Error("primary is down");
        },
      },
      { name: "fallback", call: async () => "response from fallback" },
    ];
    const result = await callWithFallback(providers, messages);
    expect(result.providerUsed).toBe("fallback");
    expect(result.attempted).toEqual(["primary", "fallback"]);
  });

  it("falls through past a provider that never resolves (timeout)", async () => {
    const providers: NamedProvider[] = [
      { name: "hanging", call: () => new Promise(() => {}) },
      { name: "fallback", call: async () => "response from fallback" },
    ];
    const result = await callWithFallback(providers, messages, 20);
    expect(result.providerUsed).toBe("fallback");
    expect(result.attempted).toEqual(["hanging", "fallback"]);
  });

  it("throws when every provider fails, naming all of them", async () => {
    const providers: NamedProvider[] = [
      {
        name: "primary",
        call: async () => {
          throw new Error("down");
        },
      },
      {
        name: "fallback",
        call: async () => {
          throw new Error("also down");
        },
      },
    ];
    await expect(callWithFallback(providers, messages)).rejects.toThrow(/primary, fallback/);
  });

  it("never calls a later provider once an earlier one has succeeded", async () => {
    let fallbackCalled = false;
    const providers: NamedProvider[] = [
      { name: "primary", call: async () => "ok" },
      {
        name: "fallback",
        call: async () => {
          fallbackCalled = true;
          return "should not run";
        },
      },
    ];
    await callWithFallback(providers, messages);
    expect(fallbackCalled).toBe(false);
  });
});
