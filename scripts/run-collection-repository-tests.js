/**
 * Testes reais (node:test) de src/collections/collectionRepository.js contra
 * SQLite de verdade em memória — especificação da Entrega 2, seção 12.2.
 * Executar: node --test scripts/run-collection-repository-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createMigratedTestDb } = require("./testHelpers/userTestDb");
const { CollectionRepository } = require("../src/collections/collectionRepository");

async function setup() {
  const db = await createMigratedTestDb();
  return new CollectionRepository(db);
}

test("create: cria fichário Pokédex, Expansão e Personalizada", async () => {
  const repo = await setup();
  const pokedex = await repo.create({ name: "Minha Pokédex", collectionType: "pokedex", creationMode: "automatic" });
  const expansion = await repo.create({ name: "151", collectionType: "expansion", creationMode: "automatic", sourceSetId: "sv03.5" });
  const custom = await repo.create({ name: "Favoritas", collectionType: "custom", creationMode: "manual" });
  assert.ok(pokedex.created && expansion.created && custom.created);
  assert.equal(pokedex.collection.collectionType, "pokedex");
  assert.equal(expansion.collection.sourceSetId, "sv03.5");
});

test("create: valida nome obrigatório (espaços nas pontas não contam como preenchido)", async () => {
  const repo = await setup();
  const result = await repo.create({ name: "   ", collectionType: "custom", creationMode: "manual" });
  assert.equal(result.created, false);
  assert.ok(result.errors.name);
});

test("create: valida dimensões de grade (1-10 em cada eixo)", async () => {
  const repo = await setup();
  const result = await repo.create({ name: "X", collectionType: "custom", creationMode: "manual", columnsPerPage: 0, rowsPerPage: 3 });
  assert.equal(result.created, false);
  assert.ok(result.errors.grid);
});

test("create: remove espaços nas pontas do nome antes de salvar", async () => {
  const repo = await setup();
  const result = await repo.create({ name: "  Com espaços  ", collectionType: "custom", creationMode: "manual" });
  assert.equal(result.collection.name, "Com espaços");
});

test("fichários com o mesmo nome continuam entidades independentes (sem unicidade global)", async () => {
  const repo = await setup();
  const a = await repo.create({ name: "151", collectionType: "expansion", creationMode: "automatic" });
  const b = await repo.create({ name: "151", collectionType: "expansion", creationMode: "automatic" });
  assert.notEqual(a.collection.id, b.collection.id);
  const list = await repo.list();
  assert.equal(list.length, 2);
});

test("update: edita nome/configurações, mas NUNCA o tipo/fonte base (campo ignorado silenciosamente)", async () => {
  const repo = await setup();
  const created = await repo.create({ name: "Original", collectionType: "expansion", creationMode: "automatic", sourceSetId: "sv03.5" });
  const result = await repo.update(created.collection.id, { name: "Renomeado", collectionType: "custom", sourceSetId: "outro-set" });
  assert.equal(result.updated, true);
  assert.equal(result.collection.name, "Renomeado");
  assert.equal(result.collection.collectionType, "expansion", "collectionType não deveria mudar via update()");
  assert.equal(result.collection.sourceSetId, "sv03.5", "sourceSetId não deveria mudar via update()");
});

test("archive/restore: arquivar some da lista ativa, mas restaura normalmente", async () => {
  const repo = await setup();
  const created = await repo.create({ name: "X", collectionType: "custom", creationMode: "manual" });
  await repo.archive(created.collection.id);
  const activeOnly = await repo.list({ includeArchived: false });
  assert.equal(activeOnly.length, 0);
  const withArchived = await repo.list({ includeArchived: true });
  assert.equal(withArchived.length, 1);

  await repo.restore(created.collection.id);
  const afterRestore = await repo.list({ includeArchived: false });
  assert.equal(afterRestore.length, 1);
});

test("deleteSafely: NUNCA apaga cópias físicas — move para Sem fichário e limpa posição/checklist", async () => {
  const db = await createMigratedTestDb();
  const repo = new CollectionRepository(db);
  const created = await repo.create({ name: "Fichário", collectionType: "custom", creationMode: "manual" });
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO owned_card_copies (id, catalog_card_key, source_language, source_card_id, collection_id, page_number, slot_index, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ["copy1", "key-1", "pt", "src-1", created.collection.id, 1, 1, now, now]
  );

  const preview = await repo.previewDelete(created.collection.id);
  assert.equal(preview.affectedCopiesCount, 1);

  await repo.deleteSafely(created.collection.id);

  const copyRow = await db.getFirstAsync(`SELECT * FROM owned_card_copies WHERE id = 'copy1'`);
  assert.equal(copyRow.deleted_at, null, "a cópia continua existindo (não foi apagada)");
  assert.equal(copyRow.collection_id, null, "cópia deveria virar Sem fichário");
  assert.equal(copyRow.page_number, null);

  const collectionRow = await db.getFirstAsync(`SELECT deleted_at FROM user_collections WHERE id = ?`, [created.collection.id]);
  assert.ok(collectionRow.deleted_at, "fichário deveria estar marcado como excluído");

  const stillInList = await repo.getById(created.collection.id);
  assert.equal(stillInList, null);
});

test("previewGridResize: aponta cópias que ficariam fora da nova capacidade, sem alterar nada", async () => {
  const db = await createMigratedTestDb();
  const repo = new CollectionRepository(db);
  const created = await repo.create({ name: "Fichário", collectionType: "custom", creationMode: "manual", columnsPerPage: 3, rowsPerPage: 3 });
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO owned_card_copies (id, catalog_card_key, source_language, source_card_id, collection_id, page_number, slot_index, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ["copy1", "key-1", "pt", "src-1", created.collection.id, 1, 9, now, now]
  );
  const preview = await repo.previewGridResize(created.collection.id, 2, 2);
  assert.equal(preview.safe, false);
  assert.equal(preview.affectedCopies.length, 1);

  const stillAt9 = await db.getFirstAsync(`SELECT slot_index FROM owned_card_copies WHERE id = 'copy1'`);
  assert.equal(stillAt9.slot_index, 9, "prévia nunca aplica a mudança sozinha");
});
