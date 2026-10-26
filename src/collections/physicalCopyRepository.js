/**
 * PhysicalCopyRepository — cópias físicas individuais (especificação da
 * Entrega 2, seções 3.2, 4.2, 7, 12.4): cada cópia é um registro próprio,
 * pertence a no máximo um fichário/bolso por vez. Mesma convenção das outras
 * (db injetável no construtor para testes Node).
 */
const { generateId } = require("../domain/generateId");
const { mapOwnedCopyRow } = require("../storage/userRowMapping");
const { calculateInventoryTotals } = require("../domain/progressCalculations");

class PhysicalCopyRepository {
  constructor(db = null) {
    this._db = db;
  }

  async _getDb() {
    if (!this._db) this._db = await require("../storage/userDb").getUserDb();
    return this._db;
  }

  /**
   * @param {{ collectionId?: string|null, unassignedOnly?: boolean, catalogCardKey?: string }} filters
   *   `collectionId` omitido = todas as cópias ativas (inventário inteiro);
   *   `unassignedOnly: true` = só collection_id IS NULL, independente de `collectionId`.
   */
  async list({ collectionId, unassignedOnly = false, catalogCardKey } = {}) {
    const db = await this._getDb();
    const conditions = ["deleted_at IS NULL"];
    const params = [];
    if (unassignedOnly) {
      conditions.push("collection_id IS NULL");
    } else if (collectionId !== undefined) {
      if (collectionId === null) conditions.push("collection_id IS NULL");
      else {
        conditions.push("collection_id = ?");
        params.push(collectionId);
      }
    }
    if (catalogCardKey) {
      conditions.push("catalog_card_key = ?");
      params.push(catalogCardKey);
    }
    const rows = await db.getAllAsync(`SELECT * FROM owned_card_copies WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC`, params);
    return rows.map(mapOwnedCopyRow);
  }

  async getById(id) {
    const db = await this._getDb();
    const row = await db.getFirstAsync(`SELECT * FROM owned_card_copies WHERE id = ? AND deleted_at IS NULL`, [id]);
    return mapOwnedCopyRow(row);
  }

