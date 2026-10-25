/**
 * Testes de integração reais (node:test) de src/catalog/catalogRepository.js
 * contra um banco SQLite de verdade (better-sqlite3 em memória, adaptado
 * pra expor a interface assíncrona do expo-sqlite — mesmo padrão de
 * scripts/run-catalog-index-query-tests.js). O `_db` é injetado direto na
 * instância, pulando `_getDb()`/catalogSync (que dependem de expo-sqlite,
 * não rodam em Node) — só o que é testável em Node é testado aqui; a
 * abertura real do banco no dispositivo fica para o teste em Android físico
 * (ver reports/delivery-1.md).
 *
 * Cobre o requisito explícito da especificação da Entrega 1 (seção 6.2,
 * item 8): nenhuma carta de série digital (ou de série desconhecida) é
 * oferecida como carta física, em NENHUM dos métodos do repositório —
 * não só na função de classificação isolada (ver
 * scripts/run-physical-classification-tests.js).
 *
 * Executar: node --test scripts/run-catalog-repository-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

const { CatalogRepository } = require("../src/catalog/catalogRepository");
const { parseCardText } = require("../src/scanner/parseCardText");

function wrapDb(sqliteDb) {
  return {
    getAllAsync: async (sql, params = []) => sqliteDb.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => sqliteDb.prepare(sql).get(...params) ?? null,
  };
}

function buildRepoWithTestDb() {
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
  const rows = [
    // Cartas físicas reais (mesmas usadas em run-catalog-index-query-tests.js).
    ["base1-1", "en", "Alakazam", "1", "base1", "Base Set", "base", 102, 102, "BS", 1, "https://assets.tcgdex.net/en/base/base1/1"],
    ["sv03.5-025", "en", "Pikachu", "025", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/en/sv/sv03.5/025"],
    // Carta de série digital (Pokémon TCG Pocket) — caso de referência real
    // da especificação (B2-001). NUNCA deve aparecer como física elegível.
    ["B2-001", "en", "Ledyba", "001", "B2", "Genetic Apex", "tcgp", 1, 1, null, 1, "https://assets.tcgdex.net/en/tcgp/B2/001"],
    // Carta de série DESCONHECIDA (set_serie_id NULL) — regra explícita da
    // especificação: não confirmada, não pode ser oferecida como física
    // silenciosamente, mas também não é "digital".
    ["setx-1", "en", "Mystery Card", "1", "setx", "Unknown Set", null, 10, 10, null, 0, null],
  ];
  const insert = raw.prepare(`INSERT INTO card_index VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const r of rows) insert.run(...r);

  const repo = new CatalogRepository();
  repo._db = wrapDb(raw);
  return repo;
}

test("getAllPhysicalRecords: exclui tcgp (B2-001) e série desconhecida, mantém só as físicas confirmadas", async () => {
  const repo = buildRepoWithTestDb();
  const physical = await repo.getAllPhysicalRecords();
  const ids = physical.map((r) => r.sourceCardId);
  assert.ok(ids.includes("base1-1"));
  assert.ok(ids.includes("sv03.5-025"));
  assert.ok(!ids.includes("B2-001"), "B2-001 (tcgp) não pode aparecer como carta física");
  assert.ok(!ids.includes("setx-1"), "série desconhecida não pode ser oferecida como física silenciosamente");
  assert.equal(physical.length, 2);
});

test("getAllPhysicalRecords: resultado fica em cache (não reconsulta o banco sem forceReload)", async () => {
  const repo = buildRepoWithTestDb();
  const first = await repo.getAllPhysicalRecords();
  // Troca o db interno por um que lançaria erro se fosse consultado de novo.
  repo._db = { getAllAsync: async () => { throw new Error("não deveria consultar de novo"); } };
  const second = await repo.getAllPhysicalRecords();
  assert.equal(second, first); // mesma referência de array = veio do cache
});

test("getUnconfirmedCount: conta a carta de série desconhecida, sem escondê-la do sistema", async () => {
  const repo = buildRepoWithTestDb();
  const count = await repo.getUnconfirmedCount();
  assert.equal(count, 1);
});

test("searchByName: filtra tcgp fora do resultado mesmo quando o nome bate", async () => {
  const repo = buildRepoWithTestDb();
  const results = await repo.searchByName("ledyba");
  assert.equal(results.length, 0, "Ledyba é B2-001 (tcgp) — não deve aparecer na busca física");
});

test("searchByName: encontra carta física real normalmente", async () => {
  const repo = buildRepoWithTestDb();
  const results = await repo.searchByName("pikachu");
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceCardId, "sv03.5-025");
});

test("searchByPokemon: best-effort por nome, marcado explicitamente como não confirmado", async () => {
  const repo = buildRepoWithTestDb();
  const results = await repo.searchByPokemon("pikachu");
  assert.equal(results.length, 1);
  assert.equal(results[0].speciesAssociationConfirmed, false);
});

test("getCardDetail: devolve a classificação física junto com o registro", async () => {
  const repo = buildRepoWithTestDb();
  const physical = await repo.getCardDetail("base1-1", "en");
  const digital = await repo.getCardDetail("B2-001", "en");
  const unconfirmed = await repo.getCardDetail("setx-1", "en");
  assert.equal(physical.physicalClassification, "physical");
  assert.equal(digital.physicalClassification, "digital");
  assert.equal(unconfirmed.physicalClassification, "unconfirmed");
});

test("resolveImage: delega pra resolveImageUrl, nunca fabrica URL sem imagem base", async () => {
  const repo = buildRepoWithTestDb();
  const withImage = await repo.getCardDetail("base1-1", "en");
  const withoutImage = await repo.getCardDetail("setx-1", "en");
  assert.equal(repo.resolveImage(withImage), "https://assets.tcgdex.net/en/base/base1/1/low.webp");
  assert.equal(repo.resolveImage(withoutImage), null);
});

test("getScannerCandidates: usa só os registros físicos confirmados (rankCandidates sem alterações)", async () => {
  const repo = buildRepoWithTestDb();
  const parsed = parseCardText(["Pikachu", "025/165"]);
  const { candidates } = await repo.getScannerCandidates(parsed, { topN: 5 });
  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].record.sourceCardId, "sv03.5-025");
  // Confirma que a carta digital nunca entra nem como candidato de baixo score.
  assert.ok(!candidates.some((c) => c.record.sourceCardId === "B2-001"));
});

/**
 * Base maior simulada (2000 cartas "ruído" + 1 carta alvo real) — prova,
 * com volume comparável ao catálogo real (21 mil+), que o pré-filtro SQL
 * (achado real de performance em dispositivo físico, 25/10/2026: sem ele,
 * rankCandidates() levava 14-20s no celular) reduz de verdade o volume
 * pontuado em JS, sem perder a carta certa.
 */
