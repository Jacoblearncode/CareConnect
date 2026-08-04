import type { AuthUser } from "@careconnect/contracts";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useAccessibility } from "../accessibility/AccessibilityContext";
import { ApiError, login, setAccessToken } from "../api/client";

interface LoginScreenProps {
  onLoggedIn: (user: AuthUser, refreshToken: string) => void;
}

export function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const { tokens } = useAccessibility();
  const [email, setEmail] = useState("maria.alvarez@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const response = await login(email.trim(), password);
      setAccessToken(response.tokens.accessToken);
      onLoggedIn(response.user, response.tokens.refreshToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.contrast.text.background,
        padding: tokens.type.body.fontSize,
        justifyContent: "center",
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
        CareConnect
      </Text>

      <Text
        style={{
          fontSize: tokens.type.caption.fontSize,
          color: tokens.contrast.mutedText.foreground,
          marginBottom: 4,
        }}
      >
        Email
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        accessibilityLabel="Email address"
        style={{
          minHeight: tokens.touchTarget.minSize,
          fontSize: tokens.type.body.fontSize,
          borderWidth: 1,
          borderColor: tokens.contrast.mutedText.foreground,
          borderRadius: 8,
          paddingHorizontal: 12,
          marginBottom: tokens.touchTarget.spacing,
          color: tokens.contrast.text.foreground,
        }}
      />

      <Text
        style={{
          fontSize: tokens.type.caption.fontSize,
          color: tokens.contrast.mutedText.foreground,
          marginBottom: 4,
        }}
      >
        Password
      </Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Password"
        style={{
          minHeight: tokens.touchTarget.minSize,
          fontSize: tokens.type.body.fontSize,
          borderWidth: 1,
          borderColor: tokens.contrast.mutedText.foreground,
          borderRadius: 8,
          paddingHorizontal: 12,
          marginBottom: tokens.touchTarget.spacing * 2,
          color: tokens.contrast.text.foreground,
        }}
      />

      {error ? (
        <Text
          style={{
            color: tokens.contrast.danger.background,
            fontSize: tokens.type.body.fontSize,
            marginBottom: tokens.touchTarget.spacing,
          }}
        >
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log in"
        onPress={handleSubmit}
        disabled={loading || !email || !password}
        style={{
          minHeight: tokens.touchTarget.minSize,
          backgroundColor: tokens.contrast.button.background,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          opacity: loading || !email || !password ? 0.6 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={tokens.contrast.button.foreground} />
        ) : (
          <Text style={{ color: tokens.contrast.button.foreground, fontSize: tokens.type.button.fontSize }}>
            Log in
          </Text>
        )}
      </Pressable>

      <Text
        style={{
          fontSize: tokens.type.caption.fontSize,
          color: tokens.contrast.mutedText.foreground,
          marginTop: tokens.touchTarget.spacing * 2,
        }}
      >
        Demo accounts use the password CareConnect!Demo1 — see apps/api/prisma/seed.ts.
      </Text>
    </View>
  );
}
