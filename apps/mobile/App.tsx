import type { AuthUser } from "@careconnect/contracts";
import { StatusBar } from "expo-status-bar";
import React, { useState } from "react";
import { AccessibilityProvider, useAccessibility } from "./src/accessibility/AccessibilityContext";
import { setAccessToken } from "./src/api/client";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

type Screen = "login" | "dashboard" | "settings";

function Root() {
  const { setMode } = useAccessibility();
  const [screen, setScreen] = useState<Screen>("login");
  const [user, setUser] = useState<AuthUser | null>(null);

  function handleLoggedIn(loggedInUser: AuthUser) {
    setUser(loggedInUser);
    setMode(loggedInUser.accessibilityMode ? "accessibility" : "standard");
    setScreen("dashboard");
  }

  function handleUserUpdated(updatedUser: AuthUser) {
    setUser(updatedUser);
  }

  function handleLogout() {
    setAccessToken(null);
    setUser(null);
    setMode("standard");
    setScreen("login");
  }

  if (screen === "login" || !user) {
    return <LoginScreen onLoggedIn={handleLoggedIn} />;
  }
  if (screen === "settings") {
    return <SettingsScreen user={user} onUserUpdated={handleUserUpdated} onBack={() => setScreen("dashboard")} />;
  }
  return (
    <DashboardScreen user={user} onOpenSettings={() => setScreen("settings")} onLogout={handleLogout} />
  );
}

export default function App() {
  return (
    <AccessibilityProvider>
      <Root />
      <StatusBar style="auto" />
    </AccessibilityProvider>
  );
}
