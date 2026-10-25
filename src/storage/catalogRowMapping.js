/**
 * Lógica pura (sem I/O, sem expo-sqlite) usada por catalogIndex.js: mapear
 * uma linha crua de `card_index` para o formato de registro usado por
 * rankCandidates.js, e gerar as variações de texto de um número de coleção
 * que devem casar entre si (zero-padding) — mesma regra de numberMatches()
 * em src/scanner/rankCandidates.js. Extraída aqui porque catalogIndex.js
 * importa expo-sqlite (não roda em Node puro — mesma limitação documentada
 * em catalogSyncDecision.js e catalogInstallDecision.js).
 */

function mapRow(row) {
  return {
    sourceCardId: row.source_card_id,
    sourceLanguage: row.source_language,
    name: row.name,
    localId: row.local_id != null ? String(row.local_id) : null,
    setId: row.set_id,
    setName: row.set_name,
    setSerieId: row.set_serie_id,
    setOfficial: row.set_official,
    setTotal: row.set_total,
    setPrintedCode: row.set_printed_code,
    hasImage: Boolean(row.has_image),
    imageBaseUrl: row.image_base_url,
  };
}

function buildNumberCandidates(number) {
  const raw = String(number);
  const stripped = raw.replace(/^0+(?=\d)/, "");
  return [...new Set([raw, stripped])];
}

module.exports = { mapRow, buildNumberCandidates };
