/**
 * CollectionRepository — CRUD de fichários (especificação da Entrega 2,
 * seção 4.4). `require("../storage/userDb")` é LAZY (só dentro de
 * `_getDb()`), mesma convenção de src/catalog/catalogRepository.js: o resto
 * da classe recebe `db` já aberto e é testável em Node puro com o adaptador
 * de scripts/testHelpers/sqliteTestAdapter.js (sem precisar de expo-sqlite).
 *
 * Decisão deliberada (especificação, seção 5.3): `update()` só altera os
 * campos seguros (nome, descrição, organização, ordenação, grade) — nunca
 * `collectionType`/`creationMode`/`sourceSetId`/`sourceLanguage`/
 * `checklistScope` de uma coleção já criada, para não trocar silenciosamente
 * o tipo/fonte base de um fichário já populado.
 */
const { generateId } = require("../domain/generateId");
const { validateCollectionInput } = require("../domain/collectionValidation");
const { previewGridResizeImpact } = require("../domain/gridLayout");
const { mapCollectionRow } = require("../storage/userRowMapping");

const SAFE_UPDATE_FIELDS = {
  name: "name",
  description: "description",
  organizationMode: "organization_mode",
  columnsPerPage: "columns_per_page",
  rowsPerPage: "rows_per_page",
  sortMode: "sort_mode",
};

class CollectionRepository {
  constructor(db = null) {
    this._db = db;
  }

  async _getDb() {
    if (!this._db) this._db = await require("../storage/userDb").getUserDb();
    return this._db;
  }

  async list({ includeArchived = true } = {}) {
    const db = await this._getDb();
    const sql = includeArchived
      ? `SELECT * FROM user_collections WHERE deleted_at IS NULL ORDER BY created_at DESC`
      : `SELECT * FROM user_collections WHERE deleted_at IS NULL AND is_archived = 0 ORDER BY created_at DESC`;
    const rows = await db.getAllAsync(sql);
    return rows.map(mapCollectionRow);
  }

  async getById(id) {
    const db = await this._getDb();
    const row = await db.getFirstAsync(`SELECT * FROM user_collections WHERE id = ? AND deleted_at IS NULL`, [id]);
    return mapCollectionRow(row);
  }

  /**
   * @param {object} input ver schema completo em src/storage/userMigrations.js
   * @returns {{ created: boolean, errors?: object, collection?: object }}
   */
  async create(input) {
    const { valid, errors, trimmedName } = validateCollectionInput(input);
    if (!valid) return { created: false, errors };

    const db = await this._getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const columnsPerPage = input.columnsPerPage ?? 3;
    const rowsPerPage = input.rowsPerPage ?? 3;

    await db.runAsync(
      `INSERT INTO user_collections
        (id, name, description, collection_type, creation_mode, source_set_id, source_language,
         language_policy, checklist_scope, organization_mode, columns_per_page, rows_per_page,
         sort_mode, is_archived, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        id,
        trimmedName,
        input.description ?? null,
        input.collectionType,
        input.creationMode,
        input.sourceSetId ?? null,
        input.sourceLanguage ?? null,
        input.languagePolicy ?? null,
        input.checklistScope ?? null,
        input.organizationMode ?? "automatic",
        columnsPerPage,
        rowsPerPage,
        input.sortMode ?? "national_dex",
        now,
        now,
      ]
    );

    return { created: true, collection: await this.getById(id) };
  }

  async update(id, patch) {
    const fieldsToUpdate = Object.keys(patch).filter((k) => SAFE_UPDATE_FIELDS[k] !== undefined);
    if (fieldsToUpdate.length === 0) return this.getById(id);

    if (patch.name !== undefined || patch.columnsPerPage !== undefined || patch.rowsPerPage !== undefined) {
      const { valid, errors } = validateCollectionInput({
        name: patch.name ?? "placeholder-mantido", // só valida grade/nome quando fornecidos
        columnsPerPage: patch.columnsPerPage,
        rowsPerPage: patch.rowsPerPage,
      });
      if (!valid && (errors.name || errors.grid)) return { updated: false, errors };
    }

    const db = await this._getDb();
    const now = new Date().toISOString();
    const setClauses = fieldsToUpdate.map((k) => `${SAFE_UPDATE_FIELDS[k]} = ?`);
    const values = fieldsToUpdate.map((k) => (k === "name" ? String(patch[k]).trim() : patch[k]));
    await db.runAsync(`UPDATE user_collections SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?`, [
      ...values,
      now,
      id,
    ]);
    return { updated: true, collection: await this.getById(id) };
  }

  /** Prévia do impacto de mudar a grade (especificação, seção 7.3) — nunca aplica sozinha. */
  async previewGridResize(id, newColumns, newRows) {
    const db = await this._getDb();
    const rows = await db.getAllAsync(
      `SELECT page_number, slot_index FROM owned_card_copies WHERE collection_id = ? AND deleted_at IS NULL AND page_number IS NOT NULL`,
      [id]
    );
    const copies = rows.map((r) => ({ pageNumber: r.page_number, slotIndex: r.slot_index }));
    return previewGridResizeImpact(copies, newColumns, newRows);
  }

  async archive(id) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE user_collections SET is_archived = 1, updated_at = ? WHERE id = ?`, [now, id]);
    return this.getById(id);
  }

  async restore(id) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE user_collections SET is_archived = 0, updated_at = ? WHERE id = ?`, [now, id]);
    return this.getById(id);
  }

  /** Resumo do efeito de uma exclusão definitiva, para confirmação explícita na UI (especificação, seção 5.3). */
  async previewDelete(id) {
    const db = await this._getDb();
    const row = await db.getFirstAsync(
      `SELECT COUNT(*) AS c FROM owned_card_copies WHERE collection_id = ? AND deleted_at IS NULL`,
      [id]
    );
    return { affectedCopiesCount: row ? row.c : 0 };
  }

  /**
   * Exclusão definitiva (especificação, seção 5.3): NUNCA apaga cópias
   * físicas — move-as para "Sem fichário" (collection_id/posição/checklist
   * NULL), remove os itens de checklist (pertencem só a este fichário) e só
   * então marca o fichário como excluído. Tudo em UMA transação.
   */
  async deleteSafely(id) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE owned_card_copies
           SET collection_id = NULL, page_number = NULL, slot_index = NULL, checklist_item_id = NULL, updated_at = ?
         WHERE collection_id = ? AND deleted_at IS NULL`,
        [now, id]
      );
      await db.runAsync(`DELETE FROM checklist_items WHERE collection_id = ?`, [id]);
      await db.runAsync(`UPDATE user_collections SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
    });
    return { deleted: true };
  }
}

module.exports = { CollectionRepository };
