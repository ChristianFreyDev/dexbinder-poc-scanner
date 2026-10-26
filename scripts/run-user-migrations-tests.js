/**
 * Testes reais (node:test) de src/storage/userMigrations.js contra SQLite de
 * verdade em memória (não um mock) — especificação da Entrega 2, seção 12.1.
 * Executar: node --test scripts/run-user-migrations-tests.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { createTestDb } = require("./testHelpers/sqliteTestAdapter");
const { runMigrations, getAppliedVersion, MIGRATIONS } = require("../src/storage/userMigrations");

test("banco novo: aplica todas as migrações e cria as tabelas esperadas", async () => {
  const db = createTestDb();
  const result = await runMigrations(db);
  assert.equal(result.appliedFrom, 0);
  assert.equal(result.appliedTo, MIGRATIONS[MIGRATIONS.length - 1].version);

  const tables = (await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table'`)).map((r) => r.name);
  for (const t of ["user_collections", "checklist_items", "owned_card_copies", "card_species_links", "schema_migrations"]) {
    assert.ok(tables.includes(t), `tabela ${t} deveria existir`);
  }
});

test("reabrir (rodar de novo) não duplica migrações nem apaga dados existentes", async () => {
  const db = createTestDb();
  await runMigrations(db);

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_collections (id, name, collection_type, creation_mode, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ["c1", "Minha Pokédex", "pokedex", "automatic", now, now]
  );

  const second = await runMigrations(db);
  assert.equal(second.appliedFrom, MIGRATIONS[MIGRATIONS.length - 1].version);
  assert.equal(second.appliedTo, MIGRATIONS[MIGRATIONS.length - 1].version);

  const row = await db.getFirstAsync(`SELECT * FROM user_collections WHERE id = ?`, ["c1"]);
  assert.ok(row, "a coleção criada antes da 2ª chamada deveria continuar existindo");

  const migrationRows = await db.getAllAsync(`SELECT version FROM schema_migrations`);
  assert.equal(migrationRows.length, MIGRATIONS.length, "não deve duplicar o registro de versão aplicada");
});

test("getAppliedVersion retorna 0 num banco nunca migrado", async () => {
  const db = createTestDb();
  const version = await getAppliedVersion(db);
  assert.equal(version, 0);
});

test("constraint real: não permite duas cópias ATIVAS no mesmo bolso do mesmo fichário", async () => {
  const db = createTestDb();
  await runMigrations(db);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_collections (id, name, collection_type, creation_mode, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ["c1", "Fichário", "custom", "manual", now, now]
  );
  const insertCopy = (id) =>
    db.runAsync(
      `INSERT INTO owned_card_copies
        (id, catalog_card_key, source_language, source_card_id, collection_id, page_number, slot_index, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, `key-${id}`, "pt", `src-${id}`, "c1", 1, 1, now, now]
    );
  await insertCopy("copy1");
  await assert.rejects(() => insertCopy("copy2"), /UNIQUE constraint failed/);
});

test("constraint real: a mesma impressão SEM fichário (collection_id NULL) não conflita com a restrição de bolso", async () => {
  const db = createTestDb();
  await runMigrations(db);
  const now = new Date().toISOString();
  const insertUnassigned = (id) =>
    db.runAsync(
      `INSERT INTO owned_card_copies (id, catalog_card_key, source_language, source_card_id, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
      [id, "key-x", "pt", "src-x", now, now]
    );
  await insertUnassigned("copyA");
  await insertUnassigned("copyB");
  const rows = await db.getAllAsync(`SELECT * FROM owned_card_copies WHERE catalog_card_key = 'key-x'`);
  assert.equal(rows.length, 2, "duas cópias sem fichário da mesma impressão são permitidas (índice parcial não se aplica)");
});

test("constraint real: não permite item de checklist de espécie duplicado ativo na mesma coleção", async () => {
  const db = createTestDb();
  await runMigrations(db);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_collections (id, name, collection_type, creation_mode, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ["c1", "Pokédex", "pokedex", "automatic", now, now]
  );
  const insertItem = (id) =>
    db.runAsync(
      `INSERT INTO checklist_items (id, collection_id, target_type, national_dex_number, sort_order, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, "c1", "pokemon_species", 1, 1, "automatic", now, now]
    );
  await insertItem("item1");
  await assert.rejects(() => insertItem("item2"), /UNIQUE constraint failed/);
});

test("migração v2: constraint real para item any_supported (catalog_card_key NULL, identidade por set+número)", async () => {
  const db = createTestDb();
  await runMigrations(db);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO user_collections (id, name, collection_type, creation_mode, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
    ["c1", "Expansão", "expansion", "automatic", now, now]
  );
  const insertAnyLangItem = (id) =>
    db.runAsync(
      `INSERT INTO checklist_items
        (id, collection_id, target_type, target_set_snapshot, target_number_snapshot, sort_order, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, "c1", "catalog_card", "sv03.5", "001", 1, "automatic", now, now]
    );
  await insertAnyLangItem("itemA");
  await assert.rejects(() => insertAnyLangItem("itemB"), /UNIQUE constraint failed/);
});
