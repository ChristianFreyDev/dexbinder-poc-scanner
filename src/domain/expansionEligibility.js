/**
 * Elegibilidade de um par set×idioma para gerar checklist AUTOMÁTICA
 * completa (especificação da Entrega 2, seção 10): "só habilitar geração
 * automática para um par que o catálogo local indique como sincronizado e
 * consultável por inteiro... conferir a contagem do conjunto contra
 * set_official/set_total reais".
 *
 * O manifesto público do catálogo (ver catalog-version.json, publicado por
 * sync-full-catalog.js) só expõe progresso AGREGADO (syncedPairs/
 * remainingPairs), não uma lista "este set×idioma específico já terminou" —
 * por isso a elegibilidade aqui é inferida comparando quantas impressões
 * distintas desse set×idioma já existem no catálogo instalado contra
 * `set_official`/`set_total` (campos reais vindos da própria API TCGdex,
 * gravados em cada linha) — sinal real, não um "fingir que está completo".
 */
const { isWithinOfficialScope } = require("./checklistGeneration");

/**
 * @param {Array} records registros de catalogIndex.getRecordsBySetAndLanguage() para UM set+idioma
 * @param {{ scope?: "official"|"complete_catalog" }} options
 */
function evaluateExpansionEligibility(records, { scope = "complete_catalog" } = {}) {
  if (!records || records.length === 0) {
    return { eligible: false, reason: "not_synced", recordCount: 0, expectedCount: null };
  }

  if (scope === "official") {
    const expectedCount = records[0].setOfficial;
    if (!expectedCount) return { eligible: false, reason: "unknown_expected_count", recordCount: records.length, expectedCount: null };
    const distinctOfficial = new Set(records.filter(isWithinOfficialScope).map((r) => r.localId)).size;
    return {
      eligible: distinctOfficial >= expectedCount,
      reason: distinctOfficial >= expectedCount ? null : "partial",
      recordCount: distinctOfficial,
      expectedCount,
    };
  }

  const expectedCount = records[0].setTotal;
  if (!expectedCount) return { eligible: false, reason: "unknown_expected_count", recordCount: records.length, expectedCount: null };
  const distinctTotal = new Set(records.map((r) => r.localId)).size;
  return {
    eligible: distinctTotal >= expectedCount,
    reason: distinctTotal >= expectedCount ? null : "partial",
    recordCount: distinctTotal,
    expectedCount,
  };
}

module.exports = { evaluateExpansionEligibility };
