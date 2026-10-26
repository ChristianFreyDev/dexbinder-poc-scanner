/**
 * Testes reais (node:test) de src/collections/checklistRepository.js contra
 * SQLite de verdade em memória — especificação da Entrega 2, seção 12.3.
 * Executar: node --test scripts/run-checklist-repository-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMigratedTestDb } = require("./testHelpers/userTestDb");
const { CollectionRepository } = require("../src/collections/collectionRepository");
const { ChecklistRepository } = require("../src/collections/checklistRepository");
const { generateSpeciesChecklistItems } = require("../src/domain/checklistGeneration");

async function setupCollection(overrides = {}) {
  const db = await createMigratedTestDb();
  const collections = new CollectionRepository(db);
  const checklists = new ChecklistRepository(db);
  const created = await collections.create({ name: "Teste", collectionType: "pokedex", creationMode: "automatic", ...overrides });
  return { db, checklists, collectionId: created.collection.id };
}

test("generateAutomatic: gera Pokédex de 1025 espécies sem lacunas/duplicatas inesperadas", async () => {
  const { checklists, collectionId } = await setupCollection();
  const species = Array.from({ length: 1025 }, (_, i) => ({ nationalNumber: i + 1, label: `Espécie ${i + 1}` }));
  const specs = generateSpeciesChecklistItems(species);
  await checklists.generateAutomatic(collectionId, specs);
  const items = await checklists.listItems(collectionId);
  assert.equal(items.length, 1025);
  assert.equal(items[0].nationalDexNumber, 1);
  assert.equal(items[1024].nationalDexNumber, 1025);
});

test("addManualItem: adiciona item manual avulso, marcado como manual_added", async () => {
  const { checklists, collectionId } = await setupCollection();
  const result = await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 150, targetLabelSnapshot: "Mewtwo" });
  assert.equal(result.added, true);
  assert.equal(result.item.source, "manual_added");
});

test("addManualItem: alvo duplicado não duplica silenciosamente — devolve o existente", async () => {
  const { checklists, collectionId } = await setupCollection();
  await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 1 });
  const second = await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 1 });
  assert.equal(second.added, false);
  assert.ok(second.duplicate);
  const items = await checklists.listItems(collectionId);
  assert.equal(items.length, 1);
});

test("removeItem: marca como excluído (nunca apaga a linha) e desvincula cópias", async () => {
  const { db, checklists, collectionId } = await setupCollection();
  const added = await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 1 });
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO owned_card_copies (id, catalog_card_key, source_language, source_card_id, collection_id, checklist_item_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["copy1", "key-1", "pt", "src-1", collectionId, added.item.id, now, now]
  );

  await checklists.removeItem(added.item.id);

  const activeItems = await checklists.listItems(collectionId, { includeExcluded: false });
  assert.equal(activeItems.length, 0);
  const allItems = await checklists.listItems(collectionId, { includeExcluded: true });
  assert.equal(allItems.length, 1, "linha continua existindo, só marcada como excluída");

  const copyRow = await db.getFirstAsync(`SELECT checklist_item_id FROM owned_card_copies WHERE id = 'copy1'`);
  assert.equal(copyRow.checklist_item_id, null, "cópia física continua no inventário, só perde o alvo de checklist");
});

test("reorderItems: aplica sort_order explícito e estável", async () => {
  const { checklists, collectionId } = await setupCollection();
  const a = await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 1 });
  const b = await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 2 });
  await checklists.reorderItems(collectionId, [b.item.id, a.item.id]);
  const items = await checklists.listItems(collectionId);
  assert.deepEqual(items.map((i) => i.nationalDexNumber), [2, 1]);
});

test("previewRegeneration + applyRegeneration: edição manual não desaparece numa regeneração", async () => {
  const { checklists, collectionId } = await setupCollection();
  await checklists.generateAutomatic(collectionId, generateSpeciesChecklistItems([{ nationalNumber: 1 }, { nationalNumber: 2 }]));
  await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 999 });

  // Catálogo "atualizado" não tem mais a espécie 2, mas tem uma nova (3).
  const fresh = generateSpeciesChecklistItems([{ nationalNumber: 1 }, { nationalNumber: 3 }]);
  const preview = await checklists.previewRegeneration(collectionId, fresh);
  assert.equal(preview.toAdd.length, 1);
  assert.equal(preview.toAdd[0].nationalDexNumber, 3);
  assert.equal(preview.toRemove.length, 1);
  assert.equal(preview.toRemove[0].nationalDexNumber, 2);
  // manual (999) e o que ainda existe (1) ficam em toKeep.
  assert.equal(preview.toKeep.length, 2);

  await checklists.applyRegeneration(collectionId, preview);
  const activeItems = await checklists.listItems(collectionId);
  const dexNumbers = activeItems.map((i) => i.nationalDexNumber).sort((a, b) => a - b);
  assert.deepEqual(dexNumbers, [1, 3, 999], "espécie 2 removida, 3 adicionada, 999 (manual) preservada");
});

test("findMatchingItem: acha item de impressão exata por catalogCardKey", async () => {
  const { checklists, collectionId } = await setupCollection();
  const item = await checklists.addManualItem(collectionId, {
    targetType: "catalog_card",
    catalogCardKey: "key-1",
    targetSetSnapshot: "sv",
    targetNumberSnapshot: "001",
  });
  const match = await checklists.findMatchingItem(collectionId, { catalogCardKey: "key-1" });
  assert.equal(match.id, item.item.id);
  const noMatch = await checklists.findMatchingItem(collectionId, { catalogCardKey: "key-outro" });
  assert.equal(noMatch, null);
});

test("findMatchingItem: acha item any_supported por set+número quando catalogCardKey é null", async () => {
  const { checklists, collectionId } = await setupCollection();
  await checklists.addManualItem(collectionId, {
    targetType: "catalog_card",
    catalogCardKey: null,
    targetSetSnapshot: "sv03.5",
    targetNumberSnapshot: "001",
  });
  const match = await checklists.findMatchingItem(collectionId, { catalogCardKey: "key-en", setId: "sv03.5", localId: "001" });
  assert.ok(match, "deveria bater pelo set+número mesmo com catalogCardKey diferente");
});

test("findMatchingItem: acha item de espécie por nationalDexNumber", async () => {
  const { checklists, collectionId } = await setupCollection();
  await checklists.addManualItem(collectionId, { targetType: "pokemon_species", nationalDexNumber: 25 });
  const match = await checklists.findMatchingItem(collectionId, { nationalDexNumber: 25 });
  assert.ok(match);
});

test("exclusão manual de item automático não reaparece numa regeneração seguinte", async () => {
  const { checklists, collectionId } = await setupCollection();
  await checklists.generateAutomatic(collectionId, generateSpeciesChecklistItems([{ nationalNumber: 1 }, { nationalNumber: 2 }]));
  const items = await checklists.listItems(collectionId);
  const item2 = items.find((i) => i.nationalDexNumber === 2);
  await checklists.removeItem(item2.id);

  const fresh = generateSpeciesChecklistItems([{ nationalNumber: 1 }, { nationalNumber: 2 }]); // catálogo ainda tem a espécie 2
  const preview = await checklists.previewRegeneration(collectionId, fresh);
  assert.equal(preview.toAdd.length, 0, "espécie 2 excluída deliberadamente não deveria voltar sozinha");
});
