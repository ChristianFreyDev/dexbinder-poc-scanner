/**
 * Testes reais (node:test) de src/domain/progressCalculations.js —
 * especificação da Entrega 2, seções 6.1, 9, 12.3-12.5.
 * Executar: node --test scripts/run-progress-calculations-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateCollectionProgress,
  calculateInventoryTotals,
  calculatePokedexGlobalProgress,
  isItemComplete,
  buildOwnershipIndex,
} = require("../src/domain/progressCalculations");

function speciesItem(nationalDexNumber, overrides = {}) {
  return { targetType: "pokemon_species", nationalDexNumber, isExcluded: false, ...overrides };
}
function cardItem(catalogCardKey, overrides = {}) {
  return { targetType: "catalog_card", catalogCardKey, isExcluded: false, ...overrides };
}
function copy(overrides = {}) {
  return { catalogCardKey: "key-1", sourceSetId: "sv03.5", localId: "001", pageNumber: 1, slotIndex: 1, ...overrides };
}

test("checklist vazia: percentual seguro (0%, sem divisão por zero)", () => {
  const result = calculateCollectionProgress({ checklistItems: [], copiesInCollection: [] });
  assert.equal(result.totalChecklistItems, 0);
  assert.equal(result.completionPercentage, 0);
});

test("item de espécie só completa com associação CONFIRMED (suggested nunca conta)", () => {
  const items = [speciesItem(1)];
  const copies = [copy({ catalogCardKey: "key-bulba" })];
  const suggestedOnly = new Map([["key-bulba", new Set()]]); // nenhuma confirmed
  const resultSuggested = calculateCollectionProgress({ checklistItems: items, copiesInCollection: copies, confirmedLinksByCardKey: suggestedOnly });
  assert.equal(resultSuggested.completedItems, 0);

  const confirmed = new Map([["key-bulba", new Set([1])]]);
  const resultConfirmed = calculateCollectionProgress({ checklistItems: items, copiesInCollection: copies, confirmedLinksByCardKey: confirmed });
  assert.equal(resultConfirmed.completedItems, 1);
});

test("item de impressão (idioma específico) só completa com a MESMA catalog_card_key", () => {
  const items = [cardItem("key-en")];
  const copiesWrongLang = [copy({ catalogCardKey: "key-pt" })];
  assert.equal(calculateCollectionProgress({ checklistItems: items, copiesInCollection: copiesWrongLang }).completedItems, 0);

  const copiesRightLang = [copy({ catalogCardKey: "key-en" })];
  assert.equal(calculateCollectionProgress({ checklistItems: items, copiesInCollection: copiesRightLang }).completedItems, 1);
});

test("item any_supported completa por set+número reais, em qualquer idioma presente", () => {
  const item = cardItem(null, { targetSetSnapshot: "sv03.5", targetNumberSnapshot: "001" });
  const copyEn = copy({ catalogCardKey: "key-en", sourceSetId: "sv03.5", localId: "001" });
  assert.equal(calculateCollectionProgress({ checklistItems: [item], copiesInCollection: [copyEn] }).completedItems, 1);

  const copyWrongSet = copy({ catalogCardKey: "key-x", sourceSetId: "outro-set", localId: "001" });
  assert.equal(calculateCollectionProgress({ checklistItems: [item], copiesInCollection: [copyWrongSet] }).completedItems, 0);
});

test("cópia em OUTRO fichário não completa o item deste fichário (isolamento por coleção)", () => {
  // Simulação: copiesInCollection já vem filtrado pelo repositório para UMA coleção;
  // uma cópia de outro fichário simplesmente não aparece nesta lista.
  const item = speciesItem(25);
  const confirmed = new Map([["key-pikachu", new Set([25])]]);
  const noCopiesHere = calculateCollectionProgress({ checklistItems: [item], copiesInCollection: [], confirmedLinksByCardKey: confirmed });
  assert.equal(noCopiesHere.completedItems, 0, "cópia confirmada mas em outra coleção não deveria contar aqui");
});

test("item custom sem alvo computável não entra no total (fica como nota)", () => {
  const items = [{ targetType: "custom", isExcluded: false }];
  const result = calculateCollectionProgress({ checklistItems: items, copiesInCollection: [] });
  assert.equal(result.totalChecklistItems, 0);
});

test("item excluído (isExcluded) não entra no total ativo", () => {
  const items = [speciesItem(1), speciesItem(2, { isExcluded: true })];
  const result = calculateCollectionProgress({ checklistItems: items, copiesInCollection: [] });
  assert.equal(result.totalChecklistItems, 1);
});

test("duplicatas da mesma impressão no fichário contam 1x pro item, mas aumentam extraPhysicalCopies", () => {
  const items = [cardItem("key-1")];
  const copies = [copy({ catalogCardKey: "key-1" }), copy({ catalogCardKey: "key-1", slotIndex: 2 })];
  const result = calculateCollectionProgress({ checklistItems: items, copiesInCollection: copies });
  assert.equal(result.completedItems, 1);
  assert.equal(result.extraPhysicalCopies, 1, "2 cópias, 1 item concluído -> 1 excedente");
});

test("cópia sem posição conta em unplacedCopies", () => {
  const copies = [copy({ pageNumber: null, slotIndex: null })];
  const result = calculateCollectionProgress({ checklistItems: [], copiesInCollection: copies });
  assert.equal(result.unplacedCopies, 1);
});

test("inventário geral conta cópias (não catálogo nem checklist) e distingue sem-fichário de aguardando-posição", () => {
  const copies = [
    copy({ catalogCardKey: "k1", collectionId: null, pageNumber: null, slotIndex: null }), // sem fichário
    copy({ catalogCardKey: "k2", collectionId: "c1", pageNumber: null, slotIndex: null }), // aguardando organização
    copy({ catalogCardKey: "k2", collectionId: "c1", pageNumber: 1, slotIndex: 1 }), // duplicata da mesma impressão, posicionada
  ];
  const totals = calculateInventoryTotals(copies);
  assert.equal(totals.totalPhysicalCopies, 3);
  assert.equal(totals.distinctPrints, 2);
  assert.equal(totals.unassignedCopies, 1);
  assert.equal(totals.awaitingPlacementCopies, 1);
});

test("Pokédex global conta espécie 1x mesmo com várias impressões/cópias confirmadas", () => {
  const copies = [
    copy({ catalogCardKey: "k1" }),
    copy({ catalogCardKey: "k2", slotIndex: 2 }),
  ];
  const confirmed = new Map([
    ["k1", new Set([1])],
    ["k2", new Set([1])], // outra impressão da MESMA espécie
  ]);
  const result = calculatePokedexGlobalProgress({ totalSpecies: 1025, activeCopies: copies, confirmedLinksByCardKey: confirmed });
  assert.equal(result.obtainedSpeciesCount, 1);
  assert.equal(result.missingSpeciesCount, 1024);
});

test("Pokédex global: associação confirmada a cópia SEM fichário ainda conta (pertence ao inventário físico)", () => {
  const copies = [copy({ catalogCardKey: "k1", collectionId: null })];
  const confirmed = new Map([["k1", new Set([7])]]);
  const result = calculatePokedexGlobalProgress({ totalSpecies: 1025, activeCopies: copies, confirmedLinksByCardKey: confirmed });
  assert.equal(result.obtainedSpeciesCount, 1);
  assert.ok(result.obtainedDexNumbers.has(7));
});

test("carta que representa várias espécies: todas as associações confirmadas contam", () => {
  const copies = [copy({ catalogCardKey: "k-multi" })];
  const confirmed = new Map([["k-multi", new Set([1, 2])]]);
  const result = calculatePokedexGlobalProgress({ totalSpecies: 1025, activeCopies: copies, confirmedLinksByCardKey: confirmed });
  assert.equal(result.obtainedSpeciesCount, 2);
});

test("buildOwnershipIndex não quebra com cópia sem catalogCardKey/dexId", () => {
  const index = buildOwnershipIndex([{ sourceSetId: null, localId: null, catalogCardKey: null }], new Map());
  assert.equal(index.confirmedDexNumbers.size, 0);
});

test("isItemComplete devolve false para targetType desconhecido, sem lançar erro", () => {
  assert.equal(isItemComplete({ targetType: "unknown" }, buildOwnershipIndex([])), false);
});
