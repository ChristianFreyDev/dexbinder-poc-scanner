/**
 * Abre o banco de dados PESSOAL (expo-sqlite), separado do catálogo público
 * somente-leitura (especificação da Entrega 2, seção 4.1: "o banco privado
 * do usuário deverá ser separado do banco de catálogo público"). Mesmo
 * padrão de catalogSync.js: `openDatabaseAsync` sem `directory` explícito usa
 * `defaultDatabaseDirectory` do expo-sqlite — arquivo próprio
 * (`dexbinder_user.db`), nunca o mesmo arquivo de `dexbinder_catalog.db`.
 *
 * `require("expo-sqlite")` é LAZY (só dentro da função, não no topo do
 * módulo) pelo mesmo motivo documentado em catalogIndex.js/catalogSync.js:
 * não roda em Node puro. Os repositórios usam `getUserDb()` (cacheado, uma
 * única conexão + migrações rodadas uma vez por processo) em vez de abrir o
 * banco cada um por conta própria.
 */

const LOCAL_USER_DB_NAME = "dexbinder_user.db";

let cachedDbPromise = null;

async function openAndMigrate() {
  const { openDatabaseAsync } = require("expo-sqlite");
  const { runMigrations } = require("./userMigrations");
  const db = await openDatabaseAsync(LOCAL_USER_DB_NAME);
  await runMigrations(db);
  return db;
}

/** Conexão única, cacheada por processo — reaberta só se closeUserDb() for chamado antes. */
function getUserDb() {
  if (!cachedDbPromise) cachedDbPromise = openAndMigrate();
  return cachedDbPromise;
}

/** Uso em testes/depuração: força reabrir e reaplicar migrações na próxima chamada a getUserDb(). */
async function closeUserDb() {
  if (!cachedDbPromise) return;
  const db = await cachedDbPromise;
  cachedDbPromise = null;
  try {
    await db.closeAsync();
  } catch {
    // já fechado — nada a fazer
  }
}

module.exports = { getUserDb, closeUserDb, LOCAL_USER_DB_NAME };
