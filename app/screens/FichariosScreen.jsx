/**
 * Fichários — estado inicial honesto (especificação da Entrega 1, seção
 * 4.8): "criar telas iniciais honestas para as demais áreas, com estados
 * vazios e sem dados fictícios de inventário". CRUD completo de fichários/
 * checklist é explicitamente FORA do escopo desta entrega (seção 8).
 */
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../theme";

export default function FichariosScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Fichários</Text>
      <Text style={styles.body}>
        Você ainda não tem fichários. Criar e gerenciar fichários (Pokédex Nacional, Escarlate e Violeta — 151,
        coleções personalizadas) é um recurso das próximas entregas.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "700" },
  body: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
