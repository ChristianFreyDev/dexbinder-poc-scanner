/**
 * Pokédex — lista as 1.025 espécies reais do cadastro mestre
 * (app/assets/data/national-dex.json, ver scripts/build-national-dex.js e
 * especificação da Entrega 1, seção 4.7). Isto é dado de referência real
 * (não inventado) — diferente dos contadores de Fichários/Inventário na
 * Home, que ficam zerados por não haver dados de usuário ainda.
 *
 * NÃO mostra quais espécies têm carta no catálogo (associação carta->
 * espécie é uma limitação documentada e NÃO confiável nesta entrega — ver
 * src/catalog/catalogRepository.js, searchByPokemon()) — só a lista de
 * espécies em si, que é independente das cartas.
 */
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../theme";
import nationalDex from "../assets/data/national-dex.json";

export default function PokedexScreen() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nationalDex.species;
    return nationalDex.species.filter(
      (s) => s.slug.includes(q) || String(s.nationalNumber).includes(q) || (s.names.en || "").toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <Text style={styles.title}>Pokédex Nacional</Text>
      <Text style={styles.subtitle}>
        {nationalDex.totalSpecies} espécies · fonte: PokeAPI ({new Date(nationalDex.generatedAt).toLocaleDateString("pt-BR")})
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por nome ou número"
        placeholderTextColor={COLORS.textMuted}
        style={styles.input}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.nationalNumber)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowNumber}>#{String(item.nationalNumber).padStart(4, "0")}</Text>
            <Text style={styles.rowName}>{item.names.en || item.slug}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.body}>Nenhuma espécie encontrada.</Text>}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg, padding: 20, gap: 12 },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "700" },
  subtitle: { color: COLORS.textMuted, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowNumber: { color: COLORS.textMuted, fontSize: 13, width: 56 },
  rowName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "500" },
  body: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginTop: 20 },
});