function buildLargeRepoWithTestDb() {
  const raw = new Database(":memory:");
  raw.exec(`
    CREATE TABLE card_index (
      source_card_id TEXT NOT NULL, source_language TEXT NOT NULL, name TEXT,
      local_id TEXT, set_id TEXT, set_name TEXT, set_serie_id TEXT,
      set_official INTEGER, set_total INTEGER, set_printed_code TEXT,
      has_image INTEGER, image_base_url TEXT,
      PRIMARY KEY (source_card_id, source_language)
    );
  `);
  const insert = raw.prepare(`INSERT INTO card_index VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insertMany = raw.transaction((rows) => { for (const r of rows) insert.run(...r); });

  const noise = [];
  for (let i = 0; i < 2000; i++) {
    noise.push([`noise-${i}`, "en", `Ruído ${i}`, String(i % 300), `set-${i % 40}`, `Set ${i % 40}`, "base", 300, 300, null, 0, null]);
  }
  insertMany(noise);
  insert.run("sv03.5-025", "en", "Pikachu", "025", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/en/sv/sv03.5/025");

  const repo = new CatalogRepository();
  repo._db = wrapDb(raw);
  return repo;
}

test("getScannerCandidateRecords: pré-filtro SQL reduz de verdade o volume (2001 -> muito menos) sem perder a carta certa", async () => {
  const repo = buildLargeRepoWithTestDb();
  const parsed = parseCardText(["Pikachu", "025/165"]);
  const records = await repo.getScannerCandidateRecords(parsed);
  assert.ok(records.length < 2001, `esperado bem menos que 2001 registros, veio ${records.length}`);
  assert.ok(records.some((r) => r.sourceCardId === "sv03.5-025"), "a carta certa precisa continuar no conjunto pré-filtrado");
});

test("getScannerCandidates: encontra a carta certa como Top-1 mesmo com 2000 cartas de ruído no catálogo", async () => {
  const repo = buildLargeRepoWithTestDb();
  const parsed = parseCardText(["Pikachu", "025/165"]);
  const { candidates } = await repo.getScannerCandidates(parsed, { topN: 5 });
  assert.equal(candidates[0].record.sourceCardId, "sv03.5-025");
});

test("getScannerCandidateRecords: sem número nem nome legível -> cai pro catálogo completo (rede de segurança)", async () => {
  const repo = buildLargeRepoWithTestDb();
  const parsed = parseCardText([]); // OCR não leu nada
  const records = await repo.getScannerCandidateRecords(parsed);
  assert.equal(records.length, 2001); // 2000 ruído + Pikachu, nada filtrado
});

test("getScannerCandidates: em empate de confiança, português vem primeiro (pedido real do usuário, 25/10/2026)", async () => {
  const raw = new Database(":memory:");
  raw.exec(`
    CREATE TABLE card_index (
      source_card_id TEXT NOT NULL, source_language TEXT NOT NULL, name TEXT,
      local_id TEXT, set_id TEXT, set_name TEXT, set_serie_id TEXT,
      set_official INTEGER, set_total INTEGER, set_printed_code TEXT,
      has_image INTEGER, image_base_url TEXT,
      PRIMARY KEY (source_card_id, source_language)
    );
  `);
  const insert = raw.prepare(`INSERT INTO card_index VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  // Mesma carta, 4 idiomas, dados reais (sv03.5-001) — empate genuíno de
  // score já documentado em reports/decision.md (nome idêntico em en/pt,
  // número/total idênticos nos 4). "en" inserido PRIMEIRO de propósito
  // (mesma ordem real de scripts/sync-full-catalog.js, DEFAULT_LANGS
  // começando com "en") pra provar que a prioridade por idioma realmente
  // sobrepõe a ordem de inserção/consulta, não só coincide com ela.
  insert.run("sv03.5-001", "en", "Bulbasaur", "001", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/en/sv/sv03.5/001");
  insert.run("sv03.5-001", "de", "Bisasam", "001", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/de/sv/sv03.5/001");
  insert.run("sv03.5-001", "pt", "Bulbasaur", "001", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/pt/sv/sv03.5/001");
  insert.run("sv03.5-001", "fr", "Bulbizarre", "001", "sv03.5", "151", "sv", 165, 207, "MEW", 1, "https://assets.tcgdex.net/fr/sv/sv03.5/001");

  const repo = new CatalogRepository();
  repo._db = wrapDb(raw);
  const parsed = parseCardText(["Bulbasaur", "001/165"]);
  const { candidates } = await repo.getScannerCandidates(parsed, { topN: 5 });
  assert.equal(candidates[0].record.sourceLanguage, "pt");
});

test("listSets / listLanguages: não filtram por física (são metadados informativos do banco instalado)", async () => {
  const repo = buildRepoWithTestDb();
  const sets = await repo.listSets();
  const langs = await repo.listLanguages();
  assert.ok(sets.some((s) => s.setId === "base1"));
  assert.deepEqual(langs, ["en"]);
});
