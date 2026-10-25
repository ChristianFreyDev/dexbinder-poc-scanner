/**
 * Mostra o estado da sincronização do catálogo (especificação da Entrega 1,
 * seção 4.2, item 10: "não instalado, verificando, baixando, validando,
 * pronto, offline usando catálogo local, erro recuperável") e oferece
 * "tentar de novo" quando aplicável. Reutilizado pela tela de Garimpo
 * (bloqueia o scanner até o catálogo estar pronto/offline-usável) e pela
 * tela de Início (seção 4.8: "local simples para exibir o estado/versão
 * do catálogo e permitir tentar sincronizar novamente").
 */
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../theme";
import { AppButton } from "./AppButton";

const STATUS_LABELS = {
  not_installed: "Catálogo ainda não instalado.",
  checking: "Verificando catálogo...",
  downloading: "Baixando catálogo...",
  validating: "Validando catálogo baixado...",
  ready: "Catálogo pronto.",
  offline_using_local: "Sem conexão — usando o catálogo já instalado.",
  error_recoverable: "Não foi possível preparar o catálogo.",
};

const BUSY_STATUSES = new Set(["checking", "downloading", "validating"]);

export function CatalogStatusBanner({ status, error, manifest, onRetry, compact = false }) {
  const label = STATUS_LABELS[status] || status;
  const isBusy = BUSY_STATUSES.has(status);
  const isError = status === "error_recoverable";

  return (
    <View style={[styles.banner, isError && styles.bannerError, compact && styles.bannerCompact]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        {isBusy && <ActivityIndicator size="small" color={COLORS.primary} />}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.bannerText}>{label}</Text>
          {error ? <Text style={styles.bannerDetail}>{error}</Text> : null}
          {manifest ? (
            <Text style={styles.bannerDetail}>
              {manifest.totalRecords != null ? `${manifest.totalRecords} cartas` : ""}
              {manifest.complete === false ? " · sincronização ainda em andamento" : ""}
            </Text>
          ) : null}
        </View>
      </View>
      {(isError || status === "offline_using_local") && onRetry ? (
        <AppButton title="Tentar de novo" variant="outline" compact onPress={onRetry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
  },
  bannerCompact: {
    padding: 10,
  },
  bannerError: {
    borderColor: COLORS.dangerText,
    backgroundColor: COLORS.dangerBg,
  },
  bannerText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  bannerDetail: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
});
