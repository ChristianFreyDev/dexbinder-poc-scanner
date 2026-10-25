/**
 * Cabeçalho padrão de topo de aba — achado real do usuário (25/10/2026):
 * cada tela tinha um tamanho e uma posição de título diferentes (Início
 * "DexBinder" 24px, Pokédex "Pokédex Nacional" 20px, Garimpo "DexBinder"
 * 22px, paddings diferentes entre elas). Um único componente compartilhado
 * garante que título/espaçamento nunca mais divirjam entre abas.
 *
 * Usado nas telas com um cabeçalho de topo de verdade (Início, Pokédex,
 * Garimpo). Fichários/Inventário não usam — são estados vazios com o título
 * centralizado no meio da tela, um padrão intencionalmente diferente (não é
 * a mesma divergência relatada pelo usuário).
 */
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../theme";

export function ScreenHeader({ title, subtitle }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 4 },
  title: { color: COLORS.textPrimary, fontSize: 22, fontWeight: "700" },
  subtitle: { color: COLORS.textMuted, fontSize: 12 },
});
