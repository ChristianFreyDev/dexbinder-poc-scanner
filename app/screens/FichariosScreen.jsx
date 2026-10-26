/**
 * Fichários — lista real (especificação da Entrega 2, seção 8.2) + ponto de
 * entrada para o assistente de criação (8.3) e o detalhe/checklist (8.4).
 * Sem router: alterna entre "list"/"wizard"/"detail" com estado local, igual
 * ao padrão já usado em app/index.jsx (Garimpo) e app/Navigation.jsx.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../theme";
import { ScreenHeader } from "../components/ScreenHeader";
import { AppButton } from "../components/AppButton";
import { collectionRepository, collectionProgressService } from "../../src/collections";
import { CollectionWizard } from "./CollectionWizard";
import { CollectionDetailScreen } from "./CollectionDetailScreen";

const TYPE_LABELS = { pokedex: "Pokédex", expansion: "Expansão", custom: "Personalizada" };

function CollectionRow({ collection, progress, onPress, onArchiveToggle, onDelete }) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{collection.name}</Text>
        <Text style={styles.cardMeta}>
          {TYPE_LABELS[collection.collectionType]} · {collection.columnsPerPage}×{collection.rowsPerPage}
          {collection.isArchived ? " · arquivado" : ""}
        </Text>
        {progress && (
          <Text style={styles.cardProgress}>
            {progress.completedItems}/{progress.totalChecklistItems} ({progress.completionPercentage}%)
          </Text>
        )}
      </View>
      <View style={{ gap: 6, alignItems: "flex-end" }}>
        <Pressable onPress={onArchiveToggle} hitSlop={8}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{collection.isArchived ? "Restaurar" : "Arquivar"}</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={{ color: COLORS.dangerText, fontSize: 12 }}>Excluir</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function FichariosScreen() {
  const [view, setView] = useState("list"); // "list" | "wizard" | "detail"
  const [collections, setCollections] = useState([]);
  const [progressByCollection, setProgressByCollection] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const list = await collectionRepository.list({ includeArchived: true });
    setCollections(list);
    const entries = await Promise.all(
      list.map(async (c) => [c.id, await collectionProgressService.getCollectionProgress(c.id)])
    );
    setProgressByCollection(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (view === "list") reload();
  }, [view, reload]);

  if (view === "wizard") {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <CollectionWizard
          onCancel={() => setView("list")}
          onDone={(collection) => {
            setSelectedId(collection.id);
            setView("detail");
          }}
        />
      </SafeAreaView>
    );
  }

  if (view === "detail" && selectedId) {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <CollectionDetailScreen collectionId={selectedId} onBack={() => setView("list")} />
      </SafeAreaView>
    );
  }

  const visibleCollections = collections.filter((c) => showArchived || !c.isArchived);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScreenHeader title="Fichários" subtitle={loading ? "Carregando..." : `${visibleCollections.length} fichário(s)`} />
      <View style={styles.actionsRow}>
        <AppButton title="Novo fichário" onPress={() => setView("wizard")} />
        <Pressable onPress={() => setShowArchived((v) => !v)} style={{ paddingHorizontal: 12, justifyContent: "center" }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12 }}>{showArchived ? "Ocultar arquivados" : "Ver arquivados"}</Text>
        </Pressable>
      </View>

      <FlatList
        data={visibleCollections}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10 }}
        renderItem={({ item }) => (
          <CollectionRow
            collection={item}
            progress={progressByCollection[item.id]}
            onPress={() => {
              setSelectedId(item.id);
              setView("detail");
            }}
            onArchiveToggle={async () => {
              if (item.isArchived) await collectionRepository.restore(item.id);
              else await collectionRepository.archive(item.id);
              reload();
            }}
            onDelete={async () => {
              const preview = await collectionRepository.previewDelete(item.id);
              Alert.alert(
                "Excluir fichário",
                preview.affectedCopiesCount > 0
                  ? `Este fichário tem ${preview.affectedCopiesCount} cópia(s) física(s). Elas NÃO serão apagadas — vão virar "Sem fichário". Excluir mesmo assim?`
                  : "Esta ação não pode ser desfeita. Excluir este fichário?",
                [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Excluir", style: "destructive", onPress: async () => {
                      await collectionRepository.deleteSafely(item.id);
                      reload();
                    } },
                ]
              );
            }}
          />
        )}
        ListEmptyComponent={
          !loading && (
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 40 }}>
              <Text style={styles.emptyTitle}>Você ainda não tem fichários</Text>
              <Text style={styles.emptyBody}>Crie seu primeiro fichário (Pokédex, uma expansão, ou personalizado) para começar a organizar sua coleção.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  actionsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  cardName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: "700" },
  cardMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cardProgress: { color: COLORS.primary, fontSize: 12, marginTop: 4, fontWeight: "600" },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "700" },
  emptyBody: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", paddingHorizontal: 30, lineHeight: 18 },
});
