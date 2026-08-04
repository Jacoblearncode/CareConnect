import type { AdherenceReport, AuthUser, DoseInstance } from "@careconnect/contracts";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useAccessibility } from "../accessibility/AccessibilityContext";
import { ApiError, fetchAdherence, fetchTodaysDoses, recordDose } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface DashboardScreenProps {
  user: AuthUser;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const RECORDABLE_STATUSES = new Set(["PENDING", "SNOOZED", "MISSED"]);

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function summaryText(user: AuthUser, doses: DoseInstance[], adherence: AdherenceReport | null): string {
  const due = doses.filter((d) => RECORDABLE_STATUSES.has(d.status)).length;
  const taken = doses.filter((d) => d.status === "TAKEN").length;
  const rate = adherence?.today.ratePercent;
  const ratePart = rate === null || rate === undefined ? "" : ` Today's adherence is ${Math.round(rate)} percent.`;
  if (doses.length === 0) {
    return `Hello ${user.displayName}. You have no medications scheduled today.${ratePart}`;
  }
  return `Hello ${user.displayName}. You have ${doses.length} ${doses.length === 1 ? "dose" : "doses"} scheduled today: ${taken} taken, ${due} still due.${ratePart}`;
}

export function DashboardScreen({ user, onOpenSettings, onLogout }: DashboardScreenProps) {
  const { tokens } = useAccessibility();
  const [doses, setDoses] = useState<DoseInstance[]>([]);
  const [adherence, setAdherence] = useState<AdherenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDose, setConfirmDose] = useState<DoseInstance | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dosesRes, adherenceRes] = await Promise.all([fetchTodaysDoses(), fetchAdherence()]);
      setDoses(dosesRes.doses);
      setAdherence(adherenceRes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load today's data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleConfirmTaken() {
    if (!confirmDose) return;
    const doseId = confirmDose.id;
    setConfirmDose(null);
    try {
      await recordDose(doseId, "TAKEN");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't record that dose.");
    }
  }

  function handleReadAloud() {
    Speech.speak(summaryText(user, doses, adherence));
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.contrast.text.background }}
      contentContainerStyle={{ padding: tokens.type.body.fontSize }}
    >
      <Text
        style={{
          fontSize: tokens.type.display.fontSize,
          lineHeight: tokens.type.display.lineHeight,
          color: tokens.contrast.text.foreground,
          fontWeight: "700",
        }}
      >
        Hello, {user.displayName}
      </Text>
      <Text
        style={{
          fontSize: tokens.type.body.fontSize,
          color: tokens.contrast.mutedText.foreground,
          marginBottom: tokens.touchTarget.spacing,
        }}
      >
        What do you need to do for your health today?
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Read today's summary aloud"
        onPress={handleReadAloud}
        style={{
          minHeight: tokens.touchTarget.minSize,
          backgroundColor: tokens.contrast.button.background,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: tokens.touchTarget.spacing * 2,
          paddingHorizontal: 12,
        }}
      >
        <Text style={{ color: tokens.contrast.button.foreground, fontSize: tokens.type.button.fontSize }}>
          🔊 Read today's summary aloud
        </Text>
      </Pressable>

      {loading ? <ActivityIndicator /> : null}
      {error ? (
        <Text style={{ color: tokens.contrast.danger.background, marginBottom: tokens.touchTarget.spacing }}>
          {error}
        </Text>
      ) : null}

      {!loading && doses.length === 0 && !error ? (
        <Text style={{ fontSize: tokens.type.body.fontSize, color: tokens.contrast.mutedText.foreground }}>
          No medications scheduled today.
        </Text>
      ) : null}

      {doses.map((dose) => (
        <View
          key={dose.id}
          style={{
            borderWidth: 1,
            borderColor: tokens.contrast.mutedText.foreground,
            borderRadius: 8,
            padding: tokens.touchTarget.spacing,
            marginBottom: tokens.touchTarget.spacing,
          }}
        >
          <Text
            style={{
              fontSize: tokens.type.heading.fontSize,
              lineHeight: tokens.type.heading.lineHeight,
              color: tokens.contrast.text.foreground,
              fontWeight: "600",
            }}
          >
            {dose.medicationName ?? "Medication"}
          </Text>
          <Text style={{ fontSize: tokens.type.body.fontSize, color: tokens.contrast.mutedText.foreground }}>
            {formatTime(dose.scheduledAt)} · {dose.status}
          </Text>
          {RECORDABLE_STATUSES.has(dose.status) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mark ${dose.medicationName ?? "medication"} as taken`}
              onPress={() => setConfirmDose(dose)}
              style={{
                minHeight: tokens.touchTarget.minSize,
                backgroundColor: tokens.contrast.button.background,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                marginTop: tokens.touchTarget.spacing,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ color: tokens.contrast.button.foreground, fontSize: tokens.type.button.fontSize }}>
                Mark as taken
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      <View style={{ flexDirection: "row", marginTop: tokens.touchTarget.spacing * 2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={onOpenSettings}
          style={{
            minHeight: tokens.touchTarget.minSize,
            borderWidth: 1,
            borderColor: tokens.contrast.mutedText.foreground,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
            marginRight: tokens.touchTarget.spacing,
          }}
        >
          <Text style={{ fontSize: tokens.type.button.fontSize, color: tokens.contrast.text.foreground }}>
            Settings
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={onLogout}
          style={{
            minHeight: tokens.touchTarget.minSize,
            borderWidth: 1,
            borderColor: tokens.contrast.mutedText.foreground,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
          }}
        >
          <Text style={{ fontSize: tokens.type.button.fontSize, color: tokens.contrast.text.foreground }}>
            Log out
          </Text>
        </Pressable>
      </View>

      <ConfirmDialog
        visible={confirmDose !== null}
        title="Mark dose as taken?"
        message={`Confirm you took ${confirmDose?.medicationName ?? "this medication"} scheduled at ${
          confirmDose ? formatTime(confirmDose.scheduledAt) : ""
        }.`}
        confirmLabel="Yes, mark as taken"
        cancelLabel="Cancel"
        onConfirm={handleConfirmTaken}
        onCancel={() => setConfirmDose(null)}
      />
    </ScrollView>
  );
}
