/**
 * Testes reais (node:test) de src/collections/collectionProgressService.js —
 * orquestração ponta a ponta contra SQLite de verdade em memória
 * (especificação da Entrega 2, seções 9, 12.5, 12.7).
 * Executar: node --test scripts/run-collection-progress-service-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMigratedTestDb } = require("./testHelpers/userTestDb");
const { CollectionProgressService } = require("../src/collections/collectionProgressService");
const { generateSpeciesChecklistItems, generateCardChecklistItems } = require("../src/domain/checklistGeneration");
const { buildCatalogCardKey } = require("../src/domain/catalogCardKey");

async function setup() {
  const db = await createMigratedTestDb();
  return new CollectionProgressService({ db });
}

test("getCollectionProgress: espécie só completa após associação confirmada + cópia atribuída ao fichário", async () => {
  const service = await setup();
  const created = await service.collections.create({ name: "Pokédex", collectionType: "pokedex", creationMode: "automatic" });
  const collectionId = created.collection.id;
  await service.checklists.generateAutomatic(collectionId, generateSpeciesChecklistItems([{ nationalNumber: 1 }, { nationalNumber: 2 }]));

  const before = await service.getCollectionProgress(collectionId);
  assert.equal(before.completedItems, 0);

  const catalogCardKey = buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001" });
  await service.copies.addCopies({ catalogCardKey, sourceLanguage: "pt", sourceCardId: "sv03.5-001", sourceSetId: "sv03.5", localId: "001", collectionId });
  await service.speciesLinks.confirmAssociation({ catalogCardKey, nationalDexNumber: 1 });

  const after = await service.getCollectionProgress(collectionId);
  assert.equal(after.completedItems, 1);
  assert.equal(after.missingItems, 1);
  assert.equal(after.completionPercentage, 50);
});

test("getCollectionProgress: cópia em OUTRO fichário não completa o item deste fichário", async () => {
  const service = await setup();
  const colA = (await service.collections.create({ name: "A", collectionType: "pokedex", creationMode: "automatic" })).collection;
  const colB = (await service.collections.create({ name: "B", collectionType: "pokedex", creationMode: "automatic" })).collection;
  await service.checklists.generateAutomatic(colA.id, generateSpeciesChecklistItems([{ nationalNumber: 1 }]));
  await service.checklists.generateAutomatic(colB.id, generateSpeciesChecklistItems([{ nationalNumber: 1 }]));

  const catalogCardKey = buildCatalogCardKey({ sourceLanguage: "pt", sourceCardId: "x-1", sourceSetId: "x", localId: "1" });
  await service.copies.addCopies({ catalogCardKey, sourceLanguage: "pt", sourceCardId: "x-1", sourceSetId: "x", localId: "1", collectionId: colB.id });
  await service.speciesLinks.confirmAssociation({ catalogCardKey, nationalDexNumber: 1 });

  const progressA = await service.getCollectionProgress(colA.id);
  const progressB = await service.getCollectionProgress(colB.id);
  assert.equal(progressA.completedItems, 0, "fichário A não tem a cópia atribuída a ele");
  assert.equal(progressB.completedItems, 1);
});

test("getPokedexGlobalProgress: conta espécie confirmada mesmo em cópia SEM fichário", async () => {
  const service = await setup();
  const catalogCardKey = buildCatalogCardKey({ sourceLanguage: "en", sourceCardId: "y-1", sourceSetId: "y", localId: "1" });
  await service.copies.addCopies({ catalogCardKey, sourceLanguage: "en", sourceCardId: "y-1", sourceSetId: "y", localId: "1", collectionId: null });
  await service.speciesLinks.confirmAssociation({ catalogCardKey, nationalDexNumber: 7 });

  const progress = await service.getPokedexGlobalProgress(1025);
  assert.equal(progress.obtainedSpeciesCount, 1);
  assert.ok(progress.obtainedDexNumbers.has(7));
});

test("getInventoryTotals: conta cópias de todos os fichários + sem fichário", async () => {
  const service = await setup();
  const col = (await service.collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  await service.copies.addCopies({ catalogCardKey: "k1", sourceLanguage: "en", sourceCardId: "s-1", collectionId: col.id });
  await service.copies.addCopies({ catalogCardKey: "k2", sourceLanguage: "en", sourceCardId: "s-2", collectionId: null });
  const totals = await service.getInventoryTotals();
  assert.equal(totals.totalPhysicalCopies, 2);
});

test("getConfirmedCardStatus: mostra cópias existentes, localização e fichários que ainda precisam da impressão", async () => {
  const service = await setup();
  const expansion = (
    await service.collections.create({ name: "151", collectionType: "expansion", creationMode: "automatic", sourceSetId: "sv03.5" })
  ).collection;

  const records = [
    { sourceCardId: "sv03.5-001", sourceLanguage: "en", name: "Bulbasaur", localId: "001", setId: "sv03.5", setOfficial: 1 },
  ];
  await service.checklists.generateAutomatic(expansion.id, generateCardChecklistItems(records, { languagePolicy: "specific" }));

  const confirmedRecord = { sourceCardId: "sv03.5-001", sourceLanguage: "en", setId: "sv03.5", localId: "001", name: "Bulbasaur" };
  const statusBefore = await service.getConfirmedCardStatus(confirmedRecord);
  assert.equal(statusBefore.existingCopies.length, 0);
  assert.equal(statusBefore.collectionsNeedingThis.length, 1);
  assert.equal(statusBefore.collectionsNeedingThis[0].collectionId, expansion.id);
  assert.equal(statusBefore.collectionsCompletedByThis.length, 0);

  const catalogCardKey = buildCatalogCardKey({
    sourceLanguage: "en",
    sourceCardId: "sv03.5-001",
    sourceSetId: "sv03.5",
    localId: "001",
  });
  await service.copies.addCopies({
    catalogCardKey,
    sourceLanguage: "en",
    sourceCardId: "sv03.5-001",
    sourceSetId: "sv03.5",
    localId: "001",
    collectionId: expansion.id,
  });

  const statusAfter = await service.getConfirmedCardStatus(confirmedRecord);
  assert.equal(statusAfter.existingCopies.length, 1);
  assert.equal(statusAfter.existingCopies[0].collectionName, "151");
  assert.equal(statusAfter.collectionsCompletedByThis.length, 1);
  assert.equal(statusAfter.collectionsNeedingThis.length, 0);
});

test("getConfirmedCardStatus: identificação sem confirmação (nenhuma cópia criada) nunca aparece como posse", async () => {
  const service = await setup();
  const record = { sourceCardId: "z-1", sourceLanguage: "en", setId: "z", localId: "1", name: "Qualquer" };
  const status = await service.getConfirmedCardStatus(record);
  assert.equal(status.existingCopies.length, 0);
  assert.equal(status.speciesAssociation.confirmed, false);
});
