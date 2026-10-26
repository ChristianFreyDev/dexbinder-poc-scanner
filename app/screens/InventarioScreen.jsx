/**
 * Inventário geral (especificação da Entrega 2, seção 8.7): total real de
 * cópias físicas e impressões distintas, filtro por fichário/"Sem
 * fichário", busca por nome/set, e ações de transferir/remover.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../theme";
import { ScreenHeader } from "../components/ScreenHeader";
import { collectionRepository, physicalCopyRepository } from "../../src/collections";

function CopyCard({ copy, collectionsById, onTransfer, onRemove }) {
  const locationLabel = copy.collectionId
    ? `${collectionsById.get(copy.collectionId)?.name ?? "(fichário)"}${copy.pageNumber ? ` · pág. ${copy.pageNumber}, bolso ${copy.slotIndex}` : " · aguardando organização"}`
    : "Sem fichário";

  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{copy.cardNameSnapshot || "(sem nome)"}</Text>
        <Text style={styles.cardMeta}>
          {copy.setNameSnapshot || copy.sourceSetId} #{copy.localId} · {copy.sourceLanguage?.toUpperCase()}
        </Text>
        <Text style={styles.cardLocation}>{locationLabel}</Text>
      </View>
      <View style={{ gap: 6, alignItems: "flex-end" }}>
        <Pressable onPress={() => onTransfer(copy)}>
          <Text style={{ color: COLORS.primary, fontSize: 12 }}>Mover</Text>
        </Pressable>
        <Pressable onPress={() => onRemove(copy.id)}>
          <Text style={{ color: COLORS.dangerText, fontSize: 12 }}>Remover</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TransferSheet({ copy, collections, onClose, onConfirm }) {
  if (!copy) return null;
  return (
    <View style={styles.transferOverlay}>
      <View style={styles.transferSheet}>
        <Text style={styles.cardName}>Mover "{copy.cardNameSnapshot}"</Text>
        <Pressable style={styles.transferRow} onPress={() => onConfirm(copy.id, null)}>
          <Text style={styles.cardMeta}>Sem fichário</Text>
        </Pressable>
        {collections.map((c) => (
          <Pressable key={c.id} style={styles.transferRow} onPress={() => onConfirm(copy.id, c.id)}>
            <Text style={styles.cardMeta}>{c.name}</Text>
          </Pressable>
        ))}
        <Pressable style={{ marginTop: 10 }} onPress={onClose}>
          <Text style={{ color: COLORS.textSecondary, textAlign: "center" }}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function InventarioScreen() {
  const [copies, setCopies] = useState([]);
  const [collections, setCollections] = useState([]);
  const [totals, setTotals] = useState(null);
  const [query, setQuery] = useState("");
  const [filterCollectionId, setFilterCollectionId] = useState("__all__"); // "__all__" | "__unassigned__" | id
  const [transferTarget, setTransferTarget] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async () => {
    const [allCopies, allCollections, counts] = await Promise.all([
      physicalCopyRepository.list({}),
      collectionRepository.list({ includeArchived: false }),
      physicalCopyRepository.getCounts(),
    ]);
    setCopies(allCopies);
    setCollections(allCollections);
    setTotals(counts);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const collectionsById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);

  const filtered = useMemo(() => {
    let list = copies;
    if (filterCollectionId === "__unassigned__") list = list.filter((c) => c.collectionId == null);
    else if (filterCollectionId !== "__all__") list = list.filter((c) => c.collectionId === filterCollectionId);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.cardNameSnapshot || "").toLowerCase().includes(q) ||
          (c.setNameSnapshot || "").toLowerCase().includes(q) ||
          (c.localId || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [copies, filterCollectionId, query]);

  const handleTransferConfirm = async (copyId, collectionId) => {
    const result = await physicalCopyRepository.transferCopy(copyId, { collectionId, pageNumber: null, slotIndex: null });
    if (result.conflict) setNotice("Não foi possível mover: bolso já ocupado.");
    setTransferTarget(null);
    reload();
  };

  const handleRemove = async (copyId) => {
    await physicalCopyRepository.removeCopy(copyId);
    reload();
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScreenHeader
        title="Inventário"
        subtitle={
          totals ? `${totals.totalPhysicalCopies} cópias · ${totals.distinctPrints} impressões distintas` : "Carregando..."
        }
      />
      <View style={styles.content}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nome, set ou número"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pressable onPress={() => setFilterCollectionId("__all__")} style={[styles.chip, filterCollectionId === "__all__" && styles.chipSelected]}>
            <Text style={[styles.chipText, filterCollectionId === "__all__" && styles.chipTextSelected]}>Todas</Text>
          </Pressable>
          <Pressable onPress={() => setFilterCollectionId("__unassigned__")} style={[styles.chip, filterCollectionId === "__unassigned__" && styles.chipSelected]}>
            <Text style={[styles.chipText, filterCollectionId === "__unassigned__" && styles.chipTextSelected]}>Sem fichário</Text>
          </Pressable>
          {collections.map((c) => (
            <Pressable key={c.id} onPress={() => setFilterCollectionId(c.id)} style={[styles.chip, filterCollectionId === c.id && styles.chipSelected]}>
              <Text style={[styles.chipText, filterCollectionId === c.id && styles.chipTextSelected]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        {notice && <Text style={{ color: COLORS.warningText, fontSize: 12 }}>{notice}</Text>}

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <CopyCard copy={item} collectionsById={collectionsById} onTransfer={setTransferTarget} onRemove={handleRemove} />
          )}
          ListEmptyComponent={
            <Text style={styles.bodyText}>
              Seu inventário está vazio. Adicione uma carta pela aba Garimpo (identifique e confirme) ou pelo detalhe de um fichário.
            </Text>
          }
        />
      </View>

      <TransferSheet copy={transferTarget} collections={collections} onClose={() => setTransferTarget(null)} onConfirm={handleTransferConfirm} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  chip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 12 },
  chipTextSelected: { color: "#FFFFFF", fontWeight: "700" },
  bodyText: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginTop: 20, lineHeight: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 12,
  },
  cardName: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "700" },
  cardMeta: { color: COLORS.textSecondary, fontSize: 12 },
  cardLocation: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  transferOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  transferSheet: { backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "70%" },
  transferRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
});
