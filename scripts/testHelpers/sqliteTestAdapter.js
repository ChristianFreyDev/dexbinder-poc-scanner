/**
 * Adaptador fino sobre better-sqlite3 que expõe a MESMA interface assíncrona
 * usada pelo expo-sqlite real (confirmada em
 * node_modules/expo-sqlite/build/SQLiteDatabase.d.ts): `execAsync`,
 * `runAsync`, `getAllAsync`, `getFirstAsync`, `withTransactionAsync`. Mesma
 * ideia já usada em scripts/run-catalog-index-query-tests.js (que só
 * precisava de getAllAsync/getFirstAsync) — extraído e ampliado aqui porque
 * os repositórios da Entrega 2 também precisam escrever e usar transações.
 *
 * `withTransactionAsync` usa BEGIN/COMMIT/ROLLBACK reais (não o wrapper
 * síncrono `.transaction()` do better-sqlite3, que não aceita uma `task`
 * assíncrona) — suficiente para testar rollback real em falha, que é o que
 * a especificação exige (seção 12.1).
 */
const Database = require("better-sqlite3");

function wrapDb(rawDb) {
  return {
    raw: rawDb,
    execAsync: async (source) => {
      rawDb.exec(source);
    },
    runAsync: async (source, params = []) => {
      const info = rawDb.prepare(source).run(...params);
      return { lastInsertRowId: info.lastInsertRowid, changes: info.changes };
    },
    getFirstAsync: async (source, params = []) => rawDb.prepare(source).get(...params) ?? null,
    getAllAsync: async (source, params = []) => rawDb.prepare(source).all(...params),
    withTransactionAsync: async (task) => {
      rawDb.exec("BEGIN");
      try {
        await task();
        rawDb.exec("COMMIT");
      } catch (err) {
        rawDb.exec("ROLLBACK");
        throw err;
      }
    },
    closeAsync: async () => rawDb.close(),
  };
}

/** Novo banco SQLite em memória, já envolvido pelo adaptador acima. */
function createTestDb() {
  return wrapDb(new Database(":memory:"));
}

module.exports = { wrapDb, createTestDb };
