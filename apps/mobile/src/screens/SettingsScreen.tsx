import type { AuthUser } from "@careconnect/contracts";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import { useAccessibility } from "../accessibility/AccessibilityContext";
import { ApiError, updateAccessibilityMode } from "../api/client";

interface SettingsScreenProps {
  user: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onBack: () => void;
}

/**
 * The one screen that changes `User.accessibilityMode` (§12), so the toggle
 * here is the source of truth for the account, not a device-local
 * preference — logging in on another device picks up the same mode,
 * because `App.tsx` seeds `AccessibilityProvider` from `/auth/me` on login.
 */
export function SettingsScreen({ user, onUserUpdated, onBack }: SettingsScreenProps) {
  const { tokens, setMode } = useAccessibility();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(next: boolean) {
    setError(null);
    setSaving(true);
    // Reflect immediately so the screen itself demonstrates the new scale
    // while the request is in flight, not just after it resolves.
    setMode(next ? "accessibility" : "standard");
    try {
      const response = await updateAccessibilityMode(next);
      onUserUpdated(response.user);
    } catch (err) {
      setMode(user.accessibilityMode ? "accessibility" : "standard");
      setError(err instanceof ApiError ? err.message : "Couldn't save that setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.contrast.text.background,
        padding: tokens.type.body.fontSize,
      }}
    >
      <Text
        style={{
          fontSize: tokens.type.display.fontSize,
          lineHeight: tokens.type.display.lineHeight,
          color: tokens.contrast.text.foreground,
          fontWeight: "700",
          marginBottom: tokens.touchTarget.spacing * 2,
        }}
      >
        Settings
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: tokens.contrast.mutedText.foreground,
          borderRadius: 8,
          padding: tokens.touchTarget.spacing,
          minHeight: tokens.touchTarget.minSize,
        }}
      >
        <View style={{ flex: 1, marginRight: tokens.touchTarget.spacing }}>
          <Text
            style={{
              fontSize: tokens.type.heading.fontSize,
              lineHeight: tokens.type.heading.lineHeight,
              color: tokens.contrast.text.foreground,
              fontWeight: "600",
            }}
          >
            Senior / Accessibility Mode
          </Text>
          <Text style={{ fontSize: tokens.type.body.fontSize, color: tokens.contrast.mutedText.foreground }}>
            Larger text, bigger buttons, higher contrast, and no animation.
          </Text>
        </View>
        {saving ? (
          <ActivityIndicator />
        ) : (
          <Switch
            value={tokens.mode === "accessibility"}
            onValueChange={handleToggle}
            accessibilityLabel="Senior or Accessibility Mode"
          />
        )}
      </View>

      {error ? (
        <Text style={{ color: tokens.contrast.danger.background, marginTop: tokens.touchTarget.spacing }}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to dashboard"
        onPress={onBack}
        style={{
          minHeight: tokens.touchTarget.minSize,
          borderWidth: 1,
          borderColor: tokens.contrast.mutedText.foreground,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          marginTop: tokens.touchTarget.spacing * 2,
        }}
      >
        <Text style={{ fontSize: tokens.type.button.fontSize, color: tokens.contrast.text.foreground }}>
          ← Back to dashboard
        </Text>
      </Pressable>
    </View>
  );
}
