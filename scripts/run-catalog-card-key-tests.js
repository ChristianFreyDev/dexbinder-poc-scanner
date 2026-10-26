/**
 * Testes reais (node:test) de src/domain/catalogCardKey.js — identidade
 * estável de impressão (especificação da Entrega 2, seção 4.3).
 * Executar: node --test scripts/run-catalog-card-key-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCatalogCardKey, buildCatalogCardKeyFromRecord, parseCatalogCardKey } = require("../src/domain/catalogCardKey");

test("gera a mesma chave para os mesmos componentes", () => {
  const a = buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" });
  const b = buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" });
  assert.equal(a, b);
});

test("idiomas diferentes da mesma carta geram chaves diferentes (duas impressões distintas)", () => {
  const en = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" });
  const pt = buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" });
  assert.notEqual(en, pt);
});

test("não depende só de source_card_id: sets diferentes com mesmo sourceCardId (hipotético) não colidem", () => {
  const a = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "x-1", sourceSetId: "setA", localId: "1" });
  const b = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "x-1", sourceSetId: "setB", localId: "1" });
  assert.notEqual(a, b);
});

test("componentes contendo o delimitador '|' não colidem com uma concatenação diferente (escape real, não ingênuo)", () => {
  // "a|b" + "c" via concatenação ingênua colidiria com "a" + "b|c" — o escape evita isso.
  const a = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "a|b", sourceSetId: "c", localId: "1" });
  const b = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "a", sourceSetId: "b|c", localId: "1" });
  assert.notEqual(a, b);
});

test("componentes contendo a barra invertida também não colidem", () => {
  const a = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "a\\|b", sourceSetId: "c", localId: "1" });
  const b = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "a\\", sourceSetId: "b", localId: "c" });
  assert.notEqual(a, b);
});

test("lança erro claro se faltar sourceLanguage ou sourceCardId", () => {
  assert.throws(() => buildCatalogCardKey({ sourceCardId: "x" }));
  assert.throws(() => buildCatalogCardKey({ sourceLanguage: "en" }));
});

test("buildCatalogCardKeyFromRecord usa os campos reais do mapRow (catalogRowMapping.js)", () => {
  const record = {
    sourceCardId: "sv03.5-001",
    sourceLanguage: "pt",
    name: "Bulbasaur",
    localId: "001",
    setId: "sv03.5",
    setName: "151",
  };
  const key = buildCatalogCardKeyFromRecord(record);
  assert.equal(key, buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" }));
});

test("parseCatalogCardKey desserializa de volta os componentes originais", () => {
  const key = buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" });
  const parsed = parseCatalogCardKey(key);
  assert.equal(parsed.provider, "tcgdex");
  assert.equal(parsed.sourceLanguage, "pt");
  assert.equal(parsed.sourceCardId, "sv03.5-001");
  assert.equal(parsed.sourceSetId, "sv03.5");
  assert.equal(parsed.localId, "001");
});

test("parseCatalogCardKey desserializa corretamente mesmo com delimitador escapado nos componentes", () => {
  const key = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "a|b", sourceSetId: "c", localId: "1" });
  const parsed = parseCatalogCardKey(key);
  assert.equal(parsed.sourceCardId, "a|b");
  assert.equal(parsed.sourceSetId, "c");
});

test("localId numérico com zero à esquerda não é perdido (nunca convertido para inteiro)", () => {
  const key = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "base1-1", sourceSetId: "base1", localId: "001" });
  const parsed = parseCatalogCardKey(key);
  assert.equal(parsed.localId, "001");
  assert.notEqual(parsed.localId, "1");
});
