/**
 * ChecklistRepository — itens de checklist de um fichário (especificação da
 * Entrega 2, seção 4.4). Mesma convenção das outras: `db` injetável no
 * construtor (testes Node) ou aberto de verdade via src/storage/userDb.js.
 */
const { generateId } = require("../domain/generateId");
const { mapChecklistItemRow } = require("../storage/userRowMapping");
const { findDuplicateTarget, previewChecklistRegeneration } = require("../domain/checklistGeneration");

function itemColumns() {
  return [
    "id",
    "collection_id",
    "target_type",
    "national_dex_number",
    "catalog_card_key",
    "target_label_snapshot",
    "target_set_snapshot",
    "target_number_snapshot",
    "target_language_snapshot",
    "sort_order",
    "required_quantity",
    "source",
    "is_excluded",
    "created_at",
    "updated_at",
  ];
}

function specToRow(spec, { id, collectionId, sortOrder, now }) {
  return [
    id,
    collectionId,
    spec.targetType,
    spec.nationalDexNumber ?? null,
    spec.catalogCardKey ?? null,
    spec.targetLabelSnapshot ?? null,
    spec.targetSetSnapshot ?? null,
    spec.targetNumberSnapshot ?? null,
    spec.targetLanguageSnapshot ?? null,
    sortOrder,
    spec.requiredQuantity ?? 1,
    spec.source ?? "automatic",
    0,
    now,
    now,
  ];
}

class ChecklistRepository {
  constructor(db = null) {
    this._db = db;
  }

  async _getDb() {
    if (!this._db) this._db = await require("../storage/userDb").getUserDb();
    return this._db;
  }

  async listItems(collectionId, { includeExcluded = false } = {}) {
    const db = await this._getDb();
    const sql = includeExcluded
      ? `SELECT * FROM checklist_items WHERE collection_id = ? ORDER BY sort_order ASC`
      : `SELECT * FROM checklist_items WHERE collection_id = ? AND is_excluded = 0 ORDER BY sort_order ASC`;
    const rows = await db.getAllAsync(sql, [collectionId]);
    return rows.map(mapChecklistItemRow);
  }

  /** Inserção em lote da checklist gerada (especificação, seção 8.3, passo 7) — tudo em UMA transação. */
  async generateAutomatic(collectionId, itemSpecs) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    const columns = itemColumns();
    const placeholders = columns.map(() => "?").join(", ");
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < itemSpecs.length; i++) {
        const id = generateId();
        const row = specToRow(itemSpecs[i], { id, collectionId, sortOrder: i + 1, now });
        await db.runAsync(`INSERT INTO checklist_items (${columns.join(", ")}) VALUES (${placeholders})`, row);
      }
    });
    return this.listItems(collectionId, { includeExcluded: true });
  }

  /**
   * Adiciona um item manual (especificação, seção 5.2/4.2): se já existir um
   * item ATIVO para o mesmo alvo, não duplica silenciosamente — devolve o
   * item existente para a UI pedir confirmação ao usuário.
   */
  async addManualItem(collectionId, itemSpec) {
    const existing = await this.listItems(collectionId, { includeExcluded: true });
    const duplicate = findDuplicateTarget(existing, itemSpec);
    if (duplicate) return { added: false, duplicate };

    const db = await this._getDb();
    const now = new Date().toISOString();
    const maxOrderRow = await db.getFirstAsync(`SELECT MAX(sort_order) AS m FROM checklist_items WHERE collection_id = ?`, [
      collectionId,
    ]);
    const nextOrder = (maxOrderRow && maxOrderRow.m ? maxOrderRow.m : 0) + 1;
    const id = generateId();
    const columns = itemColumns();
    const placeholders = columns.map(() => "?").join(", ");
    const row = specToRow({ ...itemSpec, source: "manual_added" }, { id, collectionId, sortOrder: nextOrder, now });
    await db.runAsync(`INSERT INTO checklist_items (${columns.join(", ")}) VALUES (${placeholders})`, row);
    const created = await db.getFirstAsync(`SELECT * FROM checklist_items WHERE id = ?`, [id]);
    return { added: true, item: mapChecklistItemRow(created) };
  }

  /**
   * Marca um item como excluído (nunca apaga a linha — preserva a exclusão
   * para a regeneração futura não reinstalar sozinha, especificação, seção
   * 5.2) e desvincula cópias que apontavam para ele (viram extras sem alvo).
   */
  async removeItem(itemId) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(`UPDATE checklist_items SET is_excluded = 1, updated_at = ? WHERE id = ?`, [now, itemId]);
      await db.runAsync(`UPDATE owned_card_copies SET checklist_item_id = NULL, updated_at = ? WHERE checklist_item_id = ?`, [
        now,
        itemId,
      ]);
    });
    return { removed: true };
  }

  /** Reordena (especificação, seção 4.4: "reorderItems") — sort_order estável e explícito. */
  async reorderItems(collectionId, orderedItemIds) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < orderedItemIds.length; i++) {
        await db.runAsync(`UPDATE checklist_items SET sort_order = ?, updated_at = ? WHERE id = ? AND collection_id = ?`, [
          i + 1,
          now,
          orderedItemIds[i],
          collectionId,
        ]);
      }
    });
    return this.listItems(collectionId, { includeExcluded: true });
  }

  /** Prévia pura de regeneração (especificação, seção 5.2) — não aplica nada sozinha. */
  async previewRegeneration(collectionId, freshItemSpecs) {
    const existing = await this.listItems(collectionId, { includeExcluded: true });
    return previewChecklistRegeneration(existing, freshItemSpecs);
  }

  /** Aplica uma regeneração já confirmada pelo usuário na UI (a partir do resultado de previewRegeneration). */
  async applyRegeneration(collectionId, { toAdd, toRemove }) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      const maxOrderRow = await db.getFirstAsync(`SELECT MAX(sort_order) AS m FROM checklist_items WHERE collection_id = ?`, [
        collectionId,
      ]);
      let nextOrder = (maxOrderRow && maxOrderRow.m ? maxOrderRow.m : 0) + 1;
      const columns = itemColumns();
      const placeholders = columns.map(() => "?").join(", ");
      for (const spec of toAdd) {
        const id = generateId();
        const row = specToRow(spec, { id, collectionId, sortOrder: nextOrder++, now });
        await db.runAsync(`INSERT INTO checklist_items (${columns.join(", ")}) VALUES (${placeholders})`, row);
      }
      for (const item of toRemove) {
        await db.runAsync(`UPDATE checklist_items SET is_excluded = 1, updated_at = ? WHERE id = ?`, [now, item.id]);
        await db.runAsync(`UPDATE owned_card_copies SET checklist_item_id = NULL, updated_at = ? WHERE checklist_item_id = ?`, [
          now,
          item.id,
        ]);
      }
    });
    return this.listItems(collectionId, { includeExcluded: true });
  }
}

module.exports = { ChecklistRepository };
