/**
 * Testes reais (node:test) de src/collections/physicalCopyRepository.js
 * contra SQLite de verdade em memória — especificação da Entrega 2, seção
 * 12.4 (regra central: cada cópia física é um registro próprio, no máximo
 * um fichário/bolso por vez).
 * Executar: node --test scripts/run-physical-copy-repository-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMigratedTestDb } = require("./testHelpers/userTestDb");
const { CollectionRepository } = require("../src/collections/collectionRepository");
const { PhysicalCopyRepository } = require("../src/collections/physicalCopyRepository");

async function setup() {
  const db = await createMigratedTestDb();
  const collections = new CollectionRepository(db);
  const copies = new PhysicalCopyRepository(db);
  return { db, collections, copies };
}

function sampleCopyInput(overrides = {}) {
  return {
    catalogCardKey: "key-bulba-en",
    sourceLanguage: "en",
    sourceCardId: "sv03.5-001",
    sourceSetId: "sv03.5",
    localId: "001",
    cardNameSnapshot: "Bulbasaur",
    ...overrides,
  };
}

test("addCopies: adicionar 1, 2 e N cópias cria IDs diferentes", async () => {
  const { copies } = await setup();
  const one = await copies.addCopies(sampleCopyInput({ quantity: 1 }));
  const two = await copies.addCopies(sampleCopyInput({ quantity: 2 }));
  const five = await copies.addCopies(sampleCopyInput({ quantity: 5 }));
  assert.equal(one.length, 1);
  assert.equal(two.length, 2);
  assert.equal(five.length, 5);
  const allIds = [...one, ...two, ...five].map((c) => c.id);
  assert.equal(new Set(allIds).size, allIds.length, "todos os IDs devem ser distintos");
});

test("addCopies: toda cópia nasce sem posição (aguardando organização / sem fichário)", async () => {
  const { collections, copies } = await setup();
  const col = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const [copy] = await copies.addCopies(sampleCopyInput({ quantity: 1, collectionId: col.id }));
  assert.equal(copy.pageNumber, null);
  assert.equal(copy.slotIndex, null);
});

test("duas cópias da mesma impressão em fichários DISTINTOS contam como duas unidades", async () => {
  const { collections, copies } = await setup();
  const colA = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const colB = (await collections.create({ name: "B", collectionType: "custom", creationMode: "manual" })).collection;
  await copies.addCopies(sampleCopyInput({ collectionId: colA.id }));
  await copies.addCopies(sampleCopyInput({ collectionId: colB.id }));
  const totals = await copies.getCounts();
  assert.equal(totals.totalPhysicalCopies, 2);
  assert.equal(totals.distinctPrints, 1, "mesma impressão, mas 2 cópias físicas");
});

test("moveCopy: mover uma cópia não altera o total físico", async () => {
  const { collections, copies } = await setup();
  const col = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const [copy] = await copies.addCopies(sampleCopyInput({ collectionId: col.id }));
  await copies.moveCopy(copy.id, { pageNumber: 1, slotIndex: 1 });
  const totals = await copies.getCounts();
  assert.equal(totals.totalPhysicalCopies, 1);
});

test("não é possível ocupar um bolso já preenchido sem decisão explícita (conflict, nunca sobrescreve)", async () => {
  const { collections, copies } = await setup();
  const col = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const [copyA] = await copies.addCopies(sampleCopyInput({ collectionId: col.id, catalogCardKey: "key-a" }));
  const [copyB] = await copies.addCopies(sampleCopyInput({ collectionId: col.id, catalogCardKey: "key-b" }));
  await copies.moveCopy(copyA.id, { pageNumber: 1, slotIndex: 1 });

  const result = await copies.moveCopy(copyB.id, { pageNumber: 1, slotIndex: 1 });
  assert.equal(result.moved, false);
  assert.equal(result.conflict, true);
  assert.equal(result.occupantId, copyA.id);

  const stillUnplaced = await copies.getById(copyB.id);
  assert.equal(stillUnplaced.pageNumber, null, "cópia B não deveria ter sido movida");
});

test("swapCopies: troca a posição de duas cartas do mesmo fichário atomicamente", async () => {
  const { collections, copies } = await setup();
  const col = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const [copyA] = await copies.addCopies(sampleCopyInput({ collectionId: col.id, catalogCardKey: "key-a" }));
  const [copyB] = await copies.addCopies(sampleCopyInput({ collectionId: col.id, catalogCardKey: "key-b" }));
  await copies.moveCopy(copyA.id, { pageNumber: 1, slotIndex: 1 });
  await copies.moveCopy(copyB.id, { pageNumber: 1, slotIndex: 2 });

  await copies.swapCopies(copyA.id, copyB.id);

  const refreshedA = await copies.getById(copyA.id);
  const refreshedB = await copies.getById(copyB.id);
  assert.equal(refreshedA.slotIndex, 2);
  assert.equal(refreshedB.slotIndex, 1);
});

test("uma cópia não pode estar em dois fichários ao mesmo tempo (transferCopy muda, nunca duplica)", async () => {
  const { collections, copies } = await setup();
  const colA = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const colB = (await collections.create({ name: "B", collectionType: "custom", creationMode: "manual" })).collection;
  const [copy] = await copies.addCopies(sampleCopyInput({ collectionId: colA.id }));

  const totalsBefore = await copies.getCounts();
  await copies.transferCopy(copy.id, { collectionId: colB.id });
  const totalsAfter = await copies.getCounts();

  assert.equal(totalsBefore.totalPhysicalCopies, totalsAfter.totalPhysicalCopies, "transferência não altera o total do inventário");
  const refreshed = await copies.getById(copy.id);
  assert.equal(refreshed.collectionId, colB.id);
});

test("transferCopy: destino ocupado não sobrescreve — devolve conflict", async () => {
  const { collections, copies } = await setup();
  const colA = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  const colB = (await collections.create({ name: "B", collectionType: "custom", creationMode: "manual" })).collection;
  const [copyInB] = await copies.addCopies(sampleCopyInput({ collectionId: colB.id, catalogCardKey: "key-b" }));
  await copies.moveCopy(copyInB.id, { pageNumber: 1, slotIndex: 1 });
  const [copyInA] = await copies.addCopies(sampleCopyInput({ collectionId: colA.id, catalogCardKey: "key-a" }));

  const result = await copies.transferCopy(copyInA.id, { collectionId: colB.id, pageNumber: 1, slotIndex: 1 });
  assert.equal(result.conflict, true);
});

test("cópia sem fichário e cópia em fichário sem posição são estados diferentes", async () => {
  const { collections, copies } = await setup();
  const col = (await collections.create({ name: "A", collectionType: "custom", creationMode: "manual" })).collection;
  await copies.addCopies(sampleCopyInput({ collectionId: null }));
  await copies.addCopies(sampleCopyInput({ collectionId: col.id, catalogCardKey: "key-2" }));

  const totals = await copies.getCounts();
  assert.equal(totals.unassignedCopies, 1);
  assert.equal(totals.awaitingPlacementCopies, 1);
});

test("removeCopy: remoção lógica recalcula totais sem apagar outras cópias da mesma impressão", async () => {
  const { copies } = await setup();
  const [copyA] = await copies.addCopies(sampleCopyInput());
  const [copyB] = await copies.addCopies(sampleCopyInput());

  await copies.removeCopy(copyA.id);

  const totals = await copies.getCounts();
  assert.equal(totals.totalPhysicalCopies, 1);
  const stillThere = await copies.getById(copyB.id);
  assert.ok(stillThere, "a outra cópia da mesma impressão continua ativa");
  const removed = await copies.getById(copyA.id);
  assert.equal(removed, null, "a cópia removida não aparece mais como ativa");
});
