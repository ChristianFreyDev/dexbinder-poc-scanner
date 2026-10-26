/**
 * Migrações versionadas do banco de dados PESSOAL (especificação da Entrega
 * 2, seção 4.1): um arquivo SQLite separado do catálogo público somente-
 * leitura (`dexbinder_catalog.db`, ver catalogSync.js) — nunca grava nada
 * nele. Lógica pura de execução de DDL (sem abrir conexão sozinha: recebe um
 * `db` já aberto, mesma convenção de catalogIndex.js) para ser testável em
 * Node com o mesmo adaptador usado em scripts/run-catalog-index-query-tests.js.
 *
 * Cada migração é um array de statements DDL aplicados dentro de UMA
 * transação (especificação, seção 12.1: "reabrir app não duplica migrations
 * nem recria/apaga dados" e "migração falha de modo seguro"). A tabela
 * `schema_migrations` guarda a versão mais alta já aplicada; `runMigrations`
 * só aplica as versões ainda não registradas, em ordem, e é idempotente.
 *
 * Decisões de schema (adaptadas da especificação, seção 4.2, aos nomes já
 * usados no projeto):
 * - IDs são UUID (texto) — ver src/domain/generateId.js.
 * - `catalog_card_key` é gerada por src/domain/catalogCardKey.js (nunca
 *   `variantId` do TCGdex, nunca só `source_card_id`) e NUNCA é uma FK SQL
 *   para o banco de catálogo (arquivos separados, catálogo é substituído
 *   inteiro a cada sincronização — especificação, seção 4.3).
 * - `created_at`/`updated_at` em UTC ISO-8601 (especificação, seção 4.1).
 * - Índices parciais (`WHERE ...`) implementam as restrições físicas reais:
 *   um bolso (collection_id, page_number, slot_index) só pode ter UMA cópia
 *   ativa; um item de checklist ativo não pode ser duplicado por alvo.
 */

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS user_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        collection_type TEXT NOT NULL CHECK (collection_type IN ('pokedex','expansion','custom')),
        creation_mode TEXT NOT NULL CHECK (creation_mode IN ('automatic','manual')),
        source_set_id TEXT,
        source_language TEXT,
        language_policy TEXT CHECK (language_policy IN ('specific','any_supported')),
        checklist_scope TEXT CHECK (checklist_scope IN ('official','complete_catalog','manual')),
        organization_mode TEXT NOT NULL DEFAULT 'automatic' CHECK (organization_mode IN ('automatic','manual')),
        columns_per_page INTEGER NOT NULL DEFAULT 3,
        rows_per_page INTEGER NOT NULL DEFAULT 3,
        sort_mode TEXT NOT NULL DEFAULT 'national_dex',
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS checklist_items (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL REFERENCES user_collections(id),
        target_type TEXT NOT NULL CHECK (target_type IN ('pokemon_species','catalog_card','custom')),
        national_dex_number INTEGER,
        catalog_card_key TEXT,
        target_label_snapshot TEXT,
        target_set_snapshot TEXT,
        target_number_snapshot TEXT,
        target_language_snapshot TEXT,
        sort_order INTEGER NOT NULL,
        required_quantity INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL CHECK (source IN ('automatic','manual_added','custom')),
        is_excluded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_checklist_items_collection ON checklist_items(collection_id)`,
      // Um item de espécie ativo não pode ser duplicado na mesma checklist.
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_species_active
        ON checklist_items(collection_id, national_dex_number)
        WHERE target_type = 'pokemon_species' AND is_excluded = 0`,
      // Um item de impressão ativo não pode ser duplicado na mesma checklist.
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_card_active
        ON checklist_items(collection_id, catalog_card_key)
        WHERE target_type = 'catalog_card' AND is_excluded = 0`,

      `CREATE TABLE IF NOT EXISTS owned_card_copies (
        id TEXT PRIMARY KEY,
        catalog_card_key TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'tcgdex',
        source_language TEXT NOT NULL,
        source_card_id TEXT NOT NULL,
        source_set_id TEXT,
        local_id TEXT,
        card_name_snapshot TEXT,
        set_name_snapshot TEXT,
        image_base_url_snapshot TEXT,
        collection_id TEXT REFERENCES user_collections(id),
        page_number INTEGER,
        slot_index INTEGER,
        checklist_item_id TEXT REFERENCES checklist_items(id),
        finish_variant TEXT CHECK (finish_variant IN ('normal','holo','reverse_holo','other','unknown')),
        condition_code TEXT,
        acquired_at TEXT,
        purchase_price REAL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_owned_copies_collection ON owned_card_copies(collection_id)`,
      `CREATE INDEX IF NOT EXISTS idx_owned_copies_card_key ON owned_card_copies(catalog_card_key)`,
      // Nunca duas cópias ATIVAS no mesmo bolso do mesmo fichário (especificação, seção 4.2: "índice único parcial").
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_owned_copies_slot
        ON owned_card_copies(collection_id, page_number, slot_index)
        WHERE collection_id IS NOT NULL AND page_number IS NOT NULL AND slot_index IS NOT NULL AND deleted_at IS NULL`,

      `CREATE TABLE IF NOT EXISTS card_species_links (
        catalog_card_key TEXT NOT NULL,
        national_dex_number INTEGER NOT NULL,
        association_status TEXT NOT NULL CHECK (association_status IN ('suggested','confirmed')),
        association_source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (catalog_card_key, national_dex_number)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_species_links_dex ON card_species_links(national_dex_number)`,
    ],
  },
  {
    // language_policy "any_supported" (especificação, seção 6.3): um item de
    // checklist pode representar a MESMA posição impressa (set real + número
    // real, já validados por virem do mesmo set_id) em qualquer idioma
    // sincronizado, em vez de uma única catalog_card_key. Nesse caso
    // catalog_card_key fica NULL e a identidade do item é (target_set_snapshot,
    // target_number_snapshot) — índice parcial separado, pois o índice da v1
    // (uq_checklist_card_active) exige catalog_card_key não-nulo.
    version: 2,
    statements: [
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_card_any_lang_active
        ON checklist_items(collection_id, target_set_snapshot, target_number_snapshot)
        WHERE target_type = 'catalog_card' AND is_excluded = 0 AND catalog_card_key IS NULL`,
    ],
  },
];

/** Versão mais alta já aplicada neste banco, ou 0 se nunca migrado (tabela ainda não existe). */
async function getAppliedVersion(db) {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const row = await db.getFirstAsync(`SELECT MAX(version) AS v FROM schema_migrations`);
  return row && row.v != null ? row.v : 0;
}

/**
 * Aplica, em ordem, toda migração com versão > applied. Cada migração roda
 * dentro de UMA transação (rollback real se qualquer statement falhar —
 * especificação, seção 12.1: "migração falha de modo seguro e preserva o
 * banco válido anterior"). Idempotente: rodar de novo não reaplica versões
 * já registradas em `schema_migrations`.
 */
async function runMigrations(db) {
  const applied = await getAppliedVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > applied).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.runAsync(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [
        migration.version,
        new Date().toISOString(),
      ]);
    });
  }

  return { appliedFrom: applied, appliedTo: pending.length > 0 ? pending[pending.length - 1].version : applied };
}

module.exports = { MIGRATIONS, getAppliedVersion, runMigrations };
