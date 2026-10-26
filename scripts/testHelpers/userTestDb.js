/**
 * Banco de teste em memória JÁ MIGRADO (schema pessoal completo) — usado por
 * todos os testes de repositório da Entrega 2, para não repetir
 * createTestDb()+runMigrations() em cada arquivo.
 */
const { createTestDb } = require("./sqliteTestAdapter");
const { runMigrations } = require("../../src/storage/userMigrations");

async function createMigratedTestDb() {
  const db = createTestDb();
  await runMigrations(db);
  return db;
}

module.exports = { createMigratedTestDb };
