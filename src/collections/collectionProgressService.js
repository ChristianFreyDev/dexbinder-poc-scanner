/**
 * CollectionProgressService — orquestra os repositórios para responder às
 * perguntas de progresso/estado que a UI precisa, sem a UI nunca calcular
 * nada sozinha nem tocar SQL (especificação da Entrega 2, seção 4.4/9).
 */
const { CollectionRepository } = require("./collectionRepository");
const { ChecklistRepository } = require("./checklistRepository");
const { PhysicalCopyRepository } = require("./physicalCopyRepository");
const { CardSpeciesRepository } = require("./cardSpeciesRepository");
const {
  calculateCollectionProgress,
  calculateInventoryTotals,
  calculatePokedexGlobalProgress,
} = require("../domain/progressCalculations");
const { buildCatalogCardKey } = require("../domain/catalogCardKey");

class CollectionProgressService {
  constructor({ db = null } = {}) {
    this.collections = new CollectionRepository(db);
    this.checklists = new ChecklistRepository(db);
    this.copies = new PhysicalCopyRepository(db);
    this.speciesLinks = new CardSpeciesRepository(db);
  }

  async getCollectionProgress(collectionId) {
    const [checklistItems, copiesInCollection, confirmedLinksByCardKey] = await Promise.all([
      this.checklists.listItems(collectionId, { includeExcluded: false }),
      this.copies.list({ collectionId }),
      this.speciesLinks.getConfirmedLinksMap(),
    ]);
    return calculateCollectionProgress({ checklistItems, copiesInCollection, confirmedLinksByCardKey });
  }

  async getInventoryTotals() {
    const allActive = await this.copies.list({});
    return calculateInventoryTotals(allActive);
  }

  async getPokedexGlobalProgress(totalSpecies) {
    const [allActive, confirmedLinksByCardKey] = await Promise.all([
      this.copies.list({}),
      this.speciesLinks.getConfirmedLinksMap(),
    ]);
    return calculatePokedexGlobalProgress({ totalSpecies, activeCopies: allActive, confirmedLinksByCardKey });
  }

  /**
   * Cópias físicas (com localização) que representam uma espécie confirmada
   * (especificação, seção 8.6: "ao abrir uma espécie, mostrar as cópias
   * físicas que a representam, agrupadas por impressão e com localização").
   */
  async getCopiesForSpecies(nationalDexNumber) {
    const [allActive, cardKeys] = await Promise.all([
      this.copies.list({}),
      this.speciesLinks.getCardKeysForSpecies(nationalDexNumber),
    ]);
    const keys = new Set(cardKeys);
    return allActive.filter((c) => keys.has(c.catalogCardKey));
  }

  /**
   * Estado real da coleção para um candidato CONFIRMADO do Garimpo
   * (especificação, seção 8.9): cópias já existentes dessa impressão exata e
   * onde estão, fichários que a impressão já completa, fichários ativos que
   * ainda precisam dela, e o estado da espécie na Pokédex global (só se a
   * associação já estiver confirmada).
   */
  async getConfirmedCardStatus(record) {
    const catalogCardKey = buildCatalogCardKey({
      sourceLanguage: record.sourceLanguage,
      sourceCardId: record.sourceCardId,
      sourceSetId: record.setId,
      localId: record.localId,
    });

    const [existingCopies, activeCollections, confirmedLinks, speciesLinksForCard] = await Promise.all([
      this.copies.list({ catalogCardKey }),
      this.collections.list({ includeArchived: false }),
      this.speciesLinks.getConfirmedLinksMap(),
      this.speciesLinks.getAssociations(catalogCardKey),
    ]);

    const collectionsById = new Map(activeCollections.map((c) => [c.id, c]));
    const existingCopiesWithLocation = existingCopies.map((c) => ({
      ...c,
      collectionName: c.collectionId ? (collectionsById.get(c.collectionId)?.name ?? "(fichário arquivado)") : null,
    }));

    const collectionsCompletedByThis = [];
    const collectionsNeedingThis = [];
    for (const collection of activeCollections) {
      const items = await this.checklists.listItems(collection.id, { includeExcluded: false });
      const matchingItem = items.find(
        (it) =>
          it.targetType === "catalog_card" &&
          (it.catalogCardKey === catalogCardKey || (!it.catalogCardKey && it.targetSetSnapshot === record.setId && it.targetNumberSnapshot === record.localId))
      );
      if (!matchingItem) continue;
      const copiesHere = await this.copies.list({ collectionId: collection.id });
      const progress = calculateCollectionProgress({
        checklistItems: [matchingItem],
        copiesInCollection: copiesHere,
        confirmedLinksByCardKey: confirmedLinks,
      });
      if (progress.completedItems > 0) collectionsCompletedByThis.push({ collectionId: collection.id, name: collection.name });
      else collectionsNeedingThis.push({ collectionId: collection.id, name: collection.name, checklistItemId: matchingItem.id });
    }

    const confirmedDexNumbers = speciesLinksForCard.filter((l) => l.associationStatus === "confirmed").map((l) => l.nationalDexNumber);

    return {
      catalogCardKey,
      existingCopies: existingCopiesWithLocation,
      collectionsCompletedByThis,
      collectionsNeedingThis,
      speciesAssociation:
        confirmedDexNumbers.length > 0 ? { confirmed: true, nationalDexNumbers: confirmedDexNumbers } : { confirmed: false, nationalDexNumbers: [] },
    };
  }
}

module.exports = { CollectionProgressService };
