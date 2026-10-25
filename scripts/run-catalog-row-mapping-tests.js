/**
 * Testes reais (node:test) de src/storage/catalogRowMapping.js — mapRow()
 * usa uma linha REAL do banco catalog.db publicado (baixado e inspecionado
 * de verdade via `gh release` + better-sqlite3, ver reports/delivery-1.md)
 * como fixture, não um objeto inventado.
 *
 * Executar: node --test scripts/run-catalog-row-mapping-tests.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { mapRow, buildNumberCandidates } = require("../src/storage/catalogRowMapping");

// Linha real do catalog.db publicado (Release catalog-data, 25/10/2026) —
// não inventada, copiada de uma consulta real contra o banco baixado.
const REAL_ROW = {
  source_card_id: "base1-1",
  source_language: "en",
  name: "Alakazam",
  local_id: "1",
  set_id: "base1",
  set_name: "Base Set",
  set_serie_id: "base",
  set_official: 102,
  set_total: 102,
  set_printed_code: "BS",
  has_image: 1,
  image_base_url: "https://assets.tcgdex.net/en/base/base1/1",
};

test("mapRow: converte a linha real do banco pro formato usado por rankCandidates()", () => {
  const record = mapRow(REAL_ROW);
  assert.deepEqual(record, {
    sourceCardId: "base1-1",
    sourceLanguage: "en",
    name: "Alakazam",
    localId: "1",
    setId: "base1",
    setName: "Base Set",
    setSerieId: "base",
    setOfficial: 102,
    setTotal: 102,
    setPrintedCode: "BS",
    hasImage: true,
    imageBaseUrl: "https://assets.tcgdex.net/en/base/base1/1",
  });
});

test("mapRow: localId sempre vira string, nunca número (especificação, seção 4.4)", () => {
  const record = mapRow({ ...REAL_ROW, local_id: 1 });
  assert.equal(typeof record.localId, "string");
  assert.equal(record.localId, "1");
});

test("mapRow: has_image 0 vira false", () => {
  const record = mapRow({ ...REAL_ROW, has_image: 0, image_base_url: null });
  assert.equal(record.hasImage, false);
  assert.equal(record.imageBaseUrl, null);
});

test("buildNumberCandidates: número já sem zero à esquerda -> só ele mesmo", () => {
  assert.deepEqual(buildNumberCandidates("1"), ["1"]);
});

test("buildNumberCandidates: número com zero à esquerda -> ele mesmo + versão sem zeros", () => {
  assert.deepEqual(buildNumberCandidates("001"), ["001", "1"]);
});

test("buildNumberCandidates: id alfanumérico (não puramente numérico) não quebra", () => {
  // Ex. real do catálogo: localId "GG01" (Galarian Gallery), "DP01" (promo).
  assert.deepEqual(buildNumberCandidates("GG01"), ["GG01"]);
});
