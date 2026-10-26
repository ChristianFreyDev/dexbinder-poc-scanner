/**
 * Cálculos de progresso — lógica pura e centralizada (especificação da
 * Entrega 2, seção 9: "implementar regras puras/testáveis, sem duplicá-las
 * em várias telas"). Nenhuma função aqui toca SQLite; recebem arrays/Sets já
 * carregados pelos repositórios e devolvem números prontos para a UI.
 *
 * Regras de conclusão replicadas da especificação (seção 6.1/9):
 * - Item de espécie: completo se há cópia ativa com associação CONFIRMED a
 *   essa espécie (associações `suggested` nunca contam).
 * - Item de impressão (idioma específico): completo se há cópia ativa com a
 *   mesma catalog_card_key.
 * - Item de impressão (política any_supported): completo se há cópia ativa
 *   com o mesmo set real + número real impresso (target_set_snapshot/
 *   target_number_snapshot), em qualquer idioma — nunca por nome parecido.
 * - Item personalizado (`custom`) sem espécie/impressão associada não entra
 *   no cálculo automático (fica como nota, especificação seção 5.1-C/9.1).
 */

function safePercentage(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

/** Chave de agrupamento "set real + número real", usada pela política any_supported (seção 6.3). */
function setNumberKey(setId, localId) {
  return `${setId ?? ""}::${localId ?? ""}`;
}

/**
 * A partir das cópias ATIVAS de uma coleção (ou do inventário inteiro, para
 * a Pokédex global), monta os três conjuntos de "o que esta coleção/
 * inventário realmente tem", usados para checar conclusão de item:
 * - cardKeys: catalog_card_key exatas presentes.
 * - setNumberPairs: pares set+número (qualquer idioma) presentes.
 * - confirmedDexNumbers: espécies com associação CONFIRMED representadas.
 *
 * @param {Array<{catalogCardKey, sourceSetId, localId}>} copies
 * @param {Map<string, Set<number>>} confirmedLinksByCardKey catalogCardKey -> Set(nationalDexNumber), só vínculos `confirmed`
 */
function buildOwnershipIndex(copies, confirmedLinksByCardKey = new Map()) {
  const cardKeys = new Set();
  const setNumberPairs = new Set();
  const confirmedDexNumbers = new Set();

  for (const copy of copies) {
    if (copy.catalogCardKey) cardKeys.add(copy.catalogCardKey);
    setNumberPairs.add(setNumberKey(copy.sourceSetId, copy.localId));
    const dexNumbers = confirmedLinksByCardKey.get(copy.catalogCardKey);
    if (dexNumbers) for (const n of dexNumbers) confirmedDexNumbers.add(n);
  }

  return { cardKeys, setNumberPairs, confirmedDexNumbers };
}

/** Só os itens de checklist ativos e "computáveis" (espécie ou impressão) — itens custom puros ficam de fora do cálculo automático. */
function computableActiveItems(checklistItems) {
  return checklistItems.filter((item) => !item.isExcluded && (item.targetType === "pokemon_species" || item.targetType === "catalog_card"));
}

function isItemComplete(item, ownership) {
  if (item.targetType === "pokemon_species") {
    return ownership.confirmedDexNumbers.has(item.nationalDexNumber);
  }
  if (item.targetType === "catalog_card") {
    if (item.catalogCardKey) return ownership.cardKeys.has(item.catalogCardKey);
    return ownership.setNumberPairs.has(setNumberKey(item.targetSetSnapshot, item.targetNumberSnapshot));
  }
  return false;
}

/**
 * Progresso de UM fichário (especificação, seção 9.1). `copiesInCollection`
 * deve conter só cópias ATIVAS (deleted_at IS NULL) atribuídas a este
 * collection_id — filtragem é responsabilidade do repositório.
 */
function calculateCollectionProgress({ checklistItems, copiesInCollection, confirmedLinksByCardKey = new Map() }) {
  const items = computableActiveItems(checklistItems);
  const ownership = buildOwnershipIndex(copiesInCollection, confirmedLinksByCardKey);

  const completedItems = items.filter((item) => isItemComplete(item, ownership)).length;
  const totalChecklistItems = items.length;
  const missingItems = totalChecklistItems - completedItems;

  const unplacedCopies = copiesInCollection.filter((c) => c.pageNumber == null).length;
  // Cada item concluído "consome" conceitualmente 1 cópia; o restante das
  // cópias da coleção é excedente/duplicata (especificação, seção 9.1).
  const extraPhysicalCopies = Math.max(0, copiesInCollection.length - completedItems);

  return {
    totalChecklistItems,
    completedItems,
    missingItems,
    completionPercentage: safePercentage(completedItems, totalChecklistItems),
    extraPhysicalCopies,
    unplacedCopies,
  };
}

/** Totais do inventário geral (especificação, seção 9.2) — conta CÓPIAS, nunca registros de catálogo nem checklists. */
function calculateInventoryTotals(activeCopies) {
  const byCollection = new Map();
  const bySet = new Map();
  const byLanguage = new Map();
  const distinctPrints = new Set();
  let unassignedCopies = 0;
  let awaitingPlacementCopies = 0;

  for (const copy of activeCopies) {
    distinctPrints.add(copy.catalogCardKey);
    const collectionKey = copy.collectionId ?? "__unassigned__";
    byCollection.set(collectionKey, (byCollection.get(collectionKey) || 0) + 1);
    if (copy.sourceSetId) bySet.set(copy.sourceSetId, (bySet.get(copy.sourceSetId) || 0) + 1);
    if (copy.sourceLanguage) byLanguage.set(copy.sourceLanguage, (byLanguage.get(copy.sourceLanguage) || 0) + 1);

    if (copy.collectionId == null) unassignedCopies += 1;
    else if (copy.pageNumber == null) awaitingPlacementCopies += 1;
  }

  return {
    totalPhysicalCopies: activeCopies.length,
    distinctPrints: distinctPrints.size,
    unassignedCopies,
    awaitingPlacementCopies,
    byCollection,
    bySet,
    byLanguage,
  };
}

/**
 * Progresso da Pokédex GLOBAL (especificação, seção 9.3): conta espécies
 * DISTINTAS com associação confirmada representadas em QUALQUER cópia ativa
 * do inventário inteiro (inclusive sem fichário) — nunca exemplares/impressões.
 */
function calculatePokedexGlobalProgress({ totalSpecies, activeCopies, confirmedLinksByCardKey = new Map() }) {
  const ownership = buildOwnershipIndex(activeCopies, confirmedLinksByCardKey);
  const obtainedSpeciesCount = ownership.confirmedDexNumbers.size;
  return {
    obtainedSpeciesCount,
    missingSpeciesCount: Math.max(0, totalSpecies - obtainedSpeciesCount),
    completionPercentage: safePercentage(obtainedSpeciesCount, totalSpecies),
    obtainedDexNumbers: ownership.confirmedDexNumbers,
  };
}

module.exports = {
  safePercentage,
  setNumberKey,
  buildOwnershipIndex,
  computableActiveItems,
  isItemComplete,
  calculateCollectionProgress,
  calculateInventoryTotals,
  calculatePokedexGlobalProgress,
};
