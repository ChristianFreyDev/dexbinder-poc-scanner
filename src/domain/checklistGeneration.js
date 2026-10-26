/**
 * Geração/regeneração de checklist — lógica pura (especificação da Entrega
 * 2, seções 5, 6, 10). Não toca SQLite nem a API do TCGdex: recebe listas já
 * carregadas (espécies selecionadas, registros do catálogo de um set) e
 * devolve "especificações de item" prontas para o ChecklistRepository
 * persistir. IDs/timestamps são responsabilidade do repositório.
 */

const { naturalCompare } = require("../scanner/naturalSort");
const { buildCatalogCardKey } = require("./catalogCardKey");

/** Espécies -> itens ordenados pelo número nacional, sem duplicar (especificação, seção 5.1-A). */
function generateSpeciesChecklistItems(speciesList) {
  const seen = new Set();
  const unique = speciesList.filter((s) => {
    if (seen.has(s.nationalNumber)) return false;
    seen.add(s.nationalNumber);
    return true;
  });
  const sorted = [...unique].sort((a, b) => a.nationalNumber - b.nationalNumber);
  return sorted.map((s, idx) => ({
    targetType: "pokemon_species",
    nationalDexNumber: s.nationalNumber,
    catalogCardKey: null,
    targetLabelSnapshot: s.label || null,
    targetSetSnapshot: null,
    targetNumberSnapshot: null,
    targetLanguageSnapshot: null,
    sortOrder: idx + 1,
    source: "automatic",
  }));
}

/**
 * Um registro conta como "escopo oficial" (especificação, seção 10) se o
 * localId for puramente numérico e menor ou igual à contagem oficial do set
 * (`setOfficial`) — sem truncar a string (nunca `parseInt` de um prefixo
 * arbitrário): um `localId` alfanumérico (ex.: "GG01") nunca é oficial, só
 * aparece no escopo `complete_catalog`.
 */
function isWithinOfficialScope(record) {
  if (!/^\d+$/.test(String(record.localId ?? ""))) return false;
  if (!record.setOfficial) return false;
  return Number(record.localId) <= record.setOfficial;
}

/**
 * Registros do catálogo (uma ou mais impressões, já pré-filtrados pelo
 * repositório para o set×idioma(s) elegível) -> itens de checklist de
 * impressão (especificação, seções 5.1-B, 6.3, 10).
 *
 * `languagePolicy "specific"`: 1 item por registro (já deve vir filtrado a
 * UM idioma pelo chamador).
 * `languagePolicy "any_supported"`: agrupa por (setId, localId) — identidade
 * real e já validada (mesmo set_id literal) — 1 item representa a posição
 * impressa em QUALQUER dos idiomas presentes nos registros recebidos.
 */
function generateCardChecklistItems(records, { scope = "complete_catalog", languagePolicy = "specific" } = {}) {
  const scoped = scope === "official" ? records.filter(isWithinOfficialScope) : records;

  if (languagePolicy === "any_supported") {
    const groups = new Map();
    for (const r of scoped) {
      const key = `${r.setId}::${r.localId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const items = [...groups.values()].map((group) => {
      // Rótulo: prefere português (se presente no grupo), senão o primeiro registro.
      const preferred = group.find((r) => r.sourceLanguage === "pt") || group[0];
      return {
        targetType: "catalog_card",
        nationalDexNumber: null,
        catalogCardKey: null,
        targetLabelSnapshot: preferred.name || null,
        targetSetSnapshot: preferred.setId,
        targetNumberSnapshot: preferred.localId,
        targetLanguageSnapshot: null,
        sortOrder: 0,
        source: "automatic",
      };
    });
    items.sort((a, b) => naturalCompare(a.targetNumberSnapshot, b.targetNumberSnapshot));
    return items.map((it, idx) => ({ ...it, sortOrder: idx + 1 }));
  }

  const sorted = [...scoped].sort((a, b) => naturalCompare(a.localId, b.localId));
  return sorted.map((r, idx) => ({
    targetType: "catalog_card",
    nationalDexNumber: null,
    catalogCardKey: buildCatalogCardKey({
      sourceLanguage: r.sourceLanguage,
      sourceCardId: r.sourceCardId,
      sourceSetId: r.setId,
      localId: r.localId,
    }),
    targetLabelSnapshot: r.name || null,
    targetSetSnapshot: r.setId,
    targetNumberSnapshot: r.localId,
    targetLanguageSnapshot: r.sourceLanguage,
    sortOrder: idx + 1,
    source: "automatic",
  }));
}

/** Chave de identidade de ALVO (não de linha) — usada para achar duplicatas e comparar regeneração. */
function itemTargetKey(item) {
  if (item.targetType === "pokemon_species") return `species:${item.nationalDexNumber}`;
  if (item.catalogCardKey) return `card:${item.catalogCardKey}`;
  return `cardset:${item.targetSetSnapshot}::${item.targetNumberSnapshot}`;
}

/**
 * Acha um item ATIVO (não excluído) já existente com o mesmo alvo do
 * candidato — especificação, seção 4.2: "se o usuário tentar adicionar o
 * mesmo alvo duas vezes, explicar e pedir confirmação em vez de duplicar
 * silenciosamente".
 */
function findDuplicateTarget(existingItems, candidateSpec) {
  const key = itemTargetKey(candidateSpec);
  return existingItems.find((it) => !it.isExcluded && itemTargetKey(it) === key) || null;
}

/**
 * Prévia de regeneração automática (especificação, seções 5.2, 12.3): nunca
 * aplica sozinha — só compara o estado atual com uma nova geração do
 * catálogo e devolve o que mudaria, para confirmação explícita do usuário.
 *
 * - Itens `manual_added` NUNCA entram em toRemove (preservados sempre).
 * - Itens já excluídos (`isExcluded`) NUNCA voltam sozinhos (exclusão
 *   deliberada preservada) — não aparecem em toAdd nem em toRemove.
 * - Só itens `automatic` ativos cujo alvo sumiu do catálogo entram em
 *   toRemove.
 * - Alvos novos que o catálogo passou a ter entram em toAdd.
 */
function previewChecklistRegeneration(existingItems, freshItemSpecs) {
  const existingKeys = new Set(existingItems.map(itemTargetKey));
  const freshKeys = new Set(freshItemSpecs.map(itemTargetKey));

  const toAdd = freshItemSpecs.filter((spec) => !existingKeys.has(itemTargetKey(spec)));

  const toRemove = existingItems.filter(
    (it) => it.source === "automatic" && !it.isExcluded && !freshKeys.has(itemTargetKey(it))
  );

  const toKeep = existingItems.filter((it) => {
    if (it.source === "manual_added") return true;
    if (it.isExcluded) return true;
    return freshKeys.has(itemTargetKey(it));
  });

  return { toAdd, toRemove, toKeep };
}

module.exports = {
  generateSpeciesChecklistItems,
  generateCardChecklistItems,
  isWithinOfficialScope,
  itemTargetKey,
  findDuplicateTarget,
  previewChecklistRegeneration,
};
