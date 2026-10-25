/**
 * Classificação pura "esta impressão é uma carta física elegível?" — exigida
 * pela especificação da Entrega 1 (seção 4.6): o TCGdex mistura cartas
 * físicas com produtos digitais (ex.: Pokémon TCG Pocket, série `tcgp`), e a
 * resposta de uma carta isolada não traz a série — só o mapa `set_id ->
 * serie_id` (ver src/catalog/catalogFixtures.js / scripts/build-series-map.js)
 * resolve isso.
 *
 * Regra explícita da especificação (mais estrita que a da PoC): uma série
 * DESCONHECIDA não deve ser silenciosamente tratada como física elegível —
 * vira "unconfirmed", não "physical". A PoC antiga (catalogFixtures.
 * filterPhysicalCards) tratava desconhecido como física por padrão; isso
 * muda aqui por instrução direta da especificação da Entrega 1, seção 4.6:
 * "se a série de uma expansão estiver desconhecida, tratar o item como não
 * confirmado e não apresentá-lo silenciosamente como carta física elegível."
 */

const PHYSICAL = "physical";
const DIGITAL = "digital";
const UNCONFIRMED = "unconfirmed";

/**
 * @param {string|null|undefined} setSerieId
 * @param {string[]} digitalOnlySeries lista real de séries digitais conhecidas (ex.: ["tcgp"])
 * @returns {"physical"|"digital"|"unconfirmed"}
 */
function classifyPhysical(setSerieId, digitalOnlySeries = ["tcgp"]) {
  if (!setSerieId) return UNCONFIRMED;
  if (digitalOnlySeries.includes(setSerieId)) return DIGITAL;
  return PHYSICAL;
}

/** Atalho usado pelos filtros de busca/scanner: só os confirmados físicos. */
function isConfirmedPhysical(setSerieId, digitalOnlySeries = ["tcgp"]) {
  return classifyPhysical(setSerieId, digitalOnlySeries) === PHYSICAL;
}

module.exports = { classifyPhysical, isConfirmedPhysical, PHYSICAL, DIGITAL, UNCONFIRMED };
