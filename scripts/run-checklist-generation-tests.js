/**
 * Testes reais (node:test) de src/domain/checklistGeneration.js —
 * especificação da Entrega 2, seções 5, 6.3, 10, 12.3.
 * Executar: node --test scripts/run-checklist-generation-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateSpeciesChecklistItems,
  generateCardChecklistItems,
  isWithinOfficialScope,
  findDuplicateTarget,
  previewChecklistRegeneration,
} = require("../src/domain/checklistGeneration");

test("generateSpeciesChecklistItems: ordena por número nacional crescente e remove duplicatas", () => {
  const items = generateSpeciesChecklistItems([
    { nationalNumber: 25, label: "Pikachu" },
    { nationalNumber: 1, label: "Bulbasaur" },
    { nationalNumber: 1, label: "Bulbasaur (duplicado)" },
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.nationalDexNumber), [1, 25]);
  assert.equal(items[0].source, "automatic");
});

test("isWithinOfficialScope: localId puramente numérico <= setOfficial é oficial; alfanumérico nunca é", () => {
  assert.equal(isWithinOfficialScope({ localId: "165", setOfficial: 165 }), true);
  assert.equal(isWithinOfficialScope({ localId: "166", setOfficial: 165 }), false);
  assert.equal(isWithinOfficialScope({ localId: "GG01", setOfficial: 70 }), false);
});

test("generateCardChecklistItems com scope 'official' exclui extras/secretas fora da contagem oficial", () => {
  const records = [
    { sourceCardId: "a-1", sourceLanguage: "en", name: "A", localId: "001", setId: "sv", setOfficial: 1, setTotal: 2 },
    { sourceCardId: "a-2", sourceLanguage: "en", name: "B (secreta)", localId: "002", setId: "sv", setOfficial: 1, setTotal: 2 },
  ];
  const items = generateCardChecklistItems(records, { scope: "official", languagePolicy: "specific" });
  assert.equal(items.length, 1);
  assert.equal(items[0].targetNumberSnapshot, "001");
});

test("generateCardChecklistItems com scope 'complete_catalog' inclui as extras/secretas", () => {
  const records = [
    { sourceCardId: "a-1", sourceLanguage: "en", name: "A", localId: "001", setId: "sv", setOfficial: 1, setTotal: 2 },
    { sourceCardId: "a-2", sourceLanguage: "en", name: "B (secreta)", localId: "GG01", setId: "sv", setOfficial: 1, setTotal: 2 },
  ];
  const items = generateCardChecklistItems(records, { scope: "complete_catalog", languagePolicy: "specific" });
  assert.equal(items.length, 2);
});

test("generateCardChecklistItems ordena por localId com ordenação NATURAL (nunca converte para inteiro)", () => {
  const records = [
    { sourceCardId: "a-10", sourceLanguage: "en", name: "J", localId: "DP10", setId: "sv" },
    { sourceCardId: "a-2", sourceLanguage: "en", name: "B", localId: "DP02", setId: "sv" },
    { sourceCardId: "a-1", sourceLanguage: "en", name: "A", localId: "DP01", setId: "sv" },
  ];
  const items = generateCardChecklistItems(records, { languagePolicy: "specific" });
  assert.deepEqual(items.map((i) => i.targetNumberSnapshot), ["DP01", "DP02", "DP10"]);
});

test("generateCardChecklistItems 'specific': gera uma catalog_card_key por registro (1 item = 1 impressão exata)", () => {
  const records = [{ sourceCardId: "sv03.5-001", sourceLanguage: "pt", name: "Bulbasaur", localId: "001", setId: "sv03.5" }];
  const items = generateCardChecklistItems(records, { languagePolicy: "specific" });
  assert.equal(items.length, 1);
  assert.ok(items[0].catalogCardKey);
  assert.equal(items[0].targetLanguageSnapshot, "pt");
});

test("generateCardChecklistItems 'any_supported': agrupa por (setId, localId) real, catalogCardKey fica null", () => {
  const records = [
    { sourceCardId: "sv03.5-001", sourceLanguage: "en", name: "Bulbasaur", localId: "001", setId: "sv03.5" },
    { sourceCardId: "sv03.5-001", sourceLanguage: "pt", name: "Bulbasaur", localId: "001", setId: "sv03.5" },
    { sourceCardId: "sv03.5-002", sourceLanguage: "en", name: "Ivysaur", localId: "002", setId: "sv03.5" },
  ];
  const items = generateCardChecklistItems(records, { languagePolicy: "any_supported" });
  assert.equal(items.length, 2, "001 em 2 idiomas vira 1 item só, 002 vira outro");
  assert.equal(items[0].catalogCardKey, null);
  assert.equal(items[0].targetSetSnapshot, "sv03.5");
  assert.equal(items[0].targetNumberSnapshot, "001");
});

test("generateCardChecklistItems 'any_supported' prefere o nome em português quando presente no grupo", () => {
  const records = [
    { sourceCardId: "x-1", sourceLanguage: "en", name: "English Name", localId: "001", setId: "sv" },
    { sourceCardId: "x-1", sourceLanguage: "pt", name: "Nome em Português", localId: "001", setId: "sv" },
  ];
  const items = generateCardChecklistItems(records, { languagePolicy: "any_supported" });
  assert.equal(items[0].targetLabelSnapshot, "Nome em Português");
});

test("findDuplicateTarget: mesmo alvo ativo já existente é encontrado (espécie)", () => {
  const existing = [{ targetType: "pokemon_species", nationalDexNumber: 1, isExcluded: false }];
  const dup = findDuplicateTarget(existing, { targetType: "pokemon_species", nationalDexNumber: 1 });
  assert.ok(dup);
});

test("findDuplicateTarget: alvo excluído não bloqueia reinclusão (não conta como duplicata ativa)", () => {
  const existing = [{ targetType: "pokemon_species", nationalDexNumber: 1, isExcluded: true }];
  const dup = findDuplicateTarget(existing, { targetType: "pokemon_species", nationalDexNumber: 1 });
  assert.equal(dup, null);
});

test("previewChecklistRegeneration: item manual_added nunca entra em toRemove mesmo se sumir do catálogo", () => {
  const existing = [{ targetType: "catalog_card", catalogCardKey: "k-manual", source: "manual_added", isExcluded: false }];
  const fresh = []; // catálogo não gera mais nada
  const { toRemove, toKeep } = previewChecklistRegeneration(existing, fresh);
  assert.equal(toRemove.length, 0);
  assert.equal(toKeep.length, 1);
});

test("previewChecklistRegeneration: item excluído pelo usuário não reaparece sozinho em toAdd", () => {
  const existing = [{ targetType: "pokemon_species", nationalDexNumber: 1, source: "automatic", isExcluded: true }];
  const fresh = [{ targetType: "pokemon_species", nationalDexNumber: 1 }]; // catálogo continua tendo essa espécie
  const { toAdd, toKeep } = previewChecklistRegeneration(existing, fresh);
  assert.equal(toAdd.length, 0);
  assert.equal(toKeep.length, 1, "exclusão deliberada é preservada");
});

test("previewChecklistRegeneration: item automático que sumiu do catálogo entra em toRemove", () => {
  const existing = [{ targetType: "pokemon_species", nationalDexNumber: 999, source: "automatic", isExcluded: false }];
  const fresh = [];
  const { toRemove } = previewChecklistRegeneration(existing, fresh);
  assert.equal(toRemove.length, 1);
});

test("previewChecklistRegeneration: alvo novo do catálogo entra em toAdd", () => {
  const existing = [];
  const fresh = [{ targetType: "pokemon_species", nationalDexNumber: 2 }];
  const { toAdd } = previewChecklistRegeneration(existing, fresh);
  assert.equal(toAdd.length, 1);
});
