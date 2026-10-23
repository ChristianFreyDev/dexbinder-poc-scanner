/**
 * Índice local em SQLite — NÃO usado pelo app desta PoC (que usa o bundle
 * JSON estático em app/assets/catalog-index.json, suficiente para a amostra
 * de 30 cartas desta Entrega 0). Mantido deliberadamente no repositório: é a
 * base correta para a Entrega 1, quando o catálogo precisa ter TODAS as
 * cartas/expansões e se atualizar sozinho (sem publicar um app novo a cada
 * expansão) — ver reports/decision.md, seção 11, para a arquitetura completa
 * (sincronização periódica + download do catálogo pelo app + cache de
 * imagens). Falta aqui o passo de popular esta tabela a partir de um pacote
 * baixado da rede, em vez das fixtures locais da PoC — trabalho da Entrega 1.
 *
 * Usa a API real do `expo-sqlite` conforme a documentação oficial, mas não
 * foi executado em dispositivo nesta PoC (não tem chamador — ver acima).
 *
 * Mantém a tabela mínima para a PoC: uma linha por impressão de carta,
 * já normalizada por catalogFixtures.normalizeCard().
 */

// eslint-disable-next-line import/no-unresolved
const { openDatabaseAsync } = require("expo-sqlite");

const DB_NAME = "poc_catalog_index.db";

async function openCatalogIndexDb() {
  const db = await openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS card_index (
      source_card_id TEXT NOT NULL,
      source_language TEXT NOT NULL,
      name TEXT,
      category TEXT,
      rarity TEXT,
      local_id TEXT,
      set_id TEXT,
      set_name TEXT,
      set_serie_id TEXT,
      dex_ids TEXT,
      has_image INTEGER,
      image_base_url TEXT,
      PRIMARY KEY (source_card_id, source_language)
    );
  `);
  return db;
}

/** Popula o índice a partir dos registros normalizados (ver catalogFixtures.js). */
async function populateCatalogIndex(db, records) {
  for (const r of records) {
    await db.runAsync(
      `INSERT OR REPLACE INTO card_index
        (source_card_id, source_language, name, category, rarity, local_id, set_id, set_name, set_serie_id, dex_ids, has_image, image_base_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.sourceCardId,
        r.sourceLanguage,
        r.name,
        r.category,
        r.rarity,
        r.localId,
        r.setId,
        r.setName,
        r.setSerieId,
        JSON.stringify(r.dexIds || []),
        r.hasImage ? 1 : 0,
        r.imageBaseUrl,
      ]
    );
  }
}

/**
 * Carrega todas as linhas do índice de volta para o formato usado por
 * rankCandidates() — a busca local nunca deve ir até a API por item lido.
 * Filtra por padrão a série "tcgp" (Pokémon TCG Pocket), que NÃO representa
 * cartas físicas (ver reports/catalog-audit.md, achado 6).
 *
 * GAP RESOLVIDO: `set_serie_id` agora é resolvido de verdade por
 * `catalogFixtures.normalizeCard()` a partir do mapa real gerado por
 * `scripts/build-series-map.js` (consulta real a `GET /{lang}/series/{id}`,
 * já que a resposta de `GET /{lang}/cards/{id}` não traz essa informação).
 * Quem popular este índice deve carregar as fixtures via
 * `catalogFixtures.loadFixtureCards()` (que já faz esse cruzamento) para que
 * este filtro funcione de verdade — ver scripts/run-matching-tests.js para
 * um teste automatizado que comprova isso com dados reais.
 */
async function loadIndexRecords(db, { includeDigitalOnlySeries = false } = {}) {
  const rows = await db.getAllAsync(`SELECT * FROM card_index`);
  return rows
    .filter((row) => includeDigitalOnlySeries || row.set_serie_id !== "tcgp")
    .map((row) => ({
      sourceCardId: row.source_card_id,
      sourceLanguage: row.source_language,
      name: row.name,
      category: row.category,
      rarity: row.rarity,
      localId: row.local_id,
      setId: row.set_id,
      setName: row.set_name,
      setSerieId: row.set_serie_id,
      dexIds: JSON.parse(row.dex_ids || "[]"),
      hasImage: Boolean(row.has_image),
      imageBaseUrl: row.image_base_url,
    }));
}

module.exports = { openCatalogIndexDb, populateCatalogIndex, loadIndexRecords, DB_NAME };
