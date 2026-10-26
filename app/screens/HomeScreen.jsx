/**
 * Início — agora com contagens REAIS (especificação da Entrega 2, seção
 * 8.1): progresso global da Pokédex, cópias físicas no inventário, número
 * de fichários ativos e resumo dos fichários recentes. Mantém o estado/
 * versão do catálogo (Entrega 1) intocado.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { catalogRepository } from "../../src/catalog/catalogRepository";
import { collectionRepository, collectionProgressService } from "../../src/collections";
import { COLORS } from "../theme";
import { CatalogStatusBanner } from "../components/CatalogStatusBanner";
import { ScreenHeader } from "../components/ScreenHeader";
import nationalDex from "../assets/data/national-dex.json";

export default function HomeScreen() {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState(null);
  const [manifest, setManifest] = useState(null);

  const [dexProgress, setDexProgress] = useState(null);
  const [inventoryTotals, setInventoryTotals] = useState(null);
  const [activeCollections, setActiveCollections] = useState([]);

  const sync = useCallback(async () => {
    setError(null);
    const result = await catalogRepository.ensureReady({ onStatusChange: setStatus });
    setStatus(result.status);
    setManifest(result.manifest);
    setError(result.error);
  }, []);

  const loadPersonalData = useCallback(async () => {
    const [dex, totals, collections] = await Promise.all([
      collectionProgressService.getPokedexGlobalProgress(nationalDex.totalSpecies),
      collectionProgressService.getInventoryTotals(),
      collectionRepository.list({ includeArchived: false }),
    ]);
    setDexProgress(dex);
    setInventoryTotals(totals);
    setActiveCollections(collections);
  }, []);

  useEffect(() => {
    sync();
    loadPersonalData();
  }, [sync, loadPersonalData]);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScreenHeader title="DexBinder" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 16 }}>
        <CatalogStatusBanner status={status} error={error} manifest={manifest} onRetry={sync} />

        <View style={styles.statRow}>
          <StatCard label="Fichários ativos" value={String(activeCollections.length)} note={activeCollections.length === 0 ? "Crie o primeiro na aba Fichários" : "Toque em Fichários para ver"} />
          <StatCard label="Inventário" value={inventoryTotals ? String(inventoryTotals.totalPhysicalCopies) : "—"} note={inventoryTotals ? `${inventoryTotals.distinctPrints} impressões distintas` : "Carregando..."} />
        </View>

        <View style={styles.statRow}>
          <StatCard
            label="Pokédex"
            value={dexProgress ? `${dexProgress.obtainedSpeciesCount}/${nationalDex.totalSpecies}` : "—"}
            note={dexProgress ? `${dexProgress.completionPercentage}% obtidas (associação confirmada)` : "Carregando..."}
          />
        </View>

        <Text style={styles.sectionNote}>
          Dados pessoais (fichários, cópias físicas e associações de espécie) ficam só neste dispositivo nesta versão — ainda
          não há sincronização por conta/e-mail entre aparelhos.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, note }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statNote}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  statRow: { flexDirection: "row", gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  statValue: { color: COLORS.textPrimary, fontSize: 28, fontWeight: "700" },
  statLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "600" },
  statNote: { color: COLORS.textMuted, fontSize: 11 },
  sectionNote: { color: COLORS.textMuted, fontSize: 12, lineHeight: 17 },
});
