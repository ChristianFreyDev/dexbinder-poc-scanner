/**
 * CardSpeciesRepository — associação carta (impressão) -> espécie
 * (especificação da Entrega 2, seção 3.4, 4.2): só vínculos `confirmed`
 * contam para progresso; `suggested` é só uma dica de UI, nunca persistida
 * como posse confirmada.
 */
const { mapSpeciesLinkRow } = require("../storage/userRowMapping");
const { suggestSpeciesForCardName } = require("../domain/speciesSuggestion");

class CardSpeciesRepository {
  constructor(db = null) {
    this._db = db;
  }

  async _getDb() {
    if (!this._db) this._db = await require("../storage/userDb").getUserDb();
    return this._db;
  }

  async getAssociations(catalogCardKey) {
    const db = await this._getDb();
    const rows = await db.getAllAsync(`SELECT * FROM card_species_links WHERE catalog_card_key = ?`, [catalogCardKey]);
    return rows.map(mapSpeciesLinkRow);
  }

  /** Sugestão por nome (nunca confirmada automaticamente) — ver src/domain/speciesSuggestion.js. */
  suggestAssociations(cardName, nationalDexSpecies, options) {
    return suggestSpeciesForCardName(cardName, nationalDexSpecies, options);
  }

  /**
   * Confirma (ou reconfirma) o vínculo carta->espécie por ação EXPLÍCITA do
   * usuário (especificação, seção 3.4). Permite múltiplas espécies
   * confirmadas para a mesma carta (cartas que representam mais de uma
   * espécie) — cada par (catalog_card_key, national_dex_number) é sua
   * própria linha; esta chamada nunca remove outras espécies já confirmadas
   * para a mesma carta.
   */
  async confirmAssociation({ catalogCardKey, nationalDexNumber, source = "user_confirmed" }) {
    const db = await this._getDb();
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO card_species_links (catalog_card_key, national_dex_number, association_status, association_source, created_at, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(catalog_card_key, national_dex_number)
       DO UPDATE SET association_status = 'confirmed', association_source = excluded.association_source, updated_at = excluded.updated_at`,
      [catalogCardKey, nationalDexNumber, "confirmed", source, now, now]
    );
    return { confirmed: true };
  }

  async removeAssociation({ catalogCardKey, nationalDexNumber }) {
    const db = await this._getDb();
    await db.runAsync(`DELETE FROM card_species_links WHERE catalog_card_key = ? AND national_dex_number = ?`, [
      catalogCardKey,
      nationalDexNumber,
    ]);
    return { removed: true };
  }

  /** catalogCardKeys confirmados para UMA espécie (especificação, seção 8.6: cópias que representam a espécie). */
  async getCardKeysForSpecies(nationalDexNumber) {
    const db = await this._getDb();
    const rows = await db.getAllAsync(
      `SELECT catalog_card_key FROM card_species_links WHERE national_dex_number = ? AND association_status = 'confirmed'`,
      [nationalDexNumber]
    );
    return rows.map((r) => r.catalog_card_key);
  }

  /** Mapa catalogCardKey -> Set(nationalDexNumber), só vínculos `confirmed` — insumo direto de progressCalculations.js. */
  async getConfirmedLinksMap() {
    const db = await this._getDb();
    const rows = await db.getAllAsync(`SELECT * FROM card_species_links WHERE association_status = 'confirmed'`);
    const map = new Map();
    for (const row of rows.map(mapSpeciesLinkRow)) {
      if (!map.has(row.catalogCardKey)) map.set(row.catalogCardKey, new Set());
      map.get(row.catalogCardKey).add(row.nationalDexNumber);
    }
    return map;
  }
}

module.exports = { CardSpeciesRepository };