  /**
   * Cria N cópias distintas (especificação, seção 3.2/8.8: "cada inclusão em
   * lote de N unidades cria N IDs distintos"). Nunca atribui página/bolso
   * aqui — toda cópia nasce "aguardando organização" (quando tem fichário)
   * ou "sem fichário" (quando não tem); posicionar é uma ação separada
   * (moveCopy), em transação própria.
   */
  async addCopies(input) {
    const quantity = Number.isInteger(input.quantity) && input.quantity > 0 ? input.quantity : 1;
    const db = await this._getDb();
    const now = new Date().toISOString();
    const ids = [];
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < quantity; i++) {
        const id = generateId();
        ids.push(id);
        await db.runAsync(
          `INSERT INTO owned_card_copies
            (id, catalog_card_key, provider, source_language, source_card_id, source_set_id, local_id,
             card_name_snapshot, set_name_snapshot, image_base_url_snapshot, collection_id,
             checklist_item_id, finish_variant, condition_code, acquired_at, purchase_price, notes,
             created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            input.catalogCardKey,
            input.provider ?? "tcgdex",
            input.sourceLanguage,
            input.sourceCardId,
            input.sourceSetId ?? null,
            input.localId != null ? String(input.localId) : null,
            input.cardNameSnapshot ?? null,
            input.setNameSnapshot ?? null,
            input.imageBaseUrlSnapshot ?? null,
            input.collectionId ?? null,
            input.checklistItemId ?? null,
            input.finishVariant ?? null,
            input.conditionCode ?? null,
            input.acquiredAt ?? null,
            input.purchasePrice ?? null,
            input.notes ?? null,
            now,
            now,
          ]
        );
      }
    });
    const created = [];
    for (const id of ids) created.push(await this.getById(id));
    return created;
  }

  /** Campos editáveis de metadados — nunca identidade/posição (ver moveCopy/transferCopy). */
  async updateCopy(id, patch) {
    const editable = {
      finishVariant: "finish_variant",
      conditionCode: "condition_code",
      acquiredAt: "acquired_at",
      purchasePrice: "purchase_price",
      notes: "notes",
      checklistItemId: "checklist_item_id",
    };
    const fields = Object.keys(patch).filter((k) => editable[k] !== undefined);
    if (fields.length === 0) return this.getById(id);
    const db = await this._getDb();
    const now = new Date().toISOString();
    const setClauses = fields.map((k) => `${editable[k]} = ?`);
    const values = fields.map((k) => patch[k]);
    await db.runAsync(`UPDATE owned_card_copies SET ${setClauses.join(", ")}, updated_at = ? WHERE id = ?`, [...values, now, id]);
    return this.getById(id);
  }

  async _checkSlotOccupant(db, { collectionId, pageNumber, slotIndex, excludeId }) {
    if (collectionId == null || pageNumber == null || slotIndex == null) return null;
    return db.getFirstAsync(
      `SELECT id FROM owned_card_copies
         WHERE collection_id = ? AND page_number = ? AND slot_index = ? AND deleted_at IS NULL AND id != ?`,
      [collectionId, pageNumber, slotIndex, excludeId ?? ""]
    );
  }

  /**
   * Move uma cópia para outra página/bolso DENTRO do mesmo fichário (ou para
   * "aguardando organização" se pageNumber/slotIndex vierem nulos). Nunca
   * sobrescreve outra cópia — se o bolso já estiver ocupado, devolve
   * conflict:true sem aplicar nada (especificação, seção 7.4).
   */
  async moveCopy(id, { pageNumber = null, slotIndex = null }) {
    const copy = await this.getById(id);
    if (!copy) throw new Error(`PhysicalCopyRepository.moveCopy: cópia ${id} não encontrada`);
    const db = await this._getDb();
    const occupant = await this._checkSlotOccupant(db, { collectionId: copy.collectionId, pageNumber, slotIndex, excludeId: id });
    if (occupant) return { moved: false, conflict: true, occupantId: occupant.id };

    const now = new Date().toISOString();
    await db.runAsync(`UPDATE owned_card_copies SET page_number = ?, slot_index = ?, updated_at = ? WHERE id = ?`, [
      pageNumber,
      slotIndex,
      now,
      id,
    ]);
    return { moved: true, conflict: false, copy: await this.getById(id) };
  }

  /** Troca a posição de duas cópias do MESMO fichário, atomicamente (especificação, seção 7.3). */
  async swapCopies(idA, idB) {
    const db = await this._getDb();
    const [a, b] = [await this.getById(idA), await this.getById(idB)];
    if (!a || !b) throw new Error("PhysicalCopyRepository.swapCopies: cópia não encontrada");
    if (a.collectionId !== b.collectionId) throw new Error("PhysicalCopyRepository.swapCopies: cópias precisam estar no mesmo fichário");

    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      // Posição temporária (fora da grade) evita colidir com o índice único parcial durante a troca.
      await db.runAsync(`UPDATE owned_card_copies SET page_number = NULL, slot_index = NULL, updated_at = ? WHERE id = ?`, [now, idA]);
      await db.runAsync(`UPDATE owned_card_copies SET page_number = ?, slot_index = ?, updated_at = ? WHERE id = ?`, [
        a.pageNumber,
        a.slotIndex,
        now,
        idB,
      ]);
      await db.runAsync(`UPDATE owned_card_copies SET page_number = ?, slot_index = ?, updated_at = ? WHERE id = ?`, [
        b.pageNumber,
        b.slotIndex,
        now,
        idA,
      ]);
    });
    return { swapped: true };
  }

  /**
   * Transfere para outro fichário (ou para "Sem fichário" com
   * collectionId: null) — especificação, seção 3.2/7.4: muda localização,
   * NUNCA cria/exclui a cópia. A associação ao item de checklist antigo é
   * limpa (pertencia ao fichário de origem); uma nova associação, se houver,
   * é responsabilidade de uma chamada separada a updateCopy().
   */
  async transferCopy(id, { collectionId, pageNumber = null, slotIndex = null }) {
    const db = await this._getDb();
    const occupant = await this._checkSlotOccupant(db, { collectionId, pageNumber, slotIndex, excludeId: id });
    if (occupant) return { transferred: false, conflict: true, occupantId: occupant.id };

    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE owned_card_copies
         SET collection_id = ?, page_number = ?, slot_index = ?, checklist_item_id = NULL, updated_at = ?
       WHERE id = ?`,
      [collectionId, pageNumber, slotIndex, now, id]
    );
    return { transferred: true, conflict: false, copy: await this.getById(id) };
  }

  /** Remoção lógica (soft delete) — nunca apaga outras cópias da mesma impressão (especificação, seção 12.4). */
  async removeCopy(id) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE owned_card_copies SET deleted_at = ?, checklist_item_id = NULL, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
    return { removed: true };
  }

  /** Totais do inventário inteiro (especificação, seção 9.2) — delega ao cálculo puro. */
  async getCounts() {
    const allActive = await this.list({});
    return calculateInventoryTotals(allActive);
  }
}

module.exports = { PhysicalCopyRepository };
