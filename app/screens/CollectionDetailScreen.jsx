/**
 * Detalhe do fichário (especificação da Entrega 2, seção 8.4/8.5): progresso
 * real, checklist com estado de cada item, e cópias físicas atribuídas (com
 * posição). A visualização de posição é uma LISTA (página/bolso em texto),
 * não uma grade visual arrastável — simplificação deliberada e documentada
 * (reports/delivery-2.md): as regras de posição únicas já são garantidas
 * pelo repositório/índice do banco; o que muda aqui é só a apresentação.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { COLORS } from "../theme";
import { AppButton } from "../components/AppButton";
import { AddCopyModal } from "../components/AddCopyModal";
import { catalogRepository } from "../../src/catalog/catalogRepository";
import {
  collectionRepository,
  checklistRepository,
  physicalCopyRepository,
  cardSpeciesRepository,
  collectionProgressService,
} from "../../src/collections";
import { parseCatalogCardKey } from "../../src/domain/catalogCardKey";
import { buildOwnershipIndex, isItemComplete } from "../../src/domain/progressCalculations";
import nationalDex from "../assets/data/national-dex.json";

const speciesByNumber = new Map(nationalDex.species.map((s) => [s.nationalNumber, s]));

async function findRecordForItem(item) {
  if (item.targetType === "catalog_card") {
    if (item.catalogCardKey) {
      const parsed = parseCatalogCardKey(item.catalogCardKey);
      return catalogRepository.getCardDetail(parsed.sourceCardId, parsed.sourceLanguage);
    }
    const matches = await catalogRepository.searchByNumber(item.targetNumberSnapshot, { setId: item.targetSetSnapshot });
    return matches[0] || null;
  }
  if (item.targetType === "pokemon_species") {
    const species = speciesByNumber.get(item.nationalDexNumber);
    const name = species?.names.en || species?.slug;
    if (!name) return null;
    const matches = await catalogRepository.searchByPokemon(name);
    return matches[0] || null;
  }
  return null;
}

function ChecklistRow({ item, completed, onAddCopy, onRemove }) {
  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>
          {item.targetType === "pokemon_species" ? `#${String(item.nationalDexNumber).padStart(4, "0")} ` : ""}
          {item.targetLabelSnapshot || "(sem nome)"}
        </Text>
        {item.targetType === "catalog_card" && (
          <Text style={styles.itemMeta}>
            {item.targetSetSnapshot} #{item.targetNumberSnapshot}
            {item.targetLanguageSnapshot ? ` · ${item.targetLanguageSnapshot.toUpperCase()}` : " · qualquer idioma"}
          </Text>
        )}
        <Text style={[styles.itemStatus, { color: completed ? COLORS.successText : COLORS.textMuted }]}>
          {completed ? "Completo" : "Faltando"}
        </Text>
      </View>
      {!completed && <AppButton title="+ Carta" variant="outline" compact onPress={() => onAddCopy(item)} />}
      <Pressable onPress={() => onRemove(item)} style={{ marginLeft: 8 }}>
        <Text style={{ color: COLORS.dangerText, fontSize: 12 }}>Remover</Text>
      </Pressable>
    </View>
  );
}

function CopyRow({ copy, onMove, onTransferOut, onRemove }) {
  const [editingPosition, setEditingPosition] = useState(false);
  const [page, setPage] = useState(copy.pageNumber ? String(copy.pageNumber) : "1");
  const [slot, setSlot] = useState(copy.slotIndex ? String(copy.slotIndex) : "1");

  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{copy.cardNameSnapshot || "(sem nome)"}</Text>
        <Text style={styles.itemMeta}>
          {copy.setNameSnapshot || copy.sourceSetId} #{copy.localId} · {copy.sourceLanguage?.toUpperCase()}
        </Text>
        <Text style={styles.itemStatus}>
          {copy.pageNumber ? `Página ${copy.pageNumber}, bolso ${copy.slotIndex}` : "Aguardando organização"}
        </Text>
        {editingPosition && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <TextInput value={page} onChangeText={setPage} keyboardType="number-pad" style={styles.smallInput} placeholder="Página" placeholderTextColor={COLORS.textMuted} />
            <TextInput value={slot} onChangeText={setSlot} keyboardType="number-pad" style={styles.smallInput} placeholder="Bolso" placeholderTextColor={COLORS.textMuted} />
            <AppButton
              title="Salvar"
              compact
              onPress={async () => {
                const result = await onMove(copy.id, parseInt(page, 10), parseInt(slot, 10));
                if (result?.conflict) return; // mensagem de conflito é responsabilidade do chamador
                setEditingPosition(false);
              }}
            />
          </View>
        )}
      </View>
      <View style={{ gap: 4 }}>
        <Pressable onPress={() => setEditingPosition((v) => !v)}>
          <Text style={{ color: COLORS.primary, fontSize: 12 }}>Posição</Text>
        </Pressable>
        <Pressable onPress={() => onTransferOut(copy.id)}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>Sem fichário</Text>
        </Pressable>
        <Pressable onPress={() => onRemove(copy.id)}>
          <Text style={{ color: COLORS.dangerText, fontSize: 12 }}>Remover</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function CollectionDetailScreen({ collectionId, onBack }) {
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState([]);
  const [copies, setCopies] = useState([]);
  const [confirmedLinksByCardKey, setConfirmedLinksByCardKey] = useState(new Map());
  const [progress, setProgress] = useState(null);
  const [tab, setTab] = useState("checklist"); // "checklist" | "copies"
  const [loading, setLoading] = useState(true);
  const [addCopyRecord, setAddCopyRecord] = useState(null);
  const [notice, setNotice] = useState(null);

  const reload = useCallback(async () => {
    const [col, checklistItems, collectionCopies, prog, linksMap] = await Promise.all([
      collectionRepository.getById(collectionId),
      checklistRepository.listItems(collectionId),
      physicalCopyRepository.list({ collectionId }),
      collectionProgressService.getCollectionProgress(collectionId),
      cardSpeciesRepository.getConfirmedLinksMap(),
    ]);
    setCollection(col);
    setItems(checklistItems);
    setCopies(collectionCopies);
    setProgress(prog);
    setConfirmedLinksByCardKey(linksMap);
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Mesma regra de conclusão usada pelo cálculo de progresso (nunca
  // reimplementada aqui) — ver src/domain/progressCalculations.js.
  const ownership = buildOwnershipIndex(copies, confirmedLinksByCardKey);
  const isItemCompleted = (item) => isItemComplete(item, ownership);

  const handleAddCopyForItem = async (item) => {
    const record = await findRecordForItem(item);
    if (!record) {
      setNotice("Nenhuma carta correspondente encontrada no catálogo local sincronizado para este item.");
      return;
    }
    setAddCopyRecord(record);
  };

  const handleRemoveItem = async (item) => {
    await checklistRepository.removeItem(item.id);
    reload();
  };

  const handleMove = async (copyId, page, slot) => {
    const result = await physicalCopyRepository.moveCopy(copyId, { pageNumber: page, slotIndex: slot });
    if (result.conflict) setNotice("Esse bolso já está ocupado por outra cópia.");
    reload();
    return result;
  };

  const handleTransferOut = async (copyId) => {
    await physicalCopyRepository.transferCopy(copyId, { collectionId: null });
    reload();
  };

  const handleRemoveCopy = async (copyId) => {
    await physicalCopyRepository.removeCopy(copyId);
    reload();
  };

  if (loading || !collection) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={{ color: COLORS.primary, fontSize: 14 }}>{"< Fichários"}</Text>
        </Pressable>
        <Text style={styles.title}>{collection.name}</Text>
        <Text style={styles.subtitle}>
          {progress.completedItems}/{progress.totalChecklistItems} ({progress.completionPercentage}%) · {progress.extraPhysicalCopies} extras ·{" "}
          {progress.unplacedCopies} aguardando posição
        </Text>
      </View>

      {notice && (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
          <Pressable onPress={() => setNotice(null)}>
            <Text style={{ color: COLORS.primary, fontSize: 12 }}>Fechar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.tabBar}>
        <Pressable onPress={() => setTab("checklist")} style={[styles.tabButton, tab === "checklist" && styles.tabButtonActive]}>
          <Text style={[styles.tabLabel, tab === "checklist" && styles.tabLabelActive]}>Checklist</Text>
        </Pressable>
        <Pressable onPress={() => setTab("copies")} style={[styles.tabButton, tab === "copies" && styles.tabButtonActive]}>
          <Text style={[styles.tabLabel, tab === "copies" && styles.tabLabelActive]}>Cópias ({copies.length})</Text>
        </Pressable>
      </View>

      {tab === "checklist" && (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => <ChecklistRow item={item} completed={isItemCompleted(item)} onAddCopy={handleAddCopyForItem} onRemove={handleRemoveItem} />}
          ListEmptyComponent={<Text style={styles.bodyText}>Checklist vazia.</Text>}
        />
      )}

      {tab === "copies" && (
        <FlatList
          data={copies}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <CopyRow copy={item} onMove={handleMove} onTransferOut={handleTransferOut} onRemove={handleRemoveCopy} />
          )}
          ListEmptyComponent={<Text style={styles.bodyText}>Nenhuma cópia atribuída a este fichário ainda.</Text>}
        />
      )}

      <AddCopyModal
        visible={Boolean(addCopyRecord)}
        record={addCopyRecord}
        initialCollectionId={collectionId}
        onClose={() => setAddCopyRecord(null)}
        onSaved={() => reload()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { padding: 20, gap: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { color: COLORS.textPrimary, fontSize: 20, fontWeight: "700" },
  subtitle: { color: COLORS.textSecondary, fontSize: 12 },
  bodyText: { color: COLORS.textSecondary, fontSize: 13, padding: 16 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabButtonActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabLabel: { color: COLORS.textMuted, fontSize: 13 },
  tabLabelActive: { color: COLORS.primary, fontWeight: "700" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  itemLabel: { color: COLORS.textPrimary, fontSize: 14, fontWeight: "600" },
  itemMeta: { color: COLORS.textSecondary, fontSize: 12 },
  itemStatus: { fontSize: 11, marginTop: 2 },
  smallInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceAlt,
    color: COLORS.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 70,
    fontSize: 12,
  },
  noticeBox: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: COLORS.warningBg,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  noticeText: { color: COLORS.warningText, fontSize: 12, flex: 1 },
});
