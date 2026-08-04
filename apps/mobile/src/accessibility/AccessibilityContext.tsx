import { getTokens, type AccessibilityMode, type Tokens } from "@careconnect/tokens";
import React, { createContext, useContext, useMemo, useState } from "react";

interface AccessibilityContextValue {
  tokens: Tokens;
  mode: AccessibilityMode;
  /** Sets the mode locally. Callers that need it persisted to the account (e.g. the Settings screen) call the API themselves, then this. */
  setMode: (mode: AccessibilityMode) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

/**
 * The single root provider (Build Plan §3.5): every screen reads type,
 * touch-target, contrast, and motion values from here rather than each
 * screen deciding its own "senior version." `mode` starts as `standard` and
 * is synced from `User.accessibilityMode` once `/auth/me` resolves after
 * login (see App.tsx).
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AccessibilityMode>("standard");
  const tokens = useMemo(() => getTokens(mode), [mode]);
  const value = useMemo(() => ({ tokens, mode, setMode }), [tokens, mode]);
  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    throw new Error("useAccessibility() must be called within an AccessibilityProvider.");
  }
  return ctx;
}
