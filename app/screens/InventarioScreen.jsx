/**
 * Inventário — estado inicial honesto (especificação da Entrega 1, seção
 * 4.8), mesma lógica de FichariosScreen.jsx. Gestão completa de exemplares
 * físicos e transferência entre fichários é FORA do escopo desta entrega
 * (seção 8) — o scanner (aba Garimpo) identifica e consulta, mas nunca
 * grava nada aqui ainda (seção 4.5).
 */
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../theme";

export default function InventarioScreen() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <Text style={styles.title}>Inventário</Text>
      <Text style={styles.body}>
        Seu inventário está vazio. O scanner (aba Garimpo) já identifica cartas no catálogo completo, mas ainda
        não salva exemplares aqui — isso é um recurso das próximas entregas.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "700" },
  body: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
