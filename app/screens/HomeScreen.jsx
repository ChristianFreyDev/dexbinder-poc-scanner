/**
 * Início — especificação da Entrega 1, seção 4.8: "incluir um local
 * simples para exibir o estado/versão do catálogo e permitir tentar
 * sincronizar novamente" e "não apresentar números inventados na Home
 * (como total de cartas, fichários ou progresso). Usar zero/estado vazio
 * ou indicar que a área ainda será habilitada."
 *
 * O total de cartas mostrado vem do manifesto REAL do catálogo instalado
 * (nunca inventado) — os contadores de fichários/inventário ficam
 * explicitamente zerados/"ainda não disponível", porque essas áreas não
 * têm dados de usuário nesta entrega (seção 4.9: nenhum dado pessoal
 * ainda persistido).
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { catalogRepository } from "../../src/catalog/catalogRepository";
import { COLORS } from "../theme";
import { CatalogStatusBanner } from "../components/CatalogStatusBanner";

export default function HomeScreen() {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState(null);
  const [manifest, setManifest] = useState(null);

  const sync = useCallback(async () => {
    setError(null);
    const result = await catalogRepository.ensureReady({ onStatusChange: setStatus });
    setStatus(result.status);
    setManifest(result.manifest);
    setError(result.error);
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={styles.title}>DexBinder</Text>

        <CatalogStatusBanner status={status} error={error} manifest={manifest} onRetry={sync} />

        <View style={styles.statRow}>
          <StatCard
            label="Fichários"
            value="—"
            note="Ainda não disponível nesta entrega"
          />
          <StatCard label="Inventário" value="—" note="Ainda não disponível nesta entrega" />
        </View>

        <Text style={styles.sectionNote}>
          A Entrega 1 conecta o catálogo completo e a Pokédex Nacional ao scanner (aba Garimpo). Fichários e
          Inventário completos — com CRUD, posições físicas e checklist — ficam para as próximas entregas (ver
          reports/delivery-1.md).
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
  title: { color: COLORS.textPrimary, fontSize: 24, fontWeight: "700" },
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
