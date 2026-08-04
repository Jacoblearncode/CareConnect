import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAccessibility } from "../accessibility/AccessibilityContext";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A custom modal, not the native Alert.alert (§12 "confirmation dialogs for
 * important actions"). The native alert can't be resized to the
 * Accessibility Mode touch-target/type scale — its buttons and text are
 * fixed OS chrome — so an important action (like recording a dose) needs a
 * dialog this app actually controls the sizing of.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { tokens } = useAccessibility();

  return (
    <Modal visible={visible} transparent animationType={tokens.motion.enabled ? "fade" : "none"} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: tokens.contrast.text.background, padding: tokens.type.body.fontSize },
          ]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text
            style={{
              fontSize: tokens.type.heading.fontSize,
              lineHeight: tokens.type.heading.lineHeight,
              color: tokens.contrast.text.foreground,
              fontWeight: "700",
              marginBottom: 8,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: tokens.type.body.fontSize,
              lineHeight: tokens.type.body.lineHeight,
              color: tokens.contrast.mutedText.foreground,
              marginBottom: 16,
            }}
          >
            {message}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              style={[
                styles.button,
                {
                  minHeight: tokens.touchTarget.minSize,
                  borderColor: tokens.contrast.mutedText.foreground,
                  borderWidth: 1,
                  marginRight: tokens.touchTarget.spacing,
                },
              ]}
            >
              <Text style={{ fontSize: tokens.type.button.fontSize, color: tokens.contrast.text.foreground }}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              onPress={onConfirm}
              style={[
                styles.button,
                { minHeight: tokens.touchTarget.minSize, backgroundColor: tokens.contrast.button.background },
              ]}
            >
              <Text style={{ fontSize: tokens.type.button.fontSize, color: tokens.contrast.button.foreground }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "85%",
    maxWidth: 420,
    borderRadius: 12,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  button: {
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
});
