/**
 * Pokédex — lista real das 1.025 espécies (app/assets/data/national-dex.json)
 * + progresso global real (especificação da Entrega 2, seções 8.6, 9.3):
 * uma espécie só aparece como obtida com associação `confirmed` a pelo
 * menos uma cópia física do inventário inteiro (mesmo sem fichário).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../theme";
import { ScreenHeader } from "../components/ScreenHeader";
import { AppButton } from "../components/AppButton";
import { collectionProgressService, cardSpeciesRepository, physicalCopyRepository } from "../../src/collections";
import { suggestSpeciesForCardName } from "../../src/domain/speciesSuggestion";
import nationalDex from "../assets/data/national-dex.json";

const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "obtained", label: "Obtidas" },
  { key: "missing", label: "Faltantes" },
];

function SpeciesDetailModal({ species, visible, onClose, onChanged }) {
  const [copiesForSpecies, setCopiesForSpecies] = useState([]);
  const [candidateCopies, setCandidateCopies] = useState([]);

  const reload = useCallback(async () => {
    if (!species) return;
    const [represented, allCopies] = await Promise.all([
      collectionProgressService.getCopiesForSpecies(species.nationalNumber),
      physicalCopyRepository.list({}),
    ]);
    setCopiesForSpecies(represented);
    const representedKeys = new Set(represented.map((c) => c.catalogCardKey));
    const candidates = allCopies.filter((c) => {
      if (representedKeys.has(c.catalogCardKey)) return false;
      const suggestions = suggestSpeciesForCardName(c.cardNameSnapshot, nationalDex.species, { limit: 3 });
      return suggestions.some((s) => s.nationalNumber === species.nationalNumber && s.matchType !== "contains");
    });
    setCandidateCopies(candidates);
  }, [species]);

  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  if (!species) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>
            #{String(species.nationalNumber).padStart(4, "0")} {species.names.en || species.slug}
          </Text>

          <Text style={styles.sectionLabel}>Cópias confirmadas ({copiesForSpecies.length})</Text>
          {copiesForSpecies.length === 0 && <Text style={styles.bodyText}>Nenhuma cópia confirmada para esta espécie ainda.</Text>}
          {copiesForSpecies.map((c) => (
            <Text key={c.id} style={styles.bodyText}>
              • {c.cardNameSnapshot} ({c.sourceLanguage?.toUpperCase()}) — {c.collectionId ? "em fichário" : "sem fichário"}
              {c.pageNumber ? `, pág. ${c.pageNumber}/bolso ${c.slotIndex}` : ""}
            </Text>
          ))}

          {candidateCopies.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Cópias do inventário que talvez representem esta espécie</Text>
              <Text style={styles.captionText}>Associação ao Pokémon precisa ser confirmada — nome parecido não é suficiente sozinho.</Text>
              {candidateCopies.map((c) => (
                <View key={c.id} style={styles.candidateRow}>
                  <Text style={styles.bodyText}>{c.cardNameSnapshot}</Text>
                  <AppButton
                    title="Confirmar"
                    variant="successOutline"
                    compact
                    onPress={async () => {
                      await cardSpeciesRepository.confirmAssociation({ catalogCardKey: c.catalogCardKey, nationalDexNumber: species.nationalNumber });
                      reload();
                      onChanged();
                    }}
                  />
                </View>
              ))}
            </>
          )}

          <AppButton title="Fechar" variant="outline" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function PokedexScreen() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState(null);
  const [selectedSpecies, setSelectedSpecies] = useState(null);

  const reload = useCallback(async () => {
    const result = await collectionProgressService.getPokedexGlobalProgress(nationalDex.totalSpecies);
    setProgress(result);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = nationalDex.species;
    if (q) {
      list = list.filter(
        (s) => s.slug.includes(q) || String(s.nationalNumber).includes(q) || Object.values(s.names).some((n) => n && n.toLowerCase().includes(q))
      );
    }
    if (progress && filter === "obtained") list = list.filter((s) => progress.obtainedDexNumbers.has(s.nationalNumber));
    if (progress && filter === "missing") list = list.filter((s) => !progress.obtainedDexNumbers.has(s.nationalNumber));
    return list;
  }, [query, filter, progress]);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScreenHeader
        title="Pokédex Nacional"
        subtitle={
          progress
            ? `${progress.obtainedSpeciesCount}/${nationalDex.totalSpecies} obtidas (${progress.completionPercentage}%)`
            : `${nationalDex.totalSpecies} espécies · fonte: PokeAPI (${new Date(nationalDex.generatedAt).toLocaleDateString("pt-BR")})`
        }
      />
      <View style={styles.content}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nome ou número"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {FILTERS.map((f) => (
            <Pressable key={f.key} onPress={() => setFilter(f.key)} style={[styles.chip, filter === f.key && styles.chipSelected]}>
              <Text style={[styles.chipText, filter === f.key && styles.chipTextSelected]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.nationalNumber)}
          renderItem={({ item }) => {
            const obtained = progress?.obtainedDexNumbers.has(item.nationalNumber);
            return (
              <Pressable style={styles.row} onPress={() => setSelectedSpecies(item)}>
                <Text style={styles.rowNumber}>#{String(item.nationalNumber).padStart(4, "0")}</Text>
                <Text style={styles.rowName}>{item.names.en || item.slug}</Text>
                <Text style={{ color: obtained ? COLORS.successText : COLORS.textMuted, fontSize: 12 }}>{obtained ? "Obtida" : "—"}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.body}>Nenhuma espécie encontrada.</Text>}
          style={{ flex: 1 }}
        />
      </View>

      <SpeciesDetailModal species={selectedSpecies} visible={Boolean(selectedSpecies)} onClose={() => setSelectedSpecies(null)} onChanged={reload} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
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
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 12 },
  chipTextSelected: { color: "#FFFFFF", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowNumber: { color: COLORS.textMuted, fontSize: 13, width: 56 },
  rowName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "500", flex: 1 },
  body: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginTop: 20 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8, maxHeight: "80%" },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: "700" },
  sectionLabel: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "600", marginTop: 8 },
  bodyText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  captionText: { color: COLORS.textMuted, fontSize: 11 },
  candidateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
});
