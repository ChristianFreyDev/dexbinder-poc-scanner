/**
 * Carrega as fixtures reais coletadas pela auditoria (fixtures/cards/*.json)
 * e normaliza para o formato de registro usado pelo índice local da PoC.
 *
 * Importante: estas fixtures vieram de respostas REAIS da API TCGdex
 * (ver reports/catalog-audit.md). Não inventar/complementar campos aqui.
 */

const fs = require("fs");
const path = require("path");

const FIXTURES_DIR = path.join(__dirname, "..", "..", "fixtures", "cards");
const SERIES_MAP_PATH = path.join(__dirname, "..", "..", "fixtures", "catalog", "set-series-map.json");

/**
 * Carrega o mapeamento real `set_id -> serie_id` construído por
 * scripts/build-series-map.js (ver especificação, seção 17.2: "Usar o
 * relacionamento entre conjunto e série para aplicar esse filtro").
 * Retorna `null` se o mapa ainda não foi gerado — quem chamar deve tratar
 * isso como "série desconhecida", nunca como "não é tcgp".
 */
function loadSeriesMap({ seriesMapPath = SERIES_MAP_PATH } = {}) {
  if (!fs.existsSync(seriesMapPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(seriesMapPath, "utf8"));
  } catch (e) {
    return null;
  }
}

/**
 * Converte um card bruto da API em um registro de índice.
 * Mantém `source_language` e `source_card_id` separados, conforme o
 * achado da auditoria: variantId e set.id NÃO são estáveis entre idiomas.
 *
 * `seriesMap`, quando fornecido (ver loadSeriesMap), resolve `setSerieId`
 * a partir de `setToSeries[set.id]` — a resposta de carta isolada da API
 * NUNCA traz essa informação (confirmado na auditoria), então sem o mapa
 * `setSerieId` fica `null` (estado explícito de "desconhecido", não "físico").
 */
function normalizeCard(rawCard, sourceLanguage, sourceFileName, seriesMap = null) {
  const setId = rawCard.set ? rawCard.set.id : null;
  const resolvedSerieId = seriesMap && setId ? seriesMap.setToSeries[setId] ?? null : null;

  return {
    sourceCardId: rawCard.id,
    sourceLanguage,
    sourceFile: sourceFileName,
    name: rawCard.name ?? null,
    category: rawCard.category ?? null,
    rarity: rawCard.rarity ?? null,
    localId: rawCard.localId != null ? String(rawCard.localId) : null,
    setId,
    setName: rawCard.set ? rawCard.set.name : null,
    setSerieId: resolvedSerieId,
    // Contagens do set, usadas para desambiguar números de coleção (ex.: o
    // usuário digita "001/165" — 165 é o total impresso na carta física e
    // deve bater com `setOfficial`/`setTotal`, não só com o número "001"
    // isolado, que se repete entre dezenas de sets diferentes).
    setOfficial: rawCard.set && rawCard.set.cardCount ? rawCard.set.cardCount.official ?? null : null,
    setTotal: rawCard.set && rawCard.set.cardCount ? rawCard.set.cardCount.total ?? null : null,
    dexIds: Array.isArray(rawCard.dexId) ? rawCard.dexId : [],
    hasImage: Boolean(rawCard.image),
    imageBaseUrl: rawCard.image ?? null,
  };
}

/**
 * Lê todas as fixtures do diretório e retorna um array de registros
 * normalizados, já com `setSerieId` resolvido via o mapa real set->série
 * quando ele existir (rode `node scripts/build-series-map.js` antes).
 */
function loadFixtureCards({ fixturesDir = FIXTURES_DIR, seriesMapPath = SERIES_MAP_PATH } = {}) {
  if (!fs.existsSync(fixturesDir)) return [];

  const seriesMap = loadSeriesMap({ seriesMapPath });
  const files = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
  const records = [];

  for (const file of files) {
    const fullPath = path.join(fixturesDir, file);
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (e) {
      // Fixture corrompida/ilegível: não quebra o índice, apenas ignora e segue.
      continue;
    }
    // Nome do arquivo segue o padrão "<id>_<lang>.json" (ver run-catalog-audit.js)
    const match = file.match(/_(\w+)\.json$/);
    const lang = match ? match[1] : "unknown";
    records.push(normalizeCard(raw, lang, file, seriesMap));
  }

  return records;
}

/**
 * Filtra registros de séries digitais (ex.: "tcgp" / Pokémon TCG Pocket),
 * que não representam cartas físicas (ver catalog-audit.md, achado 6).
 * Registros com `setSerieId` desconhecido (mapa ausente/série não mapeada)
 * são MANTIDOS por padrão — tratamos "desconhecido" como "não provado
 * digital", nunca descartamos silenciosamente uma carta física real por
 * falta do mapa.
 */
function filterPhysicalCards(records, { seriesMap = null, digitalOnlySeries = ["tcgp"] } = {}) {
  const digitalSet = new Set((seriesMap && seriesMap.digitalOnlySeries) || digitalOnlySeries);
  return records.filter((r) => !r.setSerieId || !digitalSet.has(r.setSerieId));
}

module.exports = { loadFixtureCards, normalizeCard, loadSeriesMap, filterPhysicalCards, FIXTURES_DIR, SERIES_MAP_PATH };
