/**
 * Botão customizado compartilhado (extraído de app/index.jsx — Entrega 0 —
 * onde era definido localmente). Mesmo visual já validado em dispositivo
 * físico, reutilizado agora pelas telas novas da Entrega 1.
 */
import { Pressable, StyleSheet, Text } from "react-native";
import { COLORS } from "../theme";

export const BUTTON_VARIANTS = {
  primary: { bg: COLORS.primary, text: "#FFFFFF" },
  outline: { bg: "transparent", border: COLORS.border, text: COLORS.textPrimary },
  warning: { bg: COLORS.warning, text: "#FFFFFF" },
  success: { bg: COLORS.success, text: "#FFFFFF" },
  // Pedido do usuário (25/10/2026): só contorno + texto verdes, sem fundo —
  // usado no botão "Confirmar" da lista de candidatos.
  successOutline: { bg: "transparent", border: COLORS.success, text: COLORS.success },
};

export function AppButton({ title, onPress, variant = "primary", compact = false, disabled = false }) {
  const variantStyle = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: variantStyle.bg, borderColor: variantStyle.border, borderWidth: variantStyle.border ? 1 : 0 },
        pressed && !disabled && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.buttonText, compact && styles.buttonTextCompact, { color: variantStyle.text }]}>{title}</Text>
    </Pressable>
  );
}

// Valores idênticos aos de app/index.jsx (Entrega 0) — mesmo visual já
// validado em dispositivo físico, não reinventado aqui.
const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonCompact: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  buttonTextCompact: {
    fontSize: 13,
  },
});
