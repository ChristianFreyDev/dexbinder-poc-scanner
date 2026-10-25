/**
 * Testes de integração reais (node:test) das consultas de
 * src/storage/catalogIndex.js, contra um banco SQLite de verdade (criado em
 * memória via better-sqlite3, mesma lib já usada por scripts/sync-full-
 * catalog.js) — não um mock do resultado, uma consulta SQL real rodando
 * contra o schema real.
 *
 * O db passado a cada função é um adaptador fino sobre better-sqlite3 que
 * expõe a MESMA interface assíncrona do expo-sqlite real (`getAllAsync`/
 * `getFirstAsync`) — catalogIndex.js não sabe (nem precisa saber) a
 * diferença. O acesso a `openSyncedCatalogDb()` em si (que abre o banco
 * via expo-sqlite no dispositivo) continua fora do alcance de testes em
 * Node — só esta parte (geração de SQL + mapeamento de linhas) é testada
 * aqui.
 *
 * Linhas da fixture: reais, copiadas de uma consulta de verdade contra o
 * catalog.db publicado na Release "catalog-data" (25/10/2026) — não
 * inventadas.
 *
 * Executar: node --test scripts/run-catalog-index-query-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const catalogIndex = require("../src/storage/catalogIndex");

function wrapDb(sqliteDb) {
  return {
    getAllAsync: async (sql, params = []) => sqliteDb.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => sqliteDb.prepare(sql).get(...params) ?? null,
  };
}

function buildTestDb() {
  const raw = new Database(":memory:");
  raw.exec(`
    CREATE TABLE card_index (
      source_card_id TEXT NOT NULL,
      source_language TEXT NOT NULL,
      name TEXT,
      local_id TEXT,
      set_id TEXT,
      set_name TEXT,
      set_serie_id TEXT,
      set_official INTEGER,
      set_total INTEGER,
      set_printed_code TEXT,
      has_image INTEGER,
      image_base_url TEXT,
      PRIMARY KEY (source_card_id, source_language)
    );
  `);
  // Linhas reais (copiadas do catalog.db publicado, não inventadas).
  const rows = [
    ["base1-1", "en", "Alakazam", "1", "base1", "Base Set", "base", 102, 102, "BS", 1, "https://assets.tcgdex.net/en/base/base1/1"],
    ["base1-2", "en", "Blastoise", "2", "base1", "Base Set", "base", 102, 102, "BS", 1, "https://assets.tcgdex.net/en/base/base1/2"],
    ["sv03.5-001", "en", "Bulbasaur", "001", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/en/sv/sv03.5/001"],
    ["sv03.5-001", "pt", "Bulbasaur", "001", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/pt/sv/sv03.5/001"],
    ["miscp-001", "en", "Ancient Mew", "001", "miscp", "Miscellaneous Promos", "misc", 1, 1, null, 0, null],
    // id alfanumérico real (ver reports/catalog-audit.md): promo com localId não numérico.
    ["swsh12.5gg-GG01", "en", "Mew", "GG01", "swsh12.5gg", "Galarian Gallery", "swsh", 70, 70, null, 1, "https://assets.tcgdex.net/en/swsh/swsh12.5gg/GG01"],
  ];
  const insert = raw.prepare(`INSERT INTO card_index VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) insert.run(...r);
  return wrapDb(raw);
}

test("getAllRecords: devolve todas as linhas mapeadas", async () => {
  const db = buildTestDb();
  const all = await catalogIndex.getAllRecords(db);
  assert.equal(all.length, 6);
  assert.ok(all.every((r) => typeof r.localId === "string"));
});

test("searchByName: encontra por substring, case-insensitive", async () => {
  const db = buildTestDb();
  const results = await catalogIndex.searchByName(db, "bulba");
  assert.equal(results.length, 2); // en + pt
  assert.ok(results.every((r) => r.name === "Bulbasaur"));
});

test("searchByName: filtra por idioma quando pedido", async () => {
  const db = buildTestDb();
  const results = await catalogIndex.searchByName(db, "bulba", { lang: "pt" });
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceLanguage, "pt");
});

test("searchByNumber: localId com zero à esquerda casa com a versão sem zeros", async () => {
  const db = buildTestDb();
  // Base Set não tem zero-padding ("1"), mas o usuário pode digitar "01".
  const results = await catalogIndex.searchByNumber(db, "01");
  assert.ok(results.some((r) => r.sourceCardId === "base1-1"));
});

test("searchByNumber: id alfanumérico (GG01) é tratado como texto, não quebra", async () => {
  const db = buildTestDb();
  const results = await catalogIndex.searchByNumber(db, "GG01");
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceCardId, "swsh12.5gg-GG01");
});

test("searchByNumber: filtra por set quando pedido (desambigua números repetidos entre sets)", async () => {
  const db = buildTestDb();
  const results = await catalogIndex.searchByNumber(db, "001", { setId: "sv03.5" });
  assert.equal(results.length, 2); // en + pt do set sv03.5
  assert.ok(results.every((r) => r.setId === "sv03.5"));
});

test("searchBySet: encontra por id ou nome do set", async () => {
  const db = buildTestDb();
  const byId = await catalogIndex.searchBySet(db, "base1");
  const byName = await catalogIndex.searchBySet(db, "151");
  assert.ok(byId.length >= 2);
  assert.ok(byName.some((r) => r.setId === "sv03.5"));
});

test("getCardDetail: busca exata por source_card_id + source_language (chave real da especificação)", async () => {
  const db = buildTestDb();
  const en = await catalogIndex.getCardDetail(db, "sv03.5-001", "en");
  const pt = await catalogIndex.getCardDetail(db, "sv03.5-001", "pt");
  assert.equal(en.imageBaseUrl, "https://assets.tcgdex.net/en/sv/sv03.5/001");
  assert.equal(pt.imageBaseUrl, "https://assets.tcgdex.net/pt/sv/sv03.5/001");
  assert.notEqual(en.imageBaseUrl, pt.imageBaseUrl);
});

test("getCardDetail: impressão inexistente -> null (nunca inventa um registro)", async () => {
  const db = buildTestDb();
  const result = await catalogIndex.getCardDetail(db, "nao-existe", "en");
  assert.equal(result, null);
});

test("listSets: lista expansões distintas presentes no catálogo instalado", async () => {
  const db = buildTestDb();
  const sets = await catalogIndex.listSets(db);
  const ids = sets.map((s) => s.setId);
  assert.ok(ids.includes("base1"));
  assert.ok(ids.includes("sv03.5"));
  assert.ok(ids.includes("miscp"));
});

test("listLanguages: lista idiomas distintos presentes no catálogo instalado", async () => {
  const db = buildTestDb();
  const langs = await catalogIndex.listLanguages(db);
  assert.deepEqual(langs, ["en", "pt"]);
});

test("getStats: contagem total real do banco", async () => {
  const db = buildTestDb();
  const stats = await catalogIndex.getStats(db);
  assert.equal(stats.totalRecords, 6);
});

test("getAllRecords: carta sem imagem (image_base_url null) não quebra o mapeamento", async () => {
  const db = buildTestDb();
  const all = await catalogIndex.getAllRecords(db);
  const noImage = all.find((r) => r.sourceCardId === "miscp-001");
  assert.equal(noImage.hasImage, false);
  assert.equal(noImage.imageBaseUrl, null);
});
